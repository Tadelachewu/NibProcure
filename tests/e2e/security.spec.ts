
import { test, expect, Page } from '@playwright/test';

// --- Test Setup ---

const REQ_A_EMAIL = 'alice@example.com';
const REQ_B_EMAIL = 'hannah@example.com'; // Another user with Requester role in seed data
const ADMIN_EMAIL = 'diana@example.com';
const PASSWORD = 'password123';

/**
 * Logs in a user and returns their auth token.
 */
async function loginAndGetToken(page: Page, email: string): Promise<string> {
    const responsePromise = page.waitForResponse('**/api/auth/login');
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    
    const response = await responsePromise;
    const responseBody = await response.json();
    
    await expect(page).toHaveURL(/\/dashboard|\/requisitions/); // Wait for redirect after login
    
    expect(responseBody.token).toBeTruthy();
    console.log(`Successfully logged in as ${email} and obtained token.`);
    return responseBody.token;
}

/**
 * Creates a new DRAFT requisition as the currently logged-in user.
 * Returns the ID of the newly created requisition.
 */
async function createDraftRequisition(page: Page, token: string): Promise<string> {
    const title = `Security Test Draft - ${Date.now()}`;
    const responsePromise = page.waitForResponse('**/api/requisitions');
    
    // Use API to create a draft, which is faster and more reliable for tests
    const response = await page.evaluate(async ({ bearerToken, reqTitle }) => {
        const res = await fetch('/api/requisitions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${bearerToken}`,
            },
            body: JSON.stringify({
                requesterId: '1', // This is ignored by the secure backend, but good to have
                department: 'Design',
                title: reqTitle,
                urgency: 'Low',
                justification: 'Security test',
                items: [{ name: 'Test Item', quantity: 1, unitPrice: 100 }],
                evaluationCriteria: {
                    financialWeight: 50,
                    technicalWeight: 50,
                    financialCriteria: [{ name: 'Price', weight: 100 }],
                    technicalCriteria: [{ name: 'Quality', weight: 100 }],
                },
                status: 'Draft',
            }),
        });
        return res.json();
    }, { bearerToken: token, reqTitle: title });

    const newRequisitionId = response.id;
    expect(newRequisitionId).toMatch(/REQ-.*/);
    console.log(`Created draft requisition ${newRequisitionId} as the logged-in user.`);
    return newRequisitionId;
}


// --- Test Suite ---

test.describe('Security: Privilege Escalation Tests', () => {

  /**
   * HORIZONTAL PRIVILEGE ESCALATION TEST
   * Goal: Ensure a standard user (Requester B) cannot delete a resource owned by another user of the same level (Requester A).
   */
  test('should prevent a user from deleting another user\'s requisition', async ({ page }) => {
    // Step 1: Log in as User A (Alice) and create a resource.
    const aliceToken = await loginAndGetToken(page, REQ_A_EMAIL);
    const aliceRequisitionId = await createDraftRequisition(page, aliceToken);

    // Step 2: Log in as User B (Hannah), who should NOT have access to Alice's resource.
    const hannahToken = await loginAndGetToken(page, REQ_B_EMAIL);
    
    // Step 3: As User B, attempt to directly call the DELETE API on User A's resource.
    console.log(`Attempting to delete requisition ${aliceRequisitionId} as User B...`);
    const deleteResponse = await page.evaluate(async ({ bearerToken, reqId }) => {
        const res = await fetch(`/api/requisitions/${reqId}/delete`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${bearerToken}`,
            },
        });
        return {
            status: res.status,
            body: await res.json().catch(() => ({})),
        };
    }, { bearerToken: hannahToken, reqId: aliceRequisitionId });
    
    // Step 4: Verify the outcome. The API MUST reject the request.
    console.log(`API response status: ${deleteResponse.status}`);
    console.log('API response body:', deleteResponse.body);
    
    // A 403 Forbidden is the most accurate response. A 404 Not Found is also acceptable
    // as it hides the existence of the resource from the unauthorized user.
    // A 2xx status code would be a critical failure.
    expect(deleteResponse.status, "API must return an error status (403 or 404)").toBeGreaterThanOrEqual(400);
    expect(deleteResponse.status).toBeLessThan(500);
    expect(deleteResponse.status, "API must not return a success status (200-299)").not.toBe(200);

    // Step 5: (Optional but good practice) Verify the resource still exists for the original owner.
    await loginAndGetToken(page, ADMIN_EMAIL); // Log in as admin to check all data
    await page.goto('/requisitions');
    await expect(page.getByRole('row', { name: new RegExp(aliceRequisitionId) })).toBeVisible();
    console.log(`Verified that requisition ${aliceRequisitionId} was NOT deleted. Test passed.`);
  });


  /**
   * VERTICAL PRIVILEGE ESCALATION TEST
   * Goal: Ensure a low-privilege user (Requester) cannot perform an action reserved for a high-privilege user (Admin).
   */
  test('should prevent a non-admin user from creating a new department', async ({ page }) => {
    // Step 1: Log in as a non-admin user (Alice).
    const aliceToken = await loginAndGetToken(page, REQ_A_EMAIL);
    
    // Step 2: Attempt to call a privileged API endpoint (/api/departments) directly.
    const newDepartmentName = `E2E-Security-Test-Dept-${Date.now()}`;
    console.log(`Attempting to create department "${newDepartmentName}" as a non-admin...`);

    const createDeptResponse = await page.evaluate(async ({ bearerToken, deptName }) => {
        const res = await fetch('/api/departments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${bearerToken}`,
            },
            body: JSON.stringify({
                name: deptName,
                description: 'This should not be created',
                headId: null,
            }),
        });
        return {
            status: res.status,
            body: await res.json().catch(() => ({})),
        };
    }, { bearerToken: aliceToken, deptName: newDepartmentName });

    // Step 3: Verify the outcome. The API MUST return a 403 Forbidden status.
    console.log(`API response status: ${createDeptResponse.status}`);
    console.log('API response body:', createDeptResponse.body);
    
    expect(createDeptResponse.status, "API must return 403 Forbidden for unauthorized actions.").toBe(403);
    
    // Step 4: Verify the resource was NOT created.
    await loginAndGetToken(page, ADMIN_EMAIL); // Log in as Admin to see all departments
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Departments' }).click();
    await expect(page.getByRole('cell', { name: newDepartmentName, exact: true })).not.toBeVisible();
    console.log(`Verified that department "${newDepartmentName}" was NOT created. Test passed.`);
  });

});
