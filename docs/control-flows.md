# Application Control Flows

This document outlines the primary control flows and state transitions within the Nib InternationalBank Procurement System. The application operates as a state machine, primarily driven by changes to the `status` field of the `PurchaseRequisition` model.

---

## Flow 1: Needs Recognition to RFQ-Ready

This flow covers the initial creation of a requisition by an employee and the first layer of managerial approval.

1.  **Creation (Requester)**
    *   **Actor**: A user with the `Requester` role.
    *   **Action**: Fills out the "New Requisition" form (`/new-requisition`).
    *   **API Call**: `POST /api/requisitions`.
    *   **Initial State**: The system creates a `PurchaseRequisition` record with `status: 'Draft'`.
    *   **Submit Action**: The Requester clicks "Submit for Approval".
    *   **API Call**: `PATCH /api/requisitions`.
    *   **State Change**:
        *   If the Requester is their own Department Head, the status immediately becomes `'PreApproved'`.
        *   Otherwise, the status changes to `'Pending_Approval'`, and the `currentApproverId` field is set to the ID of the Requester's Department Head.

2.  **Departmental Approval (Approver)**
    *   **Actor**: A user with the `Approver` role (typically a Department Head).
    *   **Action**: Navigates to the `/approvals` page, finds the pending requisition, and clicks "Approve".
    *   **API Call**: `PATCH /api/requisitions`.
    *   **State Change**: The status is updated to `'PreApproved'`, and `currentApproverId` is cleared. The requisition is now visible to the Procurement team.

---

## Flow 2: RFQ Distribution and Bidding

Once a requisition is approved by the department, the procurement team takes over to solicit bids from vendors.

1.  **RFQ Configuration (Procurement Officer)**
    *   **Actor**: A user with the `Procurement_Officer` role.
    *   **Action**: Navigates to the `/quotations` page, selects a `PreApproved` requisition, which opens the detailed management page (`/quotations/[id]`).
    *   **Steps**:
        1.  **Assigns an Evaluation Committee**: `POST /api/requisitions/[id]/assign-committee`.
        2.  **Sets a Quotation Deadline**.
        3.  **Chooses a Procurement Method** (e.g., Open Tender, Restricted Tender).
        4.  **Sends the RFQ**: `POST /api/requisitions/[id]/send-rfq`.
    *   **State Change**: The requisition `status` changes to `'Accepting_Quotes'`.

2.  **Quotation Submission (Vendor)**
    *   **Actor**: A registered and verified `Vendor`.
    *   **Action**: Navigates to their dashboard (`/vendor/dashboard`), finds the open RFQ, and submits their pricing and item details.
    *   **API Call**: `POST /api/quotations`.
    *   **Result**: A `Quotation` record is created, linked to the `PurchaseRequisition` and the `Vendor`.

---

## Flow 3: Committee Evaluation

After the bidding deadline passes, the system facilitates the evaluation of submitted quotations by the assigned committee.

1.  **Deadline Passing (System)**
    *   **Trigger**: The `deadline` on the `PurchaseRequisition` is now in the past.
    *   **State Change**: While the status remains `'Accepting_Quotes'`, the UI logic changes to reflect that bidding is closed and evaluation is in progress. The Procurement Officer can now manually move it to the scoring phase.

2.  **Compliance Checks (Committee Member)**
    *   **Actor**: A user with a `Committee_Member` role who has been assigned to this requisition.
    *   **Action**: Navigates to `/compliance/[id]`, reviews each vendor's submission, and marks items as "Comply" or "Non-comply".
    *   **API Call**: `POST /api/quotations/[id]/score`.
    *   **Finalize Action**: After checking all quotes, the member clicks "Submit Final Compliance Checks".
    *   **API Call**: `POST /api/requisitions/[id]/submit-scores`. The system records that this member has completed their task.

3.  **Scoring Completion (System)**
    *   **Trigger**: The system detects that all assigned committee members have submitted their final scores.
    *   **State Change**: The requisition `status` is automatically updated to `'Scoring_Complete'`.

