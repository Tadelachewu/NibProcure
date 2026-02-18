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

## Docker

### Run with Docker Compose (recommended)

This starts PostgreSQL + the Next.js app, runs Prisma migrations automatically on container start, and persists DB + uploaded files.

```bash
docker compose up --build
```


### Run the app container only

Build:

```bash
docker build -t nibprocure .
```

Run (you must provide `DATABASE_URL` and `JWT_SECRET`):

```bash
docker run --rm -p 9002:9002 \
    -e PORT=9002 \
    -e JWT_SECRET="YOUR_SUPER_SECRET_KEY" \
    -e DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public" \
    -v nibprocure_uploads:/app/public/uploads \
    nibprocure
```

---

### Containerized Run (commands)

- **Ensure env:** create or update the repository [`.env`](.env) with `DATABASE_URL` and `JWT_SECRET`.

- **Start with Docker Compose (recommended)** — builds image, runs Postgres + app, runs migrations on start, and keeps containers detached:

```bash
# stop any running stack, rebuild and start in background
docker compose down --volumes --remove-orphans
docker compose up -d --build

# follow the app logs
docker compose logs -f app

# stop and remove containers
docker compose down
```

- **Run the app image directly** (quick test; supply `DATABASE_URL` and `JWT_SECRET`):

```bash
docker build -t nibprocure-app .
docker run --rm -p 9002:9002 \
    -e DATABASE_URL="postgresql://nibprocure:nibprocure@db:5432/nibprocure?schema=public" \
    -e JWT_SECRET="YOUR_SUPER_SECRET_KEY" \
    nibprocure-app
```

- **Run migrations / seed manually** (optional / for debugging):

```bash
# using compose (exec runs inside the `app` container)
docker compose exec app sh -c "npm run db:migrate && npm run db:seed"

# or inside a running container created with `docker run`:
docker exec -it <container-name> sh -c "npm run db:migrate && npm run db:seed"
```

- **Ports & host access**: the app listens on container port `9002`. The host port is defined in `docker-compose.yml` (host:container). When using `docker run -p` you can map any host port (for example `-p 9003:9002`).

- **Troubleshooting**:
    - If `http://localhost:9002` is not reachable, confirm the container port is published:
        ```bash
        docker ps --filter name=nibprocure --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
        ```
    - Check app logs: `docker compose logs -f app`.
    - Ensure `JWT_SECRET` is present in the container env (via `.env` or compose `environment`).
    - If Docker Desktop (WSL2) appears to block host binding, try restarting Docker Desktop or use an alternate host port.


---

## Recent Updates (branch: mydock6)

 - **Enhanced Security & Compliance**: Introduced a PIN-based verification system for unsealing sensitive vendor quotations, ensuring director-level presence for critical decisions. PIN generation and verification logic has been optimized for performance and security, using asynchronous hashing and atomic operations.
 - **Flexible Award & RFQ Workflows**: The system now supports a "compliance-first" evaluation model, allowing committees to perform simple comply/non-comply checks. It also gracefully handles mixed-award scenarios (manual and electronic quotes) and allows procurement officers to restart the RFQ process for specific items that failed to be awarded.
 - **Improved Financial Controls**: The invoicing process is now more tightly integrated with goods receipt, enforcing three-way matching prerequisites in the UI. A new "Pending Payments" view provides better visibility into POs that are awaiting invoices.
 - **UI & Usability Enhancements**: The dashboard has been updated with role-specific controls and clearer status indicators. Navigation has been streamlined to better guide users through the procurement lifecycle.
 - **Performance and Reliability**: Key backend operations, such as cryptography and email notifications, have been optimized to be non-blocking, improving overall application responsiveness.

Developers: after checking out `mydock6` run migrations and seed before testing these flows:

```bash
npm run db:migrate
npm run db:seed
npm run dev
```


**Committee Evaluation Behavior:**

- The system defaults to a **compliance-first** evaluation model. Procurement Officers can configure requisitions to require a formal committee compliance check.
- During this stage, assigned committee members perform a simple **comply/non-comply** check on each item in a vendor's quotation. Vendor pricing is masked during this process to ensure objective technical evaluation.
- Once all committee members have submitted their compliance checks, the system automatically transitions to the **Ready to Award** stage. Awards are then determined based on the **least price** among all compliant bids.
- The system retains the infrastructure for more complex, weighted scoring (financial and technical), but the primary workflow is optimized for this streamlined compliance-then-price model.


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
- **System Action**: Once the deadline passes, the requisition's status in Charlie's queue automatically updates to **"Compliance Check in Progress"** (or "Ready for Committee Assignment" if not yet assigned).

### 5. **Committee Compliance Check**
- **Actors**: Fiona (Financial Expert) and George (Technical Expert).
- **Scenario**: Fiona and George are notified. They log in, review the masked vendor submissions, and submit their evaluations before the compliance-check deadline.
- **System Action**: The system tracks which committee members have submitted their evaluations. In Charlie's queue, the requisition's status now shows **"Compliance Check in Progress"**.

### 6. **Award Finalization (Procurement Officer)**
- **Actor**: Charlie, the Procurement Officer.
- **Scenario**: Once all committee members have finalized their evaluations, the requisition status in Charlie's queue automatically updates to **"Ready to Award"**. Charlie opens it, views the ranked results in the "Award Center," and finalizes the award, recommending "Apple Inc."
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
//production




npm install
npm run build
node .next/standalone/server.js





test apis like 
curl.exe -X POST "http://localhost:9005/api/ollama-systemwide-requisitions" ` 
    -H "Content-Type: application/json" `
    -d '{"prompt":"Summarize outstanding high-value requisitions."}'