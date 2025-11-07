
# Nib InternationalBank Procurement System

This is a comprehensive, full-stack procurement management system built with Next.js, Prisma, and PostgreSQL. It is designed to streamline the entire procurement lifecycle, from initial requisition to final payment, incorporating robust approval workflows, vendor management, and automated three-way matching.

## Key Features

- **Role-Based Access Control (RBAC)**: A granular permissions system that tailors the user experience to specific roles (Requester, Approver, Procurement Officer, Finance, etc.).
- **Dynamic Procurement Workflow**: Manage the entire lifecycle:
    1.  **Needs Recognition**: Users create purchase requisitions with detailed justifications and item lists.
    2.  **Approval Chains**: Requisitions are automatically routed through a multi-level approval matrix based on total value.
    3.  **RFQ & Quotations**: Procurement officers send out Requests for Quotation (RFQs) to verified vendors and track submissions.
    4.  **Committee Evaluation**: Assigned committees score vendor quotations based on weighted financial and technical criteria.
    5.  **Awarding & Final Review**: The system recommends a winner, and the decision is routed through a final approval chain before the vendor is notified.
    6.  **Contract & PO Generation**: Contracts are managed, and Purchase Orders (POs) are automatically generated upon award acceptance.
    7.  **Goods Receipt**: The receiving department logs incoming goods against POs.
    8.  **Three-Way Matching**: The system automatically performs a three-way match between the PO, Goods Receipt Note (GRN), and Invoice to identify discrepancies.
    9.  **Payment Processing**: The finance team processes payments for matched and approved invoices.
