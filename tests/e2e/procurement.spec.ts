
import { test, expect, Page } from '@playwright/test';

const REQ_TITLE = `E2E Test - High Value Laptops ${Date.now()}`;
const VENDOR_1_EMAIL = 'tade2024bdugit@gmail.com'; // Apple
const VENDOR_2_EMAIL = 'tade2024bdulin@gmail.com'; // Dell

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(new RegExp(/dashboard|requisitions|approvals|reviews|vendor|approving/));
  console.log(`Logged in as ${email}`);
}

test.describe('Full Procurement Lifecycle E2E Test', () => {
  let requisitionId = '';

  test('should complete the entire procurement flow from requisition to payment', async ({ page }) => {

    // 1. Login as Requester (Alice) and create a requisition
    await test.step('1. Create Requisition', async () => {
      await login(page, 'alice@example.com');
      await page.goto('/new-requisition');
      await page.getByLabel('Requisition Title').fill(REQ_TITLE);
      await page.locator('button[role="combobox"]:has-text("Low")').click();
      await page.getByLabel('Critical').click();
      await page.getByLabel('Business Justification').fill('E2E test justification for new high-value laptops.');
      await page.getByLabel('Item Name').fill('High-Performance Laptop');
      await page.getByLabel('Quantity').fill('150'); // This makes it high value
      await page.locator('input[name="items.0.unitPrice"]').fill('2000');
      
      // Submit for approval directly
      await page.getByRole('button', { name: 'Submit for Approval' }).click();

      // The PATCH request to submit will trigger a toast
      await expect(page.getByText('Requisition submitted for approval')).toBeVisible();

      // Go to requisitions page to find the ID
      await page.goto('/requisitions');
      const reqRow = page.getByRole('row', { name: new RegExp(REQ_TITLE) });
      await expect(reqRow).toBeVisible();

      // Get the requisition ID from the table row for later use
      requisitionId = await reqRow.getByRole('cell').nth(1).innerText();
      expect(requisitionId).toMatch(/REQ-.*/);
      console.log(`Created and submitted requisition ${requisitionId}`);
    });

    // 2. Login as Department Head (Diana, also Admin) and approve the requisition
    await test.step('2. Department Head Approval', async () => {
      await login(page, 'diana@example.com'); // Diana is Alice's manager in seed data
      await page.goto('/approvals');
      await page.getByRole('row', { name: new RegExp(REQ_TITLE) }).getByRole('button', { name: 'Approve' }).click();
      await page.getByLabel('Comment').fill('Approved for E2E test.');
      await page.getByRole('button', { name: 'Submit Approval' }).click();
      await expect(page.getByText(/has been processed/)).toBeVisible();
      console.log(`Requisition ${requisitionId} approved by department head.`);
    });

    // 3. Login as Procurement Officer (Charlie) and manage RFQ
    await test.step('3. Send RFQ', async () => {
      await login(page, 'charlie@example.com');
      await page.goto('/quotations');
      await page.getByRole('row', { name: new RegExp(REQ_TITLE) }).click();
      await expect(page).toHaveURL(new RegExp(`/quotations/${requisitionId}`));
      
      // Assign committee
      await page.getByRole('button', { name: 'Assign Committee' }).click();
      await page.getByLabel('Committee Name').fill('E2E Test Committee');
      await page.getByLabel('Purpose / Mandate').fill('E2E Test Purpose');
      await page.locator('button:has-text("Pick a date")').first().click();
      await page.getByRole('gridcell', { name: '25' }).click(); // Scoring deadline
      
      await page.getByPlaceholder('Search financial members...').fill('Fiona');
      await page.getByLabel('Fiona').click();
      await page.getByPlaceholder('Search technical members...').fill('George');
      await page.getByLabel('George').click();

      await page.getByRole('button', { name: 'Save Committee' }).click();
      await expect(page.getByText('Committee Updated!')).toBeVisible();
      console.log('Committee assigned.');

      // Send RFQ
      await page.locator('button:has-text("Pick a date")').first().click();
      await page.getByRole('gridcell', { name: '20' }).click(); // Quote submission deadline
      await page.getByRole('button', { name: 'Send RFQ' }).click();
      await expect(page.getByText('RFQ Sent!')).toBeVisible();
      console.log('RFQ sent to vendors.');
    });

    // 4. Login as Vendors and submit quotes
    await test.step('4. Submit Quotes', async () => {
      // Vendor 1 (Apple)
      await login(page, VENDOR_1_EMAIL);
      await page.getByRole('link', { name: new RegExp(REQ_TITLE) }).click();
      await page.locator('input[type="number"]').first().fill('1900'); // Higher price
      await page.locator('input[type="number"]').nth(1).fill('10');
      await page.getByRole('button', { name: 'Submit Quotation' }).click();
      await expect(page.getByText('Your quotation has been submitted.')).toBeVisible();
      console.log('Vendor 1 (Apple) submitted quote.');

      // Vendor 2 (Dell)
      await login(page, VENDOR_2_EMAIL);
      await page.getByRole('link', { name: new RegExp(REQ_TITLE) }).click();
      await page.locator('input[type="number"]').first().fill('1850'); // Lower price, should win
      await page.locator('input[type="number"]').nth(1).fill('15');
      await page.getByRole('button', { name: 'Submit Quotation' }).click();
      await expect(page.getByText('Your quotation has been submitted.')).toBeVisible();
      console.log('Vendor 2 (Dell) submitted quote.');
    });
    
    // 5. Login as Committee members and score
    await test.step('5. Score Quotes', async () => {
        // Fiona (Financial)
        await login(page, 'fiona@example.com');
        await page.goto(`/quotations/${requisitionId}`);
        await page.getByRole('button', { name: /Score this Quote/ }).first().click();
        await page.getByRole('slider').first().press('ArrowRight'); // Score 5
        await page.getByRole('button', { name: 'Submit Score' }).click();
        await page.getByRole('button', { name: 'Confirm & Submit' }).click();
        await expect(page.getByText('Scores Submitted')).toBeVisible();

        await page.getByRole('button', { name: /Score this Quote/ }).first().click();
        await page.getByRole('slider').first().press('ArrowRight');
        await page.getByRole('button', { name: 'Submit Score' }).click();
        await page.getByRole('button', { name: 'Confirm & Submit' }).click();
        await expect(page.getByText('Scores Submitted')).toBeVisible();

        await page.getByRole('button', { name: 'Submit Final Scores' }).click();
        await page.getByRole('button', { name: 'Confirm and Submit' }).click();
        await expect(page.getByText('All scores have been successfully submitted.')).toBeVisible();
        console.log('Fiona submitted all scores.');

        // George (Technical)
        await login(page, 'george@example.com');
        await page.goto(`/quotations/${requisitionId}`);
        await page.getByRole('button', { name: /Score this Quote/ }).first().click();
        await page.getByRole('slider').first().press('ArrowRight');
        await page.getByRole('button', { name: 'Submit Score' }).click();
        await page.getByRole('button', { name: 'Confirm & Submit' }).click();
        await expect(page.getByText('Scores Submitted')).toBeVisible();

        await page.getByRole('button', { name: /Score this Quote/ }).first().click();
        await page.getByRole('slider').first().press('ArrowRight');
        await page.getByRole('button', { name: 'Submit Score' }).click();
        await page.getByRole('button', { name: 'Confirm & Submit' }).click();
        await expect(page.getByText('Scores Submitted')).toBeVisible();
        
        await page.getByRole('button', { name: 'Submit Final Scores' }).click();
        await page.getByRole('button', { name: 'Confirm and Submit' }).click();
        await expect(page.getByText('All scores have been successfully submitted.')).toBeVisible();
        console.log('George submitted all scores.');
    });

    // 6. Login as Procurement Officer, finalize award
    await test.step('6. Finalize Award', async () => {
      await login(page, 'charlie@example.com');
      await page.goto(`/quotations/${requisitionId}`);
      await page.getByRole('button', { name: 'Finalize Scores and Award' }).click();
      await page.getByRole('button', { name: 'Award All to Single Vendor' }).click();
      await page.getByRole('button', { name: 'Finalize & Send Awards' }).click();
      await page.getByRole('button', { name: 'Confirm' }).click();
      await expect(page.getByText('scores have been finalized')).toBeVisible();
      await expect(page.getByText('Pending Committee A Recommendation')).toBeVisible();
      console.log('Award finalized and sent for Committee A approval.');
    });
    
     // 7. Login as Committee A Member (Irene), approve award
    await test.step('7. Committee A Award Approval', async () => {
        await login(page, 'irene@example.com');
        await page.goto('/reviews');
        await page.getByRole('row', { name: new RegExp(REQ_TITLE) }).getByRole('button', { name: 'Approve' }).click();
        await page.getByLabel('Justification / Remarks').fill('E2E Test: Committee A recommendation is to approve.');
        await page.getByRole('button', { name: 'Submit Approval' }).click();
        await expect(page.getByText(/Award for requisition .* has been processed./)).toBeVisible();
        console.log('Award approved by Committee A.');
    });
    
    // 8. Login as Director, approve award
    await test.step('8. Director Award Approval', async () => {
        await login(page, 'director.supply@example.com');
        await page.goto('/reviews'); // It appears in their reviews/approvals queue
        await page.getByRole('row', { name: new RegExp(REQ_TITLE) }).getByRole('button', { name: 'Approve' }).click();
        await page.getByLabel('Justification / Remarks').fill('E2E Test: Director approval OK.');
        await page.getByRole('button', { name: 'Submit Approval' }).click();
        await expect(page.getByText(/Award for requisition .* has been processed./)).toBeVisible();
        console.log('Award approved by Director.');
    });

    // 9. Login as VP, approve award
    await test.step('9. VP Award Approval', async () => {
        await login(page, 'vp.resources@example.com');
        await page.goto('/reviews');
        await page.getByRole('row', { name: new RegExp(REQ_TITLE) }).getByRole('button', { name: 'Approve' }).click();
        await page.getByLabel('Justification / Remarks').fill('E2E Test: VP approval OK.');
        await page.getByRole('button', { name: 'Submit Approval' }).click();
        await expect(page.getByText(/Award for requisition .* has been processed./)).toBeVisible();
        console.log('Award approved by VP.');
    });

    // 10. Login as Procurement Officer, notify vendor
    await test.step('10. Notify Vendor', async () => {
        await login(page, 'charlie@example.com');
        await page.goto(`/quotations/${requisitionId}`);
        await page.getByRole('button', { name: 'Send Award Notification' }).click();
        await page.getByRole('button', { name: 'Confirm & Notify' }).click();
        await expect(page.getByText('Vendor Notified')).toBeVisible();
        console.log('Winning vendor has been notified.');
    });

    // 11. Login as Winning Vendor and Accept
    await test.step('11. Accept Award', async () => {
      await login(page, VENDOR_2_EMAIL); // Dell should be the winner (lower price)
      await page.getByRole('link', { name: new RegExp(REQ_TITLE) }).click();
      await page.getByRole('button', { name: 'Accept Award' }).click();
      await page.getByRole('button', { name: 'Confirm' }).click();
      await expect(page.getByText('Award accepted. PO has been generated.')).toBeVisible();
      console.log('Winning vendor accepted the award.');
    });
    
    // 12. Login as Receiving (David) and receive goods
    await test.step('12. Receive Goods', async () => {
        await login(page, 'david@example.com');
        await page.goto('/receive-goods');
        await page.getByRole('combobox').click();
        await page.getByText(new RegExp(REQ_TITLE)).click();
        await page.getByLabel('Quantity Received').fill('150');
        await page.getByRole('button', { name: 'Log Received Goods' }).click();
        await expect(page.getByText('Goods receipt has been logged.')).toBeVisible();
        console.log('Goods have been received.');
    });

    // 13. Login as Finance (Eve), match, and pay
    await test.step('13. Submit, Match, and Pay Invoice', async () => {
        // First, vendor submits invoice
        await login(page, VENDOR_2_EMAIL);
        await page.goto(`/vendor/requisitions/${requisitionId}`);
        await page.getByRole('button', { name: 'Submit Invoice' }).click();
        await page.getByLabel('Invoice Document (PDF)').setInputFiles({
            name: 'test-invoice.pdf',
            mimeType: 'application/pdf',
            buffer: Buffer.from('this is a test pdf file'),
        });
        await page.getByRole('button', { name: 'Submit Invoice' }).click();
        await expect(page.getByText('Invoice Submitted')).toBeVisible();
        console.log('Invoice submitted by vendor.');
        
        // Then, Finance processes it
        await login(page, 'eve@example.com');
        await page.goto('/invoices');
        
        const newInvoiceRow = page.getByRole('row', { name: new RegExp(requisitionId) });
        // Wait for matching to complete
        await expect(newInvoiceRow.getByText('Matched')).toBeVisible();

        await newInvoiceRow.getByRole('button', { name: 'Approve' }).click();
        await expect(page.getByText('Invoice has been marked as Approved for Payment.')).toBeVisible();
        
        await newInvoiceRow.getByRole('button', { name: 'Pay Invoice' }).click();
        await page.getByRole('button', { name: 'Confirm Payment' }).click();
        await expect(page.getByText(/Invoice .* has been paid./)).toBeVisible();
        console.log('Invoice paid. Lifecycle complete.');
    });

  });
});
