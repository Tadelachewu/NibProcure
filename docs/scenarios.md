# Procurement Workflow Scenarios: From Request to RFQ

This document outlines the initial phase of the procurement lifecycle, from the creation of a purchase requisition by a user to its approval by their department head, at which point it becomes ready for the procurement team to initiate a Request for Quotation (RFQ).

---

### **Scenario 1: Successful Requisition and Approval**

This flow outlines the standard "happy path" for getting a need recognized and approved.

1.  **Needs Recognition (Requester):**
    *   **Actor:** An employee in any department (e.g., Alice in "Design").
    *   **Action:** Alice identifies a need for new equipment. She logs into the system, navigates to "New Requisition," and fills out the form with the necessary items, quantities, estimated costs, and a detailed business justification for the purchase.
    *   **System State:** She saves the form. The requisition now exists in the system with a **"Draft"** status. It is only visible to her.

2.  **Submission for Approval (Requester):**
    *   **Actor:** Alice, the Requester.
    *   **Action:** After reviewing her draft, Alice clicks the "Submit for Approval" button.
    *   **System State:** The requisition's status immediately changes to **"Pending Approval"**. The system automatically identifies her department head (e.g., Bob) and assigns the approval task to them. The form becomes read-only for Alice.

3.  **Departmental Approval (Approver):**
    *   **Actor:** The Requester's Department Head (e.g., Bob).
    *   **Action:** Bob logs in and sees a notification or an item in his "Approvals" queue. He reviews the requisition details and clicks "Approve," adding an optional comment.
    *   **System State:** The requisition status changes to **"PreApproved"**. This is the final step in the initial phase. The requisition is now considered "Ready for RFQ" and enters the official procurement workflow, appearing in the "Quotations" queue for the designated Procurement Officer.

---

### **Scenario 2: Requisition Rejection and Resubmission**

This scenario covers the workflow when a requisition is not initially approved.

1.  **Needs Recognition & Submission:** This follows steps 1 and 2 from the scenario above. The requisition is submitted and has a status of **"Pending Approval"**.

2.  **Departmental Rejection (Approver):**
    *   **Actor:** The Department Head (Bob).
    *   **Action:** Bob reviews the requisition and finds an issue (e.g., budget concerns, unclear justification). He clicks "Reject" and is prompted to provide a mandatory reason for the rejection.
    *   **System State:** The requisition's status changes to **"Rejected"**. It is sent back to the original requester (Alice) and disappears from the approver's queue.

3.  **Revision and Resubmission (Requester):**
    *   **Actor:** Alice, the Requester.
    *   **Action:** Alice is notified of the rejection. She opens the rejected requisition, reads the comment from her manager, and clicks "Edit." She makes the necessary changes (e.g., adjusts item quantities, clarifies the justification) and then clicks "Submit for Approval" again.
    *   **System State:** The requisition's status returns to **"Pending Approval"**, and the approval process restarts, once again awaiting a decision from the Department Head.

This concludes the initial requisition phase. Once a requisition reaches the **"PreApproved"** state, it is fully ready for the procurement team to take over.