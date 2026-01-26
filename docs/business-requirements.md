
# Business Requirements Document (BRD)
## Nib InternationalBank Procurement System

**Version**: 1.0  
**Status**: Initial Draft  
**Author**: Senior Business Analyst & Enterprise Architect  
**Date**: 2024-07-23  

---

### 1. Document Overview

#### 1.1. Purpose

This Business Requirements Document (BRD) outlines the functional and non-functional requirements for the Nib InternationalBank Procurement System. The document is derived exclusively from the analysis of the existing application codebase on the `mydock6` Git branch.

Its purpose is to provide a formal, evidence-based description of the system's current state, capabilities, and constraints. This serves as a foundational artifact for enterprise audit, developer onboarding, strategic planning, and handover processes. It reflects what the system *does*, not what it *could* or *should* do.

#### 1.2. Scope

##### 1.2.1. In-Scope

The scope of this document is strictly limited to the features, workflows, and technical implementations present in the application's `mydock6` branch. This includes:

*   User and Role Management (Admin, Procurement, Requester, etc.).
*   End-to-end Purchase Requisition lifecycle management.
*   Departmental and value-based hierarchical approval workflows.
*   Request for Quotation (RFQ) generation, distribution, and vendor response management.
*   Manual and portal-based quotation submission.
*   Committee assignment and compliance checking workflows.
*   Single-vendor and per-item award finalization strategies.
*   PIN-based verification for unmasking sensitive quotation data.
*   Automated Purchase Order (PO) generation upon award acceptance.
*   Goods Receipt Note (GRN) logging.
*   Invoice submission and three-way matching simulation.
*   Payment processing simulation.
*   System-wide audit logging.
*   Vendor registration and KYC document submission.
*   Containerized deployment via Docker and scripted deployment to IIS.

##### 1.2.2. Out-of-Scope

The following items are considered out-of-scope for this document as they are not fully implemented or evidenced in the codebase:

*   **Live AI-Powered RFQ Generation**: While scaffolding for Genkit exists, the AI flow for RFQ generation (`src/ai/flows/rfq-generation.ts`) is not implemented.
*   **Direct Financial System Integration**: The system simulates payment processing; there is no evidence of direct integration with external banking or accounting systems.
*   **Production Email Delivery**: The email service is configured to use a temporary, test-only service (`nodemailer` with Ethereal).
*   **Performance and Load Testing**: No performance testing suites or results are included in the codebase.
*   **Future-State Features**: Any feature not present in the `mydock6` branch is excluded.

---

### 2. Business Objectives

Based on the implemented features, the primary business objectives of the system are:

*   **BO-1: Digitize and Centralize Procurement**: To move the organization's procurement process from manual or disparate systems into a single, unified digital platform.
*   **BO-2: Enforce Compliance and Approval Policies**: To ensure all purchase requests and awards adhere strictly to predefined departmental and value-based approval chains, reducing unauthorized spending.
*   **BO-3: Increase Operational Efficiency**: To automate key workflow steps, such as requisition routing, PO generation, and notifications, reducing manual effort and processing time.
*   **BO-4: Enhance Transparency and Auditability**: To create an immutable, system-wide audit trail of every significant action, providing full visibility into the procurement lifecycle for compliance and reporting.
*   **BO-5: Improve Vendor Management and Competition**: To streamline vendor onboarding, verification, and participation in a competitive, fair bidding process.
*   **BO-6: Secure Sensitive Information**: To protect sensitive financial data during the quotation process through role-based access and explicit verification steps.

---

### 3. Stakeholders & User Roles

The system is designed to serve multiple stakeholders, each with a distinct role and set of permissions. These roles are defined in `prisma/schema.prisma` and controlled via `src/lib/roles.ts` and API-level checks.

| Role                | Description                                                                                               | Key Responsibilities in the System |
| ------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **Requester**       | An employee who initiates a request for goods or services.                                                | Creates and submits Purchase Requisitions. Edits rejected requisitions. |
| **Approver**        | A manager (typically Department Head) who provides the first level of approval.                           | Approves or rejects departmental requisitions. |
| **Procurement Officer**| Manages the procurement process from RFQ to final award.                                                  | Sends RFQs, assigns committees, finalizes awards, manages POs. |
| **Admin**           | A superuser with full system access.                                                                      | Manages users, roles, departments, and all system settings. |
| **Finance**         | A user responsible for financial verification and payment.                                                | Manages invoices, performs three-way matching, and processes payments. |
| **Receiving**       | A user responsible for logging incoming goods.                                                            | Creates Goods Receipt Notes (GRNs) against Purchase Orders. |
| **Vendor**          | An external supplier registered to bid on RFQs.                                                           | Submits KYC documents, submits quotations, and responds to awards. |
| **Committee Member**| An expert assigned to evaluate vendor submissions.                                                        | Scores or performs compliance checks on quotations. |
| **Hierarchical Approver** | A senior role (e.g., Director, VP, President) who provides final approval on high-value awards. | Reviews and approves or rejects finalized award recommendations. |

