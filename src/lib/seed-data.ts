
import type { PurchaseRequisition, AuditLog, Vendor, Quotation, PurchaseOrder, GoodsReceiptNote, Invoice, User, Department } from './types';

export interface AppData {
    vendors: Vendor[];
    requisitions: PurchaseRequisition[];
    auditLogs: AuditLog[];
    quotations: Quotation[];
    purchaseOrders: PurchaseOrder[];
    goodsReceipts: GoodsReceiptNote[];
    invoices: Invoice[];
    users: User[];
    departments: Department[];
}

export function getInitialData(): AppData {
  // Use structuredClone for a deep copy to ensure the original seed data is never mutated.
  const initialData = structuredClone(seedData);

  // Link quotations to their requisitions
  initialData.requisitions.forEach(req => {
    req.quotations = initialData.quotations.filter(q => q.requisitionId === req.id);
  });
  
  return initialData;
}

const seedData: AppData = {
    vendors: [
        {
            id: 'VENDOR-001',
            userId: '6',
            name: 'Apple Inc.',
            contactPerson: 'Tim Cook',
            email: 'tade2024bdugit@gmail.com',
            phone: '1-800-MY-APPLE',
            address: '1 Apple Park Way, Cupertino, CA 95014',
            kycStatus: 'Verified',
            kycDocuments: [
                { name: 'Business License', url: '#', submittedAt: new Date('2023-01-15T00:00:00Z')},
                { name: 'Tax ID', url: '#', submittedAt: new Date('2023-01-15T00:00:00Z')}
            ]
        },
        {
            id: 'VENDOR-002',
            userId: '7',
            name: 'Dell Technologies',
            contactPerson: 'Michael Dell',
            email: 'tade2024bdulin@gmail.com',
            phone: '1-877-275-3355',
            address: '1 Dell Way, Round Rock, TX 78682',
            kycStatus: 'Verified',
            kycDocuments: [
                { name: 'Business License', url: '#', submittedAt: new Date('2023-02-20T00:00:00Z')},
                { name: 'Tax ID', url: '#', submittedAt: new Date('2023-02-20T00:00:00Z')}
            ]
        },
        {
            id: 'VENDOR-003',
            name: 'Office Depot',
            userId: '8',
            contactPerson: 'Sales Team',
            email: 'vendor@officedepot.com',
            phone: '1-800-GO-DEPOT',
            address: '6600 N Military Trl, Boca Raton, FL 33496',
            kycStatus: 'Pending',
            kycDocuments: [
                { name: 'Business License', url: '#', submittedAt: new Date('2023-10-28T00:00:00Z')},
                { name: 'Tax ID', url: '#', submittedAt: new Date('2023-10-28T00:00:00Z')}
            ]
        },
        {
            id: 'VENDOR-004',
            userId: '19',
            name: 'HP Inc.',
            contactPerson: 'Enrique Lores',
            email: 'vendor@hp.com',
            phone: '1-800-474-6836',
            address: '1501 Page Mill Rd, Palo Alto, CA 94304',
            kycStatus: 'Verified',
            kycDocuments: [
                { name: 'Business License', url: '#', submittedAt: new Date('2023-03-10T00:00:00Z')},
                { name: 'Tax ID', url: '#', submittedAt: new Date('2023-03-10T00:00:00Z')}
            ]
        }
    ],

    requisitions: [
        // --- BASE SCENARIOS ---
        {
            id: `REQ-1672531200`,
            requesterId: '1',
            title: 'New Laptops for Design Team',
            department: 'Design',
            departmentId: 'DEPT-1',
            items: [ { id: 'ITEM-1', name: 'MacBook Pro 16-inch', quantity: 5, unitPrice: 2499, description: '' } ],
            totalPrice: 12495,
            justification: 'Current laptops are over 5 years old and struggling with new design software.',
            status: 'Scoring_Complete',
            urgency: 'Low',
            createdAt: new Date('2024-01-01T10:00:00Z'),
            updatedAt: new Date('2024-01-05T11:30:00Z'),
            deadline: new Date('2024-01-10T23:59:00Z'),
            scoringDeadline: new Date('2024-01-15T23:59:00Z'),
            quotations: [],
            financialCommitteeMemberIds: ['9'],
            technicalCommitteeMemberIds: ['10'],
        },
         // --- 10 NEW TEST SCENARIOS ---
        {
            id: 'TEST-REQ-01', requesterId: '1', title: 'Test 01: Pending Approval', department: 'Design', departmentId: 'DEPT-1',
            items: [{ id: 'TEST-ITEM-01', name: 'Test Item', quantity: 1, unitPrice: 100, description: '' }], totalPrice: 100,
            justification: 'Scenario 1: Waiting for initial departmental approval.', status: 'Pending_Approval', urgency: 'Low',
            createdAt: new Date(), updatedAt: new Date(), currentApproverId: '12', quotations: [],
        },
        {
            id: 'TEST-REQ-02', requesterId: '1', title: 'Test 02: Rejected Requisition', department: 'Design', departmentId: 'DEPT-1',
            items: [{ id: 'TEST-ITEM-02', name: 'Test Item', quantity: 1, unitPrice: 100, description: '' }], totalPrice: 100,
            justification: 'Scenario 2: Rejected by manager, ready for requester to edit.', status: 'Rejected', urgency: 'Low',
            createdAt: new Date(), updatedAt: new Date(), approverComment: 'Budget is frozen for this quarter. Please resubmit next month.', quotations: [],
        },
        {
            id: 'TEST-REQ-03', requesterId: '1', title: 'Test 03: Ready for RFQ', department: 'Design', departmentId: 'DEPT-1',
            items: [{ id: 'TEST-ITEM-03', name: 'Test Item', quantity: 1, unitPrice: 100, description: '' }], totalPrice: 100,
            justification: 'Scenario 3: Approved by department, waiting for Procurement to send RFQ.', status: 'PreApproved', urgency: 'Low',
            createdAt: new Date(), updatedAt: new Date(), quotations: [],
        },
        {
            id: 'TEST-REQ-04', requesterId: '1', title: 'Test 04: Accepting Quotes', department: 'Design', departmentId: 'DEPT-1',
            items: [{ id: 'TEST-ITEM-04', name: 'Test Item', quantity: 1, unitPrice: 100, description: '' }], totalPrice: 100,
            justification: 'Scenario 4: RFQ sent, deadline for vendors has not passed yet.', status: 'Accepting_Quotes', urgency: 'Low',
            createdAt: new Date(), updatedAt: new Date(), deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), quotations: [],
        },
        {
            id: 'TEST-REQ-05', requesterId: '1', title: 'Test 05: Ready for Committee Assignment', department: 'Design', departmentId: 'DEPT-1',
            items: [{ id: 'TEST-ITEM-05', name: 'Test Item', quantity: 2, unitPrice: 100, description: '' }], totalPrice: 200,
            justification: 'Scenario 5: RFQ deadline passed with enough quotes, ready for committee assignment.', status: 'Accepting_Quotes', urgency: 'Medium',
            createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), updatedAt: new Date(), deadline: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), quotations: [],
        },
        {
            id: 'TEST-REQ-06', requesterId: '1', title: 'Test 06: Scoring in Progress', department: 'Design', departmentId: 'DEPT-1',
            items: [{ id: 'TEST-ITEM-06', name: 'Test Item', quantity: 1, unitPrice: 100, description: '' }], totalPrice: 100,
            justification: 'Scenario 6: Committee assigned, scoring deadline has not passed.', status: 'Scoring_In_Progress', urgency: 'Low',
            createdAt: new Date(), updatedAt: new Date(), deadline: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), scoringDeadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), 
            financialCommitteeMemberIds: ['9'], technicalCommitteeMemberIds: ['10'], quotations: [],
        },
        {
            id: 'TEST-REQ-07', requesterId: '1', title: 'Test 07: Ready to Award (Scoring Complete)', department: 'IT', departmentId: 'DEPT-3',
            items: [{ id: 'TEST-ITEM-07', name: 'Test Item', quantity: 1, unitPrice: 150000, description: '' }], totalPrice: 150000,
            justification: 'Scenario 7: All committee members have submitted scores. Ready for PO to finalize.', status: 'Scoring_Complete', urgency: 'High',
            createdAt: new Date(), updatedAt: new Date(), deadline: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), scoringDeadline: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
            financialCommitteeMemberIds: ['9'], technicalCommitteeMemberIds: ['10'], quotations: [],
        },
        {
            id: 'TEST-REQ-08', requesterId: '1', title: 'Test 08: Mid-Value Hierarchical Approval', department: 'IT', departmentId: 'DEPT-3',
            items: [{ id: 'TEST-ITEM-08', name: 'Mid-Value Server Rack', quantity: 1, unitPrice: 150000, description: '' }], totalPrice: 150000,
            justification: 'Scenario 8: Award decided, now in a multi-step approval chain.', status: 'Pending_Managerial_Approval', urgency: 'High',
            createdAt: new Date(), updatedAt: new Date(), currentApproverId: '15', quotations: [],
        },
        {
            id: 'TEST-REQ-09', requesterId: '1', title: 'Test 09: Split Award Ready for Notification', department: 'Operations', departmentId: 'DEPT-2',
            items: [
                { id: 'TEST-ITEM-09A', name: 'Executive Desk', quantity: 5, unitPrice: 20000, description: '' },
                { id: 'TEST-ITEM-09B', name: 'Conference Table', quantity: 1, unitPrice: 50000, description: '' },
            ],
            totalPrice: 150000,
            justification: 'Scenario 9: Split award has passed all approvals. Ready to notify the two winning vendors.', status: 'PostApproved', urgency: 'Medium',
            createdAt: new Date(), updatedAt: new Date(),
            awardedQuoteItemIds: ['TEST-QI-09A', 'TEST-QI-09B'], quotations: [],
        },
        {
            id: 'TEST-REQ-10', requesterId: '1', title: 'Test 10: Declined Award with Standby', department: 'Operations', departmentId: 'DEPT-2',
            items: [{ id: 'TEST-ITEM-10', name: 'Test Item', quantity: 1, unitPrice: 100, description: '' }], totalPrice: 100,
            justification: 'Scenario 10: The winning vendor declined the award. A standby vendor is available.', status: 'Award_Declined', urgency: 'Low',
            createdAt: new Date(), updatedAt: new Date(), quotations: [],
        },
    ],

    auditLogs: [
        { id: 'log-001', timestamp: new Date('2023-10-26T10:00:00Z'), user: 'Alice', role: 'Requester', action: 'CREATE', entity: 'Requisition', entityId: 'REQ-1672531200', details: 'Created new requisition for "New Laptops for Design Team"',},
    ],

    quotations: [
        // --- QUOTES FOR SCENARIOS ---
        // For TEST-REQ-05 (Ready for Committee)
        { id: 'TEST-QUO-05A', transactionId: 'TEST-REQ-05', requisitionId: 'TEST-REQ-05', vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', items: [{id: 'TEST-QI-05A', requisitionItemId: 'TEST-ITEM-05', name: 'Test Item', quantity: 2, unitPrice: 95, leadTimeDays: 5}], totalPrice: 190, deliveryDate: new Date(), createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), status: 'Submitted'},
        { id: 'TEST-QUO-05B', transactionId: 'TEST-REQ-05', requisitionId: 'TEST-REQ-05', vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', items: [{id: 'TEST-QI-05B', requisitionItemId: 'TEST-ITEM-05', name: 'Test Item', quantity: 2, unitPrice: 98, leadTimeDays: 3}], totalPrice: 196, deliveryDate: new Date(), createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), status: 'Submitted'},
        // For TEST-REQ-06 (Scoring in Progress) - same quotes as 05
        { id: 'TEST-QUO-06A', transactionId: 'TEST-REQ-06', requisitionId: 'TEST-REQ-06', vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', items: [{id: 'TEST-QI-06A', requisitionItemId: 'TEST-ITEM-06', name: 'Test Item', quantity: 1, unitPrice: 95, leadTimeDays: 5}], totalPrice: 95, deliveryDate: new Date(), createdAt: new Date(), status: 'Submitted'},
        { id: 'TEST-QUO-06B', transactionId: 'TEST-REQ-06', requisitionId: 'TEST-REQ-06', vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', items: [{id: 'TEST-QI-06B', requisitionItemId: 'TEST-ITEM-06', name: 'Test Item', quantity: 1, unitPrice: 98, leadTimeDays: 3}], totalPrice: 98, deliveryDate: new Date(), createdAt: new Date(), status: 'Submitted'},
        // For TEST-REQ-07 (Ready to Award) - same quotes as 05
        { id: 'TEST-QUO-07A', transactionId: 'TEST-REQ-07', requisitionId: 'TEST-REQ-07', vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', items: [{id: 'TEST-QI-07A', requisitionItemId: 'TEST-ITEM-07', name: 'Test Item', quantity: 1, unitPrice: 148000, leadTimeDays: 5}], totalPrice: 148000, deliveryDate: new Date(), createdAt: new Date(), status: 'Submitted'},
        { id: 'TEST-QUO-07B', transactionId: 'TEST-REQ-07', requisitionId: 'TEST-REQ-07', vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', items: [{id: 'TEST-QI-07B', requisitionItemId: 'TEST-ITEM-07', name: 'Test Item', quantity: 1, unitPrice: 150000, leadTimeDays: 3}], totalPrice: 150000, deliveryDate: new Date(), createdAt: new Date(), status: 'Submitted'},
        // For TEST-REQ-09 (Split Award)
        { id: 'TEST-QUO-09A', transactionId: 'TEST-REQ-09', requisitionId: 'TEST-REQ-09', vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', items: [{id: 'TEST-QI-09A', requisitionItemId: 'TEST-ITEM-09A', name: 'Executive Desk', quantity: 5, unitPrice: 19000, leadTimeDays: 15}], totalPrice: 95000, deliveryDate: new Date(), createdAt: new Date(), status: 'Pending_Award'},
        { id: 'TEST-QUO-09B', transactionId: 'TEST-REQ-09', requisitionId: 'TEST-REQ-09', vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', items: [{id: 'TEST-QI-09B', requisitionItemId: 'TEST-ITEM-09B', name: 'Conference Table', quantity: 1, unitPrice: 48000, leadTimeDays: 10}], totalPrice: 48000, deliveryDate: new Date(), createdAt: new Date(), status: 'Pending_Award'},
        // For TEST-REQ-10 (Declined Award)
        { id: 'TEST-QUO-10A', transactionId: 'TEST-REQ-10', requisitionId: 'TEST-REQ-10', vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', items: [{id: 'TEST-QI-10A', requisitionItemId: 'TEST-ITEM-10', name: 'Test Item', quantity: 1, unitPrice: 90, leadTimeDays: 5}], totalPrice: 90, deliveryDate: new Date(), createdAt: new Date(), status: 'Declined'},
        { id: 'TEST-QUO-10B', transactionId: 'TEST-REQ-10', requisitionId: 'TEST-REQ-10', vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', items: [{id: 'TEST-QI-10B', requisitionItemId: 'TEST-ITEM-10', name: 'Test Item', quantity: 1, unitPrice: 92, leadTimeDays: 3}], totalPrice: 92, deliveryDate: new Date(), createdAt: new Date(), status: 'Standby'},
        { id: 'TEST-QUO-10C', transactionId: 'TEST-REQ-10', requisitionId: 'TEST-REQ-10', vendorId: 'VENDOR-004', vendorName: 'HP Inc.', items: [{id: 'TEST-QI-10C', requisitionItemId: 'TEST-ITEM-10', name: 'Test Item', quantity: 1, unitPrice: 95, leadTimeDays: 7}], totalPrice: 95, deliveryDate: new Date(), createdAt: new Date(), status: 'Standby'},
    ],
    purchaseOrders: [],
    goodsReceipts: [],
    invoices: [],
    users: [
        { id: '1', name: 'Alice', email: 'alice@example.com', password: 'password123', role: 'Requester', departmentId: 'DEPT-1', department: 'Design' },
        { id: '2', name: 'Bob', email: 'bob@example.com', password: 'password123', role: 'Approver', departmentId: 'DEPT-2', department: 'Operations' },
        { id: '3', name: 'Charlie', email: 'charlie@example.com', password: 'password123', role: 'Procurement_Officer', departmentId: 'DEPT-2', department: 'Operations' },
        { id: '4', name: 'David', email: 'david@example.com', password: 'password123', role: 'Receiving', departmentId: 'DEPT-2', department: 'Operations' },
        { id: '5', name: 'Eve', email: 'eve@example.com', password: 'password123', role: 'Finance', departmentId: 'DEPT-5', department: 'Finance' },
        { id: '6', name: 'Apple Inc.', email: 'tade2024bdugit@gmail.com', password: 'password123', role: 'Vendor', vendorId: 'VENDOR-001' },
        { id: '7', name: 'Dell Technologies', email: 'tade2024bdulin@gmail.com', password: 'password123', role: 'Vendor', vendorId: 'VENDOR-002' },
        { id: '8', name: 'Office Depot', email: 'vendor@officedepot.com', password: 'password123', role: 'Vendor', vendorId: 'VENDOR-003' },
        { id: '9', name: 'Fiona', email: 'fiona@example.com', password: 'password123', role: 'Committee_Member', departmentId: 'DEPT-1', department: 'Design' },
        { id: '10', name: 'George', email: 'george@example.com', password: 'password123', role: 'Committee_Member', departmentId: 'DEPT-3', department: 'IT' },
        { id: '11', name: 'Hannah', email: 'hannah@example.com', password: 'password123', role: 'Committee', departmentId: 'DEPT-2', department: 'Operations' },
        { id: '12', name: 'Diana', email: 'diana@example.com', password: 'password123', role: 'Admin', departmentId: 'DEPT-1' },
        { id: '13', name: 'Irene', email: 'irene@example.com', password: 'password123', role: 'Committee_A_Member', departmentId: 'DEPT-5', department: 'Finance' },
        { id: '14', name: 'Jack', email: 'jack@example.com', password: 'password123', role: 'Committee_B_Member', departmentId: 'DEPT-4', department: 'Marketing' },
        { id: '15', name: 'Procurement Manager', email: 'manager.proc@example.com', password: 'password123', role: 'Manager_Procurement_Division', departmentId: 'DEPT-2', department: 'Operations' },
        { id: '16', name: 'Supply Chain Director', email: 'director.supply@example.com', password: 'password123', role: 'Director_Supply_Chain_and_Property_Management', departmentId: 'DEPT-2', department: 'Operations' },
        { id: '17', name: 'VP of Resources', email: 'vp.resources@example.com', password: 'password123', role: 'VP_Resources_and_Facilities', departmentId: 'DEPT-2', department: 'Operations' },
        { id: '18', name: 'President', email: 'president@example.com', password: 'password123', role: 'President', departmentId: 'DEPT-2', department: 'Operations' },
        { id: '19', name: 'HP Inc.', email: 'vendor@hp.com', password: 'password123', role: 'Vendor', vendorId: 'VENDOR-004' },
    ],
    departments: [
        { id: 'DEPT-1', name: 'Design', description: 'Handles all creative and design tasks.', headId: '12' },
        { id: 'DEPT-2', name: 'Operations', description: 'Manages day-to-day business operations.', headId: null },
        { id: 'DEPT-3', name: 'IT', description: 'Manages all technology and infrastructure.', headId: null },
        { id: 'DEPT-4', name: 'Marketing', description: 'Responsible for marketing and sales.', headId: null },
        { id: 'DEPT-5', name: 'Finance', description: 'Handles all financial matters.', headId: '5' },
        { id: 'DEPT-6', name: 'Human Resources', description: 'Manages employee relations and hiring.', headId: null },
    ]
};
