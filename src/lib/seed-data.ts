
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
            kycStatus: 'Verified',
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
            allowedVendorIds: [],
            awardedQuoteItemIds: [],
            quotations: [],
            financialCommitteeMemberIds: ['9'],
            technicalCommitteeMemberIds: ['10'],
        },

        // Masked RFQ (sealed) with enough portal quotations to be "Ready for Committee Assignment"
        // Used to test: unmask -> show "Add Vendor Quotation" -> upload a Manual quotation.
        {
            id: 'REQ-MANUAL-TEST-001',
            requesterId: '1',
            title: 'Manual Quotation Upload Test (Sealed RFQ)',
            department: 'Operations',
            departmentId: 'DEPT-2',
            items: [
                { id: 'ITEM-MAN-1', name: 'Laptop (Core i7, 16GB RAM)', quantity: 10, unitPrice: 0, description: 'For committee assignment + manual quote upload testing.' },
                { id: 'ITEM-MAN-2', name: 'Laptop Bag', quantity: 10, unitPrice: 0, description: 'Accessories.' },
            ],
            totalPrice: 0,
            justification: 'Seeded scenario to test sealed RFQ unmask + manual quotation upload after unmask.',
            status: 'Accepting_Quotes',
            urgency: 'Low',
            createdAt: new Date('2025-12-01T10:00:00Z'),
            updatedAt: new Date('2025-12-28T11:30:00Z'),
            // Deadline is in the past so the page shows "Ready for Committee Assignment".
            deadline: new Date('2025-12-20T09:00:00Z'),
            scoringDeadline: new Date('2026-01-20T17:00:00Z'),
            allowedVendorIds: ['VENDOR-001', 'VENDOR-002', 'VENDOR-004', 'VENDOR-003'],
            awardedQuoteItemIds: [],
            assignedRfqSenderIds: ['3'],
            rfqSettings: {
                masked: true,
                directorPresenceVerified: false,
                awardStrategy: 'all',
                experienceDocumentRequired: false,
            },
            customQuestions: [
                {
                    id: 'CQ-MAN-1',
                    requisitionId: 'REQ-MANUAL-TEST-001',
                    questionText: 'Warranty period (months)',
                    questionType: 'text',
                    isRequired: true,
                    options: [],
                },
            ],
            quotations: [],
        },
    ],

    auditLogs: [
        { id: 'log-001', timestamp: new Date('2023-10-26T10:00:00Z'), user: 'Alice', role: 'Requester', action: 'CREATE', entity: 'Requisition', entityId: 'REQ-1672531200', details: 'Created new requisition for "New Laptops for Design Team"',},
    ],

    quotations: [
        {
            id: 'QUOTE-MAN-APPLE',
            transactionId: 'QUOTE-MAN-APPLE',
            requisitionId: 'REQ-MANUAL-TEST-001',
            vendorId: 'VENDOR-001',
            vendorName: 'Apple Inc.',
            submissionMethod: 'Portal',
            items: [
                { id: 'QITEM-MAN-APPLE-1', requisitionItemId: 'ITEM-MAN-1', name: 'Laptop (Core i7, 16GB RAM)', quantity: 10, unitPrice: 2200, leadTimeDays: 21 },
                { id: 'QITEM-MAN-APPLE-2', requisitionItemId: 'ITEM-MAN-2', name: 'Laptop Bag', quantity: 10, unitPrice: 55, leadTimeDays: 7 },
            ],
            totalPrice: (2200 * 10) + (55 * 10),
            deliveryDate: new Date('2026-01-15T00:00:00Z'),
            createdAt: new Date('2025-12-10T09:00:00Z'),
            updatedAt: new Date('2025-12-10T09:00:00Z'),
            status: 'Submitted',
            notes: 'Submitted via portal (seed).',
            answers: [{ questionId: 'CQ-MAN-1', answer: '24' }],
        },
        {
            id: 'QUOTE-MAN-DELL',
            transactionId: 'QUOTE-MAN-DELL',
            requisitionId: 'REQ-MANUAL-TEST-001',
            vendorId: 'VENDOR-002',
            vendorName: 'Dell Technologies',
            submissionMethod: 'Portal',
            items: [
                { id: 'QITEM-MAN-DELL-1', requisitionItemId: 'ITEM-MAN-1', name: 'Laptop (Core i7, 16GB RAM)', quantity: 10, unitPrice: 2050, leadTimeDays: 28 },
                { id: 'QITEM-MAN-DELL-2', requisitionItemId: 'ITEM-MAN-2', name: 'Laptop Bag', quantity: 10, unitPrice: 60, leadTimeDays: 10 },
            ],
            totalPrice: (2050 * 10) + (60 * 10),
            deliveryDate: new Date('2026-01-20T00:00:00Z'),
            createdAt: new Date('2025-12-11T09:00:00Z'),
            updatedAt: new Date('2025-12-11T09:00:00Z'),
            status: 'Submitted',
            notes: 'Submitted via portal (seed).',
            answers: [{ questionId: 'CQ-MAN-1', answer: '18' }],
        },
        {
            id: 'QUOTE-MAN-HP',
            transactionId: 'QUOTE-MAN-HP',
            requisitionId: 'REQ-MANUAL-TEST-001',
            vendorId: 'VENDOR-004',
            vendorName: 'HP Inc.',
            submissionMethod: 'Portal',
            items: [
                { id: 'QITEM-MAN-HP-1', requisitionItemId: 'ITEM-MAN-1', name: 'Laptop (Core i7, 16GB RAM)', quantity: 10, unitPrice: 1980, leadTimeDays: 30 },
                { id: 'QITEM-MAN-HP-2', requisitionItemId: 'ITEM-MAN-2', name: 'Laptop Bag', quantity: 10, unitPrice: 52, leadTimeDays: 9 },
            ],
            totalPrice: (1980 * 10) + (52 * 10),
            deliveryDate: new Date('2026-01-22T00:00:00Z'),
            createdAt: new Date('2025-12-12T09:00:00Z'),
            updatedAt: new Date('2025-12-12T09:00:00Z'),
            status: 'Submitted',
            notes: 'Submitted via portal (seed).',
            answers: [{ questionId: 'CQ-MAN-1', answer: '12' }],
        },
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
        { id: '20', name: 'Finance Director', email: 'director.finance@example.com', password: 'password123', role: 'Finance_Director', departmentId: 'DEPT-5', department: 'Finance' },
        { id: '21', name: 'Facility Director', email: 'director.facility@example.com', password: 'password123', role: 'Facility_Director', departmentId: 'DEPT-2', department: 'Operations' },
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