---

## Flow 4: Award and Hierarchical Review

With evaluations complete, the Procurement Officer finalizes the award, which is then routed through a value-based approval chain.

1.  **Award Finalization (Procurement Officer)**
    *   **Actor**: `Procurement_Officer`.
    *   **Action**: Opens the "Award Center" on the quotation page (`/quotations/[id]`) and finalizes the award to the winning vendor(s).
    *   **API Call**: `POST /api/requisitions/[id]/finalize-scores`.

2.  **Hierarchical Routing (System)**
    *   **Trigger**: The `finalize-scores` API is called.
    *   **Logic**: The `award-service` calculates the total value of the award.
        1.  It queries the `ApprovalThreshold` table to find the tier that matches the calculated value.
        2.  It identifies the **first step** in that tier's approval chain.
        3.  **State Change**: The requisition `status` is updated to `'Pending_[RoleName]'` (e.g., `'Pending_Committee_A_Recommendation'`), and the `currentApproverId` is set if the step is assigned to a specific user (not a committee).

3.  **Multi-Step Review (Hierarchical Approvers)**
    *   **Actors**: Users with senior roles (e.g., `Committee_A_Member`, `VP_Resources_and_Facilities`, `President`).
    *   **Action**: Navigate to `/award-reviews` to see pending items.
    *   **Approve Action**: `PATCH /api/requisitions` with `status: 'Approved'`. The system recalculates the *next* step in the chain and updates the status accordingly.
    *   **Reject Action**: `PATCH /api/requisitions` with `status: 'Rejected'`. The system moves the requisition to the *previous* step in the approval chain.

4.  **Final Approval (System)**
    *   **Trigger**: The final approver in the chain for a given tier approves the award.
    *   **State Change**: The `status` is set to `'PostApproved'`.

---

## Flow 5: Vendor Notification and PO Generation

The finalized award is now ready to be sent to the winning vendor.

1.  **Notify Vendor (Procurement Officer)**
    *   **Actor**: `Procurement_Officer`.
    *   **Action**: Clicks "Send Award Notification" for a `PostApproved` requisition.
    *   **API Call**: `POST /api/requisitions/[id]/notify-vendor`.
    *   **State Change**: Requisition `status` becomes `'Awarded'`.

2.  **Vendor Acceptance**
    *   **Actor**: The winning `Vendor`.
    *   **Action**: Logs into the vendor portal, reviews the award, and clicks "Accept Award".
    *   **API Call**: `POST /api/quotations/[id]/respond`.
    *   **State Change**: The `Quotation` status is updated to `'Accepted'`.

3.  **PO Generation (System)**
    *   **Trigger**: The vendor's acceptance.
    *   **Action**: The system automatically creates a new `PurchaseOrder` record.
    *   **State Change**: The `PurchaseRequisition` status is updated to `'PO_Created'`.

---

## Special Flow: PIN-Based Quotation Unsealing

For high-sensitivity RFQs, the system can require director-level verification to unmask vendor pricing information.

1.  **Setup**: A Procurement Officer sends an RFQ with the "Mask Vendor Submissions" option enabled (`rfqSettings.masked: true`).
2.  **PIN Generation**: The Procurement Officer navigates to the quotation page and clicks "Generate PINs".
    *   **API Call**: `POST /api/requisitions/[id]/generate-pins`.
    *   **Action**: The system generates unique, single-use PINs for each required director role and emails them.
3.  **Verification**:
    *   **Actors**: Users with Director-level roles.
    *   **Action**: They receive the PIN and enter it on the quotation page.
    *   **API Call**: `POST /api/requisitions/[id]/verify-pin`.
4.  **Unsealing (System)**:
    *   **Trigger**: The number of unique director verifications meets the configured `unsealThreshold`.
    *   **State Change**: The system updates the `PurchaseRequisition`'s `rfqSettings`, setting `masked` to `false`.
    *   **Result**: All pricing and vendor identity information becomes visible to authorized users (like the committee) on the quotation page.