---

### 4. Functional Requirements (FR)

#### FR-1: User Authentication
*   **Description**: Users must authenticate to access the system.
*   **Trigger**: A user attempts to access a protected page.
*   **System Behavior**: If not authenticated, the user is redirected to `/login`. Upon successful login via `/api/auth/login`, a JWT is issued and stored. Subsequent requests include this token for authorization.
*   **Code Mapping**: `src/app/login/page.tsx`, `src/app/api/auth/login/route.ts`, `src/contexts/auth-context.tsx`.

#### FR-2: Role-Based Access Control (RBAC)
*   **Description**: A user's access to pages and features is determined by their assigned role(s).
*   **Trigger**: A user attempts to navigate to a page.
*   **System Behavior**: The main application layout (`src/app/(app)/layout.tsx`) and API routes (`src/lib/auth.ts`) validate the user's role against a predefined permission map. Unauthorized access attempts are blocked or redirected.
*   **Code Mapping**: `src/app/(app)/layout.tsx`, `src/lib/roles.ts`, `src/lib/auth.ts`.

#### FR-3: Purchase Requisition Management
*   **Description**: Authorized users can create, save as draft, submit, and edit rejected requisitions.
*   **Trigger**: User submits the form on `/new-requisition` or `/requisitions/[id]/edit`.
*   **System Behavior**: The client sends a POST or PATCH request to `/api/requisitions`. The API handler validates the data and creates/updates the `PurchaseRequisition` record in the database via Prisma. If submitted for approval, the system assigns it to the appropriate department head.
*   **Code Mapping**: `src/components/needs-recognition-form.tsx`, `src/app/api/requisitions/route.ts`.

#### FR-4: Hierarchical Approval Workflow (Departmental)
*   **Description**: Submitted requisitions are automatically routed to the requester's Department Head for approval. If no head is assigned, or if the requester is the head, the requisition is auto-approved to the next stage.
*   **Trigger**: A requisition's status is changed to `Pending_Approval`.
*   **System Behavior**: The `/api/requisitions` PATCH handler determines the `currentApproverId` from the department's `headId`. The approver can approve or reject the request via the `/approvals` page, which triggers another PATCH call.
*   **Code Mapping**: `src/app/api/requisitions/route.ts`, `src/components/approvals-table.tsx`.

#### FR-5: RFQ Distribution
*   **Description**: Authorized Procurement Officers can send a Request for Quotation (RFQ) to either all verified vendors or a selected list.
*   **Trigger**: User submits the RFQ form on the `/quotations/[id]` page.
*   **System Behavior**: A POST request to `/api/requisitions/[id]/send-rfq` updates the requisition status to `Accepting_Quotes`, sets a submission deadline, and populates the `allowedVendorIds`.
*   **Code Mapping**: `src/app/(app)/quotations/[id]/page.tsx`, `src/app/api/requisitions/[id]/send-rfq/route.ts`.

#### FR-6: Quotation Submission (Portal & Manual)
*   **Description**: Vendors can submit quotations via the vendor portal. Procurement can also manually upload quotations on behalf of vendors.
*   **Trigger**: A vendor submits the quotation form; a procurement officer submits the manual upload form.
*   **System Behavior**: The system creates a `Quotation` record linked to the requisition via POST requests to `/api/quotations` (portal) or `/api/quotations/manual` (manual).
*   **Code Mapping**: `src/app/vendor/requisitions/[id]/page.tsx`, `src/app/(app)/quotations/[id]/page.tsx`.

#### FR-7: Evaluation Committee Compliance Check
*   **Description**: Assigned committee members perform compliance checks on submitted quotations based on requester-defined criteria.
*   **Trigger**: A user with a committee role accesses the `/compliance/[id]` page and submits their evaluation.
*   **System Behavior**: The system records the compliance check (comply/non-comply) for each item via a POST to `/api/quotations/[id]/score`. Once all members finalize their checks, the requisition status moves to `Scoring_Complete`.
*   **Code Mapping**: `src/app/(app)/compliance/[id]/page.tsx`, `src/app/api/quotations/[id]/score/route.ts`, `src/app/api/requisitions/[id]/submit-scores/route.ts`.

#### FR-8: Award Finalization and Hierarchical Review
*   **Description**: Procurement Officers finalize awards, which are then routed through a value-based, multi-step approval chain.
*   **Trigger**: A Procurement Officer uses the "Award Center" to finalize an award.
*   **System Behavior**: The `/api/requisitions/[id]/finalize-scores` endpoint is called. The `award-service.ts` calculates the total award value and consults the `ApprovalThreshold` table in the database to determine the first step of the review chain (e.g., `Pending_Committee_A_Recommendation`). Subsequent approvals/rejections move the requisition up or down the chain.
*   **Code Mapping**: `src/components/award-center-dialog.tsx`, `src/app/api/requisitions/[id]/finalize-scores/route.ts`, `src/services/award-service.ts`.