- **Vendor Management**: Includes a vendor registration portal, KYC verification workflow, and a central vendor database.
- **Comprehensive Auditing**: Every significant action is logged for full transparency and traceability.
- **Document Management**: A central repository for all procurement-related documents (Requisitions, POs, Invoices, Contracts).
- **Admin & Settings Panel**: Configure user roles, permissions, departments, the approval matrix, and other system settings.

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) with [ShadCN UI](https://ui.shadcn.com/) components.
- **ORM**: [Prisma](https://www.prisma.io/)
- **Database**: [PostgreSQL](https://www.postgresql.org/)
- **Authentication**: JWT-based authentication

---

## Getting Started

### 1. Prerequisites
- Node.js (v20 or later)
- npm or a compatible package manager
- PostgreSQL database server

### 2. Set Up Your Database
1.  Make sure you have a PostgreSQL installed and running.
2.  Create a new database for this project.
3.  Update the `.env` file in the root of the project with your PostgreSQL connection string:

    ```env
    # .env
    DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public"
    JWT_SECRET="YOUR_SUPER_SECRET_KEY"
    ```

    Replace `USER`, `PASSWORD`, `HOST`, `PORT`, and `DATABASE` with your actual database credentials. Change `JWT_SECRET` to a long, random, and secret string.

### 3. Install Dependencies
```bash
npm install
```

### 4. Create and Apply the Database Schema
This command creates a new migration file based on your `prisma/schema.prisma` changes and applies it to the database.

```bash
npm run db:migrate
```

This will also automatically generate the Prisma Client based on your schema.

### 5. Seed the Database
To populate your database with initial sample data (users, vendors, requisitions, etc.), run the seed command. This command is safe to run multiple times.

```bash
npm run db:seed
```

### 6. Run the Development Server
```bash
npm run dev
```

The application will be available at `http://localhost:9002`.

---

## The Procurement Workflow Explained

This scenario illustrates the end-to-end journey of a procurement request, involving multiple user roles and system processes.

### 1. **Needs Recognition (Requester)**
- **Actor**: Alice, a designer in the "Design" department.
- **Scenario**: Alice needs new, powerful laptops for her team. She logs in, creates a new requisition, and specifies 5 MacBook Pros with an estimated total value of **150,000 ETB**. She provides a business justification and defines the evaluation criteria (e.g., 60% technical, 40% financial).
- **System Action**: Upon submission, the system saves the requisition with a "Draft" status. Alice reviews it and clicks "Submit for Approval." The status changes to "Pending Approval," and it is automatically assigned to her department head, Bob.

### 2. **Departmental Approval (Approver)**
- **Actor**: Bob, the head of the Design department.
- **Scenario**: Bob logs in, sees the pending request from Alice, and approves it.
- **System Action**: Bob clicks "Approve." The system recognizes this is the final departmental approval. It immediately sets the requisition's status to **"Approved"** and automatically assigns it to the designated **RFQ Sender** (a specific user or any Procurement Officer, based on system settings). The requisition now appears in the RFQ Sender's "Quotations" queue with a status of **"Ready for RFQ"**.

### 3. **RFQ Distribution (Procurement Officer / RFQ Sender)**
- **Actor**: Charlie, the designated RFQ Sender.
- **Scenario**: Charlie sees the newly approved requisition in his queue. He opens it, sets a deadline for vendors to submit quotes, and assigns a committee of financial and technical experts. He then sends the RFQ.
- **System Action**: The requisition's status changes to **"RFQ In Progress"**. The item remains visible in Charlie's queue, now with a status of **"Accepting Quotes"**. At this stage, Charlie can update the deadline or cancel the RFQ if needed.

### 4. **Quotation Submission & Deadline**
- **Actor**: Vendors.
- **Scenario**: Vendors submit their quotations before the deadline.
- **System Action**: Once the deadline passes, the requisition's status in Charlie's queue automatically updates to **"Scoring in Progress"** (or "Ready for Committee Assignment" if not yet assigned).

### 5. **Committee Scoring**
- **Actors**: Fiona (Financial Expert) and George (Technical Expert).
- **Scenario**: Fiona and George are notified. They log in, review the masked vendor submissions, and submit their scores before the scoring deadline.
- **System Action**: The system tracks which committee members have submitted their scores. In Charlie's queue, the requisition's status now shows **"Scoring in Progress"**.

### 6. **Award Finalization (Procurement Officer)**
- **Actor**: Charlie, the Procurement Officer.
- **Scenario**: Once all committee members have finalized their scores, the requisition status in Charlie's queue automatically updates to **"Ready to Award"**. Charlie opens it, views the ranked results in the "Award Center," and finalizes the award, recommending "Apple Inc."
- **System Action**: Charlie clicks "Finalize & Send Awards." The system calculates the total award value (e.g., 150,000 ETB) and consults the **Approval Matrix** in the database.

### 7. **Hierarchical Review (Database-Driven)**
- **Scenario**: Based on the award value of 150,000 ETB, the system determines this falls into the **"Mid Value"** tier. It initiates the specific approval chain defined for that tier *only*.
- **System Action (Example "Mid Value" Chain):**
    1.  The requisition status changes to **"Pending Committee B Review."** The item appears in the "Reviews" queue for all members of Committee B.
    2.  Once Committee B approves, the status updates to **"Pending Managerial Review,"** and it is assigned to the "Manager, Procurement Division".
    3.  Once the Manager approves, the status updates to **"Pending Director Approval,"** and it is assigned to the "Director, Supply Chain and Property Management".

### 8. **Final Approval & Vendor Notification**
- **Actor**: The "Director, Supply Chain and Property Management" (the final approver for the "Mid Value" tier).
- **Scenario**: The Director gives the final approval for this tier.
- **System Action**: The system recognizes this is the **last step in the chain for this specific tier**.
    - The requisition's status is set back to a final, unambiguous **"Approved"** state.
    - The requisition reappears in Charlie's (the RFQ Sender's) "Quotations" queue, now marked as ready for notification.
    - On the quotation page, the **"Notify Vendor"** button becomes active for Charlie.
    - Charlie clicks the button, officially notifying the winning vendor. The requisition status changes back to **"RFQ In Progress"** as it now waits for the vendor's response.

### 9. **Award Acceptance & PO Generation (Vendor & System)**
- **Actor**: The sales rep from "Apple Inc."
- **Scenario**: The vendor receives the award notification and accepts it in the vendor portal.
- **System Action**: The system automatically generates a **Purchase Order (PO)** and updates the requisition status to **"PO Created."**

### 10. **Goods Receipt, Invoicing & Payment**
- **Actors**: David (Receiving) and Eve (Finance).
- **Scenario**: The goods are delivered and logged (GRN). An invoice is submitted and automatically matched against the PO and GRN. Finance processes the payment for the matched invoice.
- **System Action**: The system tracks the delivery, matching, and payment status, finally closing the requisition with a "Fulfilled" or "Closed" status once the process is complete.

---
## Project Structure

```
.
├── /prisma/                # Prisma schema and seed script
├── /public/                # Static assets (images, logos)
├── /src/
│   ├── /app/
│   │   ├── /(app)/         # Main authenticated app routes
│   │   ├── /api/           # API route handlers
│   │   ├── /login/         # Login page
│   │   ├── /register/      # Vendor registration page
│   │   └── /vendor/        # Vendor portal routes
│   ├── /components/        # React components (UI and logic)
│   ├── /contexts/          # React contexts (Auth, Theme)
│   ├── /hooks/             # Custom React hooks
│   ├── /lib/               # Core libraries, types, and utilities
│   └── /services/          # Business logic services (email, matching)
├── .env                    # Environment variables (DATABASE_URL, JWT_SECRET)
└── package.json
```
For a more detailed technical overview, please see `docs/architecture.md`.
