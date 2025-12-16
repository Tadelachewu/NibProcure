# Procurement Workflow Scenarios

This document outlines key scenarios to demonstrate the application's end-to-end procurement logic, from requisition to final payment.

---

### **Scenario 1: Standard Single-Vendor Award ("Happy Path")**

This flow outlines the simplest end-to-end procurement process for a high-value item requiring multiple levels of approval.

1.  **Requisition:** A Requester submits a high-value purchase requisition for new servers.
2.  **Department Approval:** The Requester's Department Head approves it. The status changes to `PreApproved`.
3.  **RFQ & Bidding:** The Procurement Officer sends out an RFQ. Three vendors submit quotes before the deadline.
4.  **Committee Scoring:** The assigned committee scores all three quotes. When all scores are in, the status becomes `Scoring_Complete`.
5.  **Award Finalization:** The Procurement Officer views the ranked results and finalizes the award to the single highest-scoring vendor.
6.  **Hierarchical Review:**
    *   Because the total value is high, the system routes the award to **Committee A** for review (`Pending_Committee_A_Recommendation`).
    *   After Committee A approves, it moves to the **VP of Resources** (`Pending_VP_Approval`).
    *   The VP gives the final approval.
7.  **Vendor Notification:** The status becomes `PostApproved`. The Procurement Officer notifies the winning vendor. The status changes to `Awarded`.
8.  **Vendor Acceptance:** The vendor accepts the award. The system automatically creates a Purchase Order, and the requisition status becomes `PO_Created`.
9.  **Fulfillment:** The goods are delivered (`Delivered`), an invoice is submitted and paid (`Paid`), and the requisition status finally becomes `Closed`.

---

### **Scenario 2: Complex Per-Item Award with Exception Handling**

This scenario demonstrates the resilience of the per-item award strategy, involving multiple vendors, a declined award, and the promotion of a standby vendor.

1.  **Requisition:** A Requester submits a requisition for two distinct items: 10 Laptops and 10 Monitors.
2.  **RFQ & Scoring:** The RFQ is sent out. After bidding and scoring, the Procurement Officer chooses the "Award by Best Offer (Per Item)" strategy.
    *   **Dell** has the highest score for the Laptops.
    *   **HP** has the highest score for the Monitors.
    *   Apple is the second-best (standby) for both items.
3.  **Award Finalization:** The Officer finalizes the awards. The total value requires review by **Committee B**.
4.  **Hierarchical Review:** Committee B approves the split award. The status becomes `PostApproved`.
5.  **Vendor Notification:** The Officer notifies both Dell and HP.
    *   The `perItemAwardDetails` for the Laptop item now show Dell as `Awarded`.
    *   The `perItemAwardDetails` for the Monitor item now show HP as `Awarded`.
6.  **Split Vendor Response:**
    *   **HP accepts** the award for the Monitors. A Purchase Order (**PO-001**) is immediately generated for HP for the 10 monitors.
    *   **Dell declines** the award for the Laptops. The status for their bid on the Laptop item becomes `Declined`. The main requisition status becomes `Award_Declined`.
7.  **Standby Promotion:** The Procurement Officer sees the "Award Declined" status and chooses to **Promote Standby Vendor**.
    *   The system looks at the Laptop item, sees Dell's bid is `Declined`, and finds that Apple is the next in line (`Standby`).
    *   Apple's bid status for the Laptop item is changed to `Pending_Award`.
    *   The total value of the requisition is **recalculated** to only include the value of the 10 Laptops. This new, lower value requires only a "Managerial Approval".
    *   The requisition status becomes `Pending_Managerial_Approval`.
8.  **Re-Approval & Acceptance:**
    *   The Procurement Manager approves the new award to Apple.
    *   Apple is notified and **accepts** the award. A second Purchase Order (**PO-002**) is generated for Apple for the 10 laptops.
