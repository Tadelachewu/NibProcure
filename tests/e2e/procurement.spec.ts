
import { test, expect, Page } from '@playwright/test';

const REQ_TITLE = `E2E Test - New Laptops ${Date.now()}`;
const VENDOR_1_EMAIL = 'tade2024bdugit@gmail.com'; // Apple
const VENDOR_2_EMAIL = 'tade2024bdulin@gmail.com'; // Dell

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/dashboard|requisitions|approvals/);
  console.log(`Logged in as ${email}`);
}

test.describe('Full Procurement Lifecycle E2E Test', () => {
  let requisitionId = '';

  test('should complete the entire procurement flow from requisition to payment', async ({ page }) => {

    // 1. Login as Requester (Alice) and create a requisition
    await test.step('Create Requisition', async () => {
      await login(page, 'alice@example.com');
      await page.goto('/new-requisition');
      await page.getByLabel('Requisition Title').fill(REQ_TITLE);
      await page.getByLabel('Urgency').click();
      await page.getByLabel('High', { exact: true }).click();
      await page.getByLabel('Business Justification').fill('E2E test justification for new laptops.');
      await page.getByLabel('Item Name').fill('High-Performance Laptop');
      await page.getByLabel('Quantity').fill('10');
      await page.getByRole('button', { name: 'Save as Draft' }).click();
      await expect(page.getByText('Requisition Submitted')).toBeVisible();
      const url = page.url();
      requisitionId = url.split('/').pop()!;
      expect(requisitionId).toBeTruthy();
      console.log(`Created requisition ${requisitionId}`);
    });

    // 2. Login as Approver (Bob) and approve the requisition
    await test.step('Approve Requisition', async () => {
      await login(page, 'bob@example.com');
      await page.goto('/approvals');
      await page.getByRole('row', { name: new RegExp(REQ_TITLE) }).getByRole('button', { name: 'Approve' }).click();
      await page.getByLabel('Comment').fill('Approved for E2E test.');
      await page.getByRole('button', { name: 'Submit Approval' }).click();
      await expect(page.getByText('Requisition REQ-.* has been processed.')).toBeVisible();
    });

    // 3. Login as Procurement Officer (Charlie) and manage RFQ
    await test.step('Send RFQ', async () => {
      await login(page, 'charlie@example.com');
      await page.goto('/quotations');
      await page.getByRole('row', { name: new RegExp(REQ_TITLE) }).click();
      await expect(page).toHaveURL(new RegExp(`/quotations/${requisitionId}`));
      
      // Assign committee
      await page.getByRole('button', { name: 'Assign Committee' }).click();
      await page.getByLabel('Committee Name').fill('E2E Test Committee');
      await page.getByLabel('Purpose / Mandate').fill('E2E Test Purpose');
      await page.getByRole('button', { name: 'Pick a date' }).click();
      await page.getByRole('button', { name: 'Next' }).click();
      await page.getByRole('gridcell', { name: '15' }).click();
      
      await page.getByPlaceholder('Search financial members...').fill('Fiona');
      await page.getByLabel('Fiona').click();
      await page.getByPlaceholder('Search technical members...').fill('George');
      await page.getByLabel('George').click();

      await page.getByRole('button', { name: 'Save Committee' }).click();
      await expect(page.getByText('Committee Updated!')).toBeVisible();

      // Send RFQ
      await page.getByRole('button', { name: 'Pick a date' }).first().click();
      await page.getByRole('button', { name: 'Next' }).click();
      await page.getByRole('gridcell', { name: '10' }).click();
      await page.getByRole('button', { name: 'Send RFQ' }).click();
      await expect(page.getByText('RFQ Sent!')).toBeVisible();
    });

    // 4. Login as Vendors and submit quotes
    await test.step('Submit Quotes', async () => {
      // Vendor 1 (Apple)
      await login(page, VENDOR_1_EMAIL);
      await page.getByRole('link', { name: new RegExp(REQ_TITLE) }).click();
      await page.getByLabel('Unit Price (ETB)').fill('1500');
      await page.getByLabel('Lead Time (Days)').fill('10');
      await page.getByRole('button', { name: 'Submit Quotation' }).click();
      await expect(page.getByText('Your quotation has been submitted.')).toBeVisible();

      // Vendor 2 (Dell)
      await login(page, VENDOR_2_EMAIL);
      await page.getByRole('link', { name: new RegExp(REQ_TITLE) }).click();
      await page.getByLabel('Unit Price (ETB)').fill('1400');
      await page.getByLabel('Lead Time (Days)').fill('15');
      await page.getByRole('button', { name: 'Submit Quotation' }).click();
      await expect(page.getByText('Your quotation has been submitted.')).toBeVisible();
    });
    
    // 5. Login as Committee members and score
    await test.step('Score Quotes', async () => {
        // Fiona (Financial)
        await login(page, 'fiona@example.com');
        await page.getByRole('row', { name: new RegExp(REQ_TITLE) }).click();
        await page.getByRole('button', { name: 'Score this Quote' }).first().click();
        await page.getByRole('slider').first().press('ArrowRight');
        await page.getByRole('button', { name: 'Submit Score' }).click();
        await page.getByRole('button', { name: 'Confirm & Submit' }).click();
        await expect(page.getByText('Scores Submitted')).toBeVisible();
        await page.getByRole('button', { name: 'Close' }).click(); // Close dialog
        await page.getByRole('button', { name: 'Score this Quote' }).first().click();
        await page.getByRole('slider').first().press('ArrowRight');
        await page.getByRole('button', { name: 'Submit Score' }).click();
        await page.getByRole('button', { name: 'Confirm & Submit' }).click();
        await expect(page.getByText('Scores Submitted')).toBeVisible();

        // George (Technical)
        await login(page, 'george@example.com');
        await page.getByRole('row', { name: new RegExp(REQ_TITLE) }).click();
        await page.getByRole('button', { name: 'Score this Quote' }).first().click();
        await page.getByRole('slider').first().press('ArrowRight');
        await page.getByRole('button', { name: 'Submit Score' }).click();
        await page.getByRole('button', { name: 'Confirm & Submit' }).click();
        await expect(page.getByText('Scores Submitted')).toBeVisible();
        await page.getByRole('button', { name: 'Close' }).click(); // Close dialog
        await page.getByRole('button', { name: 'Score this Quote' }).first().click();
        await page.getByRole('slider').first().press('ArrowRight');
        await page.getByRole('button', { name: 'Submit Score' }).click();
        await page.getByRole('button', { name: 'Confirm & Submit' }).click();
        await expect(page.getByText('Scores Submitted')).toBeVisible();
    });

    // 6. Login as Procurement Officer, finalize award
    await test.step('Finalize Award', async () => {
      await login(page, 'charlie@example.com');
      await page.goto(`/quotations/${requisitionId}`);
      await page.getByRole('button', { name: 'Finalize Scores and Award' }).click();
      await page.getByRole('button', { name: 'Finalize & Send Awards' }).click();
      await page.getByRole('button', { name: 'Confirm' }).click();
      await expect(page.getByText('Scores have been finalized')).toBeVisible();
    });

    // 7. Login as Winning Vendor and Accept
    await test.step('Accept Award', async () => {
      await login(page, VENDOR_2_EMAIL); // Dell should be the winner
      await page.getByRole('link', { name: new RegExp(REQ_TITLE) }).click();
      await page.getByRole('button', { name: 'Accept Award' }).click();
      await page.getByRole('button', { name: 'Confirm' }).click();
      await expect(page.getByText('Award accepted. PO has been generated.')).toBeVisible();
    });
    
    // 8. Login as Receiving (David) and receive goods
    await test.step('Receive Goods', async () => {
        await login(page, 'david@example.com');
        await page.goto('/receive-goods');
        await page.getByRole('combobox').click();
        await page.getByLabel(new RegExp(REQ_TITLE)).click();
        await page.getByLabel('Quantity Received').fill('10');
        await page.getByRole('button', { name: 'Log Received Goods' }).click();
        await expect(page.getByText('Goods receipt has been logged.')).toBeVisible();
    });

    // 9. Login as Finance (Eve), match, and pay
    await test.step('Match and Pay Invoice', async () => {
        await login(page, 'eve@example.com');
        await page.goto('/invoices');
        
        // This part is simplified. In reality, the invoice would be submitted by the vendor.
        // We'll manually create one for the test.
        await page.getByRole('button', { name: 'Add Invoice' }).click();
        await page.getByLabel('Purchase Order').click();
        await page.getByLabel(new RegExp(REQ_TITLE)).click();
        await page.getByRole('button', { name: 'Submit Invoice' }).click();
        await expect(page.getByText('New invoice has been created')).toBeVisible();

        // Find the newly created invoice and process it
        const newInvoiceRow = page.getByRole('row', { name: new RegExp(REQ_TITLE) });
        await newInvoiceRow.getByRole('button', { name: 'Approve' }).click();
        await expect(page.getByText('Invoice has been marked as Approved for Payment.')).toBeVisible();
        await newInvoiceRow.getByRole('button', { name: 'Pay Invoice' }).click();
        await page.getByRole('button', { name: 'Confirm Payment' }).click();
        await expect(page.getByText('Invoice has been paid.')).toBeVisible();
    });

  });
});
