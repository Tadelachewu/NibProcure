

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
        {
            id: 'REQ-BEST-ITEM-DEMO',
            transactionId: 'REQ-BEST-ITEM-DEMO',
            requesterId: '1',
            title: 'Best Item Award Demo',
            department: 'Design',
            departmentId: 'DEPT-1',
            items: [
                { id: 'ITEM-LAPTOP', name: 'High-Performance Laptop', quantity: 10, unitPrice: 2000, description: '' },
                { id: 'ITEM-MONITOR', name: 'Standard Office Monitor', quantity: 20, unitPrice: 300, description: '' }
            ],
            totalPrice: 26000,
            justification: 'A requisition to demonstrate the per-item award functionality.',
            status: 'Scoring_Complete',
            urgency: 'Medium',
            createdAt: new Date('2024-05-01T10:00:00Z'),
            updatedAt: new Date('2024-05-10T11:30:00Z'),
            deadline: new Date('2024-05-08T23:59:00Z'),
            scoringDeadline: new Date('2024-05-15T23:59:00Z'),
            rfqSettings: {
                awardStrategy: 'item'
            },
            evaluationCriteria: {
                financialWeight: 50,
                technicalWeight: 50,
                financialCriteria: [{ id: 'fc1', name: 'Price', weight: 100 }],
                technicalCriteria: [{ id: 'tc1', name: 'Quality', weight: 100 }]
            },
            quotations: [],
            financialCommitteeMemberIds: ['9'],
            technicalCommitteeMemberIds: ['10'],
        }
    ],

    auditLogs: [
        { id: 'log-001', timestamp: new Date('2023-10-26T10:00:00Z'), user: 'Alice', role: 'Requester', action: 'CREATE', entity: 'Requisition', entityId: 'REQ-1672531200', details: 'Created new requisition for "New Laptops for Design Team"',},
    ],

    quotations: [
        {
            id: 'QUOTE-DEMO-DELL',
            requisitionId: 'REQ-BEST-ITEM-DEMO',
            vendorId: 'VENDOR-002',
            vendorName: 'Dell Technologies',
            items: [
                { id: 'DELL-LAPTOP', requisitionItemId: 'ITEM-LAPTOP', name: 'Dell XPS 15', quantity: 10, unitPrice: 1900 },
                { id: 'DELL-MONITOR', requisitionItemId: 'ITEM-MONITOR', name: 'Dell UltraSharp 27', quantity: 20, unitPrice: 320 }
            ],
            totalPrice: 25400,
            status: 'Submitted',
            scores: [
                {
                    scorerId: '9', finalScore: 95, committeeComment: 'Dell Laptop is best',
                    itemScores: [
                        { quoteItemId: 'DELL-LAPTOP', finalScore: 100, scores: [{ score: 100, type: 'FINANCIAL' }, { score: 100, type: 'TECHNICAL' }] },
                        { quoteItemId: 'DELL-MONITOR', finalScore: 90, scores: [{ score: 90, type: 'FINANCIAL' }, { score: 90, type: 'TECHNICAL' }] }
                    ]
                }
            ]
        },
        {
            id: 'QUOTE-DEMO-APPLE',
            requisitionId: 'REQ-BEST-ITEM-DEMO',
            vendorId: 'VENDOR-001',
            vendorName: 'Apple Inc.',
            items: [
                { id: 'APPLE-LAPTOP', requisitionItemId: 'ITEM-LAPTOP', name: 'MacBook Pro 16', quantity: 10, unitPrice: 2100 },
                { id: 'APPLE-MONITOR', requisitionItemId: 'ITEM-MONITOR', name: 'Studio Display', quantity: 20, unitPrice: 350 }
            ],
            totalPrice: 28000,
            status: 'Submitted',
            scores: [
                {
                    scorerId: '9', finalScore: 85, committeeComment: 'Apple is good but pricey',
                    itemScores: [
                        { quoteItemId: 'APPLE-LAPTOP', finalScore: 90, scores: [{ score: 80, type: 'FINANCIAL' }, { score: 100, type: 'TECHNICAL' }] },
                        { quoteItemId: 'APPLE-MONITOR', finalScore: 80, scores: [{ score: 80, type: 'FINANCIAL' }, { score: 80, type: 'TECHNICAL' }] }
                    ]
                }
            ]
        },
        {
            id: 'QUOTE-DEMO-HP',
            requisitionId: 'REQ-BEST-ITEM-DEMO',
            vendorId: 'VENDOR-004',
            vendorName: 'HP Inc.',
            items: [
                { id: 'HP-LAPTOP', requisitionItemId: 'ITEM-LAPTOP', name: 'HP Spectre x360', quantity: 10, unitPrice: 1950 },
                { id: 'HP-MONITOR', requisitionItemId: 'ITEM-MONITOR', name: 'HP Z27', quantity: 20, unitPrice: 290 }
            ],
            totalPrice: 25300,
            status: 'Submitted',
            scores: [
                {
                    scorerId: '9', finalScore: 92.5, committeeComment: 'HP Monitor is best value',
                    itemScores: [
                        { quoteItemId: 'HP-LAPTOP', finalScore: 85, scores: [{ score: 90, type: 'FINANCIAL' }, { score: 80, type: 'TECHNICAL' }] },
                        { quoteItemId: 'HP-MONITOR', finalScore: 100, scores: [{ score: 100, type: 'FINANCIAL' }, { score: 100, type: 'TECHNICAL' }] }
                    ]
                }
            ]
        }
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