9.  **Final Fulfillment:**
    *   Both HP and Apple deliver their items and submit invoices.
    *   As each respective payment is processed, the system checks the parent requisition.
    *   Only after the final payment for the **last item** (e.g., Apple's laptops) is processed does the system mark the parent requisition as `Closed`. The process is now fully complete.

---

### **Scenario 3: Initial Receipt of Damaged Goods**

This scenario outlines how the system handles defective items discovered during the initial receiving process, triggering an immediate rejection of the award for that item.

1.  **Context:** A Purchase Order has been issued to a vendor for 5 Laptops and 5 Keyboards.
2.  **Goods Delivery:** The vendor delivers the items. The Storekeeper (David) inspects them. He finds that 2 of the 5 keyboards are physically cracked.
3.  **Storekeeper Action:**
    *   David logs into the system and navigates to the "Receive Goods" page.
    *   He selects the correct Purchase Order.
    *   For the "Laptops" item, he enters `5` in the "Quantity Received" field and leaves the condition as "Good".
    *   For the "Keyboards" item, he enters `2` in the "Quantity Received" field and sets the condition to **"Damaged"**. The "Notes" field for this item becomes mandatory.
    *   In the notes, he writes: "Two keyboards have cracked casings. S/N: KBD-001, KBD-002."
    *   He clicks **"Log Received Goods"**.
4.  **System Response (Automated):**
    *   A `GoodsReceiptNote` is created with a `Processed` status. It serves as a record of what was physically received.
    *   The system detects that an item was marked as "Damaged". It immediately triggers the **`handleAwardRejection` service**.
    *   The award status for the "Keyboards" item on the parent `PurchaseRequisition` is automatically changed to **"Declined"**.
    *   The overall status of the `PurchaseRequisition` is updated to **"Award_Declined"**.
    *   The Procurement Officer (Charlie) is notified of the award rejection.
5.  **Outcome:**
    *   The issue is now with the procurement team, not finance. The vendor has failed to fulfill their awarded contract for the keyboards.
    *   The Procurement Officer can now open the Quotation page for this requisition, see the "Award Declined" status, and decide whether to **Promote a Standby Vendor** for the keyboards or **Restart the RFQ** process for that specific item.
    *   The invoice workflow is **prevented** from starting for the disputed items, ensuring the bank does not pay for defective goods.

---

### **Scenario 4: Corrective Resubmission After Finance Dispute**

This scenario shows the distinct workflow that occurs when the Finance team, not the initial receiver, disputes an invoice, forcing a re-verification at the receiving end.

1.  **Context:** A vendor has delivered goods, the Storekeeper has logged them as "Good", and an invoice has been submitted. During the three-way match, the Finance officer (Eve) notices a price discrepancy.
2.  **Finance Action:**
    *   Eve navigates to the "Invoices" page and opens the invoice in question.
    *   She clicks the **"Dispute"** button.
    *   In the dialog, she provides a reason: "Unit price on invoice for item 'XYZ' does not match the unit price on the Purchase Order."
    *   Crucially, she checks the box labeled **"Return to Receiving for re-verification"**.
    *   She submits the dispute.
3.  **System Response (Automated):**
    *   The Invoice status is set to `Disputed`.
    *   The system finds the latest `GoodsReceiptNote` (GRN) associated with the invoice's Purchase Order and updates its status to **`Disputed`**.
    *   The disputed Purchase Order now reappears in the Storekeeper's "Receive Goods" dropdown list.
4.  **Storekeeper Action (Corrective Resubmission):**
    *   The Storekeeper (David) is notified to re-verify the delivery.
    *   He navigates to the "Receive Goods" page and selects the disputed PO.
    *   The form now displays a yellow alert banner indicating **"This Order was Disputed by Finance"**.
    *   The submit button now reads **"Confirm & Re-Submit Receipt"**.
    *   David physically re-counts the items, confirms the quantities, and re-submits the GRN form with the correct information.
5.  **Outcome:**
    *   A **new** `GoodsReceiptNote` is created with a `Processed` status.
    *   The old, disputed GRN remains in the system for audit purposes but is no longer considered the source of truth.
    *   The `PurchaseOrder` status is updated based on the newly submitted quantities.
    *   The invoice on the Finance page can now be re-matched against the corrected GRN. The dispute is resolved at the receiving level, allowing the payment process to continue once all data aligns.