#### FR-9: Vendor Award Acceptance and PO Generation
*   **Description**: Winning vendors can accept or decline awards. An accepted award automatically generates a Purchase Order.
*   **Trigger**: A vendor clicks "Accept Award" in the vendor portal.
*   **System Behavior**: A POST request to `/api/quotations/[id]/respond` with an `accept` action updates the `Quotation` status to `Accepted` and triggers the creation of a `PurchaseOrder` record.
*   **Code Mapping**: `src/app/vendor/requisitions/[id]/page.tsx`, `src/app/api/quotations/[id]/respond/route.ts`.

#### FR-10: PIN-Based Quotation Unsealing
*   **Description**: Directors and Department Heads must verify their presence with a unique PIN to unmask sensitive vendor pricing information during the quotation review phase.
*   **Trigger**: A Procurement Officer generates PINs for a sealed RFQ. Directors enter their PINs.
*   **System Behavior**: The `/api/requisitions/[id]/generate-pins` endpoint creates hashed PINs. The `/api/requisitions/[id]/verify-pin` endpoint validates a submitted PIN against the hash. Once the configured threshold of verifications is met, the `rfqSettings.masked` flag on the `PurchaseRequisition` is set to `false`, revealing the data in the UI.
*   **Code Mapping**: `src/components/quotations/[id]/page.tsx`, `src/app/api/requisitions/[id]/generate-pins/route.ts`, `src/app/api/requisitions/[id]/verify-pin/route.ts`.

---

### 5. Non-Functional Requirements (NFR)

#### NFR-1: Security
*   **NFR-1.1**: All access to protected resources must be authenticated via JWT.
*   **NFR-1.2**: API endpoints must perform server-side authorization checks to ensure a user's role grants them permission for the requested action (evidenced in `getActorFromToken` and API route logic).
*   **NFR-1.3**: User passwords must be securely hashed using `bcryptjs` before being stored.
*   **NFR-1.4**: The application must implement a Content Security Policy (CSP) to mitigate cross-site scripting (XSS) and other injection attacks (defined in `next.config.js`).

#### NFR-2: Performance
*   **NFR-2.1**: Long-running operations such as cryptographic hashing and email dispatch must be performed asynchronously to prevent blocking the request-response cycle (evidenced in `mydock6` branch notes and various API handlers).
*   **NFR-2.2**: The application must support server-side pagination for lists with potentially large datasets (e.g., requisitions, users) to ensure fast initial page loads.

#### NFR-3: Scalability & Availability
*   **NFR-3.1**: The application must be deployable as a standalone containerized service using Docker (evidenced by `Dockerfile` and `docker-compose.yml`).
*   **NFR-3.2**: Application services must be configured to restart automatically on failure to ensure high availability (evidenced by `restart: always` in `docker-compose.yml`).

#### NFR-4: Auditability & Compliance
*   **NFR-4.1**: Every significant state change in the procurement lifecycle (create, approve, reject, award, etc.) must generate an immutable `AuditLog` entry, including the actor, timestamp, and action details.
*   **NFR-4.2**: Digital signatures, including the signer's identity, role, decision, and timestamp, must be appended to minute documents upon approval or rejection.

---

### 6. Assumptions & Constraints

*   **AC-1: Technology Stack**: The system is built on the Next.js/React framework, PostgreSQL database, and Prisma ORM. No deviation from this stack is supported.
*   **AC-2: Authentication**: The system relies exclusively on its internal JWT-based authentication mechanism.
*   **AC-3: Deployment Environment**: The system is designed for deployment on either Windows/IIS or a Docker-compatible environment.
*   **AC-4: Data Seeding**: The system assumes the database is populated with initial seed data (users, roles, departments, settings) from `prisma/seed.ts` for correct operation.

---

### 7. Open Gaps / Observed Limitations

*   **OG-1: Incomplete AI Feature**: The AI-powered RFQ generation feature is scaffolded but not implemented. The Genkit flow is empty.
*   **OG-2: Test Email Service**: The email notification system is configured for a development-only service (`Ethereal`) and is not suitable for production.
*   **OG-3: Simplified Three-Way Match**: The `matching-service.ts` provides a basic simulation of three-way matching but may not cover all complex edge cases (e.g., partial payments, credit notes).
*   **OG-4: No Centralized Error Monitoring**: Error handling is managed locally within API routes and components, with no integration for a centralized logging or monitoring service (e.g., Sentry, DataDog).
*   **OG-5: File Upload Storage**: Uploaded files are stored on the local filesystem (`public/uploads`), which is not a scalable or persistent solution for containerized or multi-instance deployments. An external object storage service (like S3 or GCS) would be required.

