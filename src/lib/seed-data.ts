
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
            id: 'REQ-SINGLE-AWARD',
            requesterId: '1',
            title: 'Single Award Test Case (Computers & Monitors)',
            department: 'IT',
            departmentId: 'DEPT-3',
            items: [
                { id: 'SA-ITEM-1', name: 'High-End Video Editing PC', quantity: 2, unitPrice: 3500 },
                { id: 'SA-ITEM-2', name: 'Professional 4K Monitor', quantity: 2, unitPrice: 800 }
            ],
            totalPrice: 8600,
            justification: 'New setup for the marketing video production team.',
            status: 'Scoring_Complete',
            urgency: 'Medium',
            createdAt: new Date('2024-05-10T09:00:00Z'),
            updatedAt: new Date('2024-05-20T14:00:00Z'),
            deadline: new Date('2024-05-15T23:59:00Z'),
            scoringDeadline: new Date('2024-05-20T23:59:00Z'),
            quotations: [],
            financialCommitteeMemberIds: ['9'], // Fiona
            technicalCommitteeMemberIds: ['10'], // George
            evaluationCriteria: {
                financialWeight: 40, technicalWeight: 60,
                financialCriteria: [{ id: 'fc1', name: 'Price', weight: 100 }],
                technicalCriteria: [{ id: 'tc1', name: 'Performance', weight: 70 }, { id: 'tc2', name: 'Warranty', weight: 30 }]
            }
        },
        {
            id: 'REQ-SPLIT-AWARD',
            requesterId: '1',
            title: 'Split Award Test Case (Workstations & Peripherals)',
            department: 'Operations',
            departmentId: 'DEPT-2',
            items: [
                { id: 'SP-ITEM-1', name: 'Standard Office Workstation', quantity: 5, unitPrice: 1200 },
                { id: 'SP-ITEM-2', name: 'Ergonomic Keyboard', quantity: 5, unitPrice: 150 }
            ],
            totalPrice: 6750,
            justification: 'Equipping new project managers.',
            status: 'Scoring_Complete',
            urgency: 'Medium',
            createdAt: new Date('2024-05-11T09:00:00Z'),
            updatedAt: new Date('2024-05-21T14:00:00Z'),
            deadline: new Date('2024-05-16T23:59:00Z'),
            scoringDeadline: new Date('2024-05-21T23:59:00Z'),
            quotations: [],
            financialCommitteeMemberIds: ['9'], // Fiona
            technicalCommitteeMemberIds: ['10'], // George
            evaluationCriteria: {
                financialWeight: 50, technicalWeight: 50,
                financialCriteria: [{ id: 'fc2', name: 'Price', weight: 100 }],
                technicalCriteria: [{ id: 'tc3', name: 'Reliability', weight: 60 }, { id: 'tc4', name: 'Support', weight: 40 }]
            }
        }
    ],

    auditLogs: [
        { id: 'log-001', timestamp: new Date('2023-10-26T10:00:00Z'), user: 'Alice', role: 'Requester', action: 'CREATE', entity: 'Requisition', entityId: 'REQ-1672531200', details: 'Created new requisition for "New Laptops for Design Team"',},
    ],

    quotations: [
        // --- QUOTES FOR SINGLE AWARD TEST ---
        {
            id: 'Q-SA-001', requisitionId: 'REQ-SINGLE-AWARD', vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', totalPrice: 8500, deliveryDate: new Date('2024-06-10T00:00:00Z'), createdAt: new Date(), status: 'Submitted',
            items: [
                { id: 'Q-SA-001-I1', name: 'Custom Mac Pro', quantity: 2, unitPrice: 3400, leadTimeDays: 14, requisitionItemId: 'SA-ITEM-1' },
                { id: 'Q-SA-001-I2', name: 'Studio Display', quantity: 2, unitPrice: 850, leadTimeDays: 10, requisitionItemId: 'SA-ITEM-2' }
            ],
            scores: [
                // Fiona (Financial Scorer)
                {
                    scorerId: '9', finalScore: 89.5, submittedAt: new Date(),
                    itemScores: [
                        { quoteItemId: 'Q-SA-001-I1', finalScore: 90, scores: [{ type: 'FINANCIAL', score: 90 }] }, // Good price
                        { quoteItemId: 'Q-SA-001-I2', finalScore: 89, scores: [{ type: 'FINANCIAL', score: 89 }] }  // Okay price
                    ]
                },
                // George (Technical Scorer)
                {
                    scorerId: '10', finalScore: 95.5, submittedAt: new Date(),
                    itemScores: [
                        { quoteItemId: 'Q-SA-001-I1', finalScore: 98, scores: [{ type: 'TECHNICAL', score: 98 }] }, // Excellent perf
                        { quoteItemId: 'Q-SA-001-I2', finalScore: 93, scores: [{ type: 'TECHNICAL', score: 93 }] }  // Excellent monitor
                    ]
                }
            ],
            finalAverageScore: 92.5 // (89.5 + 95.5) / 2
        },
        {
            id: 'Q-SA-002', requisitionId: 'REQ-SINGLE-AWARD', vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', totalPrice: 8200, deliveryDate: new Date('2024-06-12T00:00:00Z'), createdAt: new Date(), status: 'Submitted',
            items: [
                { id: 'Q-SA-002-I1', name: 'Dell Precision Tower', quantity: 2, unitPrice: 3300, leadTimeDays: 7, requisitionItemId: 'SA-ITEM-1' },
                { id: 'Q-SA-002-I2', name: 'Dell UltraSharp Monitor', quantity: 2, unitPrice: 800, leadTimeDays: 5, requisitionItemId: 'SA-ITEM-2' }
            ],
            scores: [
                {
                    scorerId: '9', finalScore: 95, submittedAt: new Date(),
                    itemScores: [
                        { quoteItemId: 'Q-SA-002-I1', finalScore: 95, scores: [{ type: 'FINANCIAL', score: 95 }] }, // Excellent price
                        { quoteItemId: 'Q-SA-002-I2', finalScore: 95, scores: [{ type: 'FINANCIAL', score: 95 }] }
                    ]
                },
                {
                    scorerId: '10', finalScore: 85, submittedAt: new Date(),
                    itemScores: [
                        { quoteItemId: 'Q-SA-002-I1', finalScore: 88, scores: [{ type: 'TECHNICAL', score: 88 }] }, // Good perf
                        { quoteItemId: 'Q-SA-002-I2', finalScore: 82, scores: [{ type: 'TECHNICAL', score: 82 }] }  // Good monitor
                    ]
                }
            ],
            finalAverageScore: 90 // (95 + 85) / 2
        },

        // --- QUOTES FOR SPLIT AWARD TEST ---
        {
            id: 'Q-SP-001', requisitionId: 'REQ-SPLIT-AWARD', vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', totalPrice: 6500, deliveryDate: new Date('2024-06-15T00:00:00Z'), createdAt: new Date(), status: 'Submitted',
            items: [
                { id: 'Q-SP-001-I1', name: 'Dell OptiPlex', quantity: 5, unitPrice: 1150, leadTimeDays: 10, requisitionItemId: 'SP-ITEM-1' },
                { id: 'Q-SP-001-I2', name: 'Dell Premier Keyboard', quantity: 5, unitPrice: 150, leadTimeDays: 10, requisitionItemId: 'SP-ITEM-2' }
            ],
            scores: [ // Dell has the best workstations
                {
                    scorerId: '9', finalScore: 95, submittedAt: new Date(), // Great price
                    itemScores: [{ quoteItemId: 'Q-SP-001-I1', finalScore: 100, scores: [{ type: 'FINANCIAL', score: 100 }] }, { quoteItemId: 'Q-SP-001-I2', finalScore: 90, scores: [{ type: 'FINANCIAL', score: 90 }] }]
                },
                {
                    scorerId: '10', finalScore: 92, submittedAt: new Date(), // Great reliability
                    itemScores: [{ quoteItemId: 'Q-SP-001-I1', finalScore: 95, scores: [{ type: 'TECHNICAL', score: 95 }] }, { quoteItemId: 'Q-SP-001-I2', finalScore: 89, scores: [{ type: 'TECHNICAL', score: 89 }] }]
                }
            ],
            finalAverageScore: 93.5
        },
        {
            id: 'Q-SP-002', requisitionId: 'REQ-SPLIT-AWARD', vendorId: 'VENDOR-004', vendorName: 'HP Inc.', totalPrice: 6600, deliveryDate: new Date('2024-06-14T00:00:00Z'), createdAt: new Date(), status: 'Submitted',
            items: [
                { id: 'Q-SP-002-I1', name: 'HP EliteDesk', quantity: 5, unitPrice: 1200, leadTimeDays: 8, requisitionItemId: 'SP-ITEM-1' },
                { id: 'Q-SP-002-I2', name: 'HP 970 Ergonomic Keyboard', quantity: 5, unitPrice: 120, leadTimeDays: 12, requisitionItemId: 'SP-ITEM-2' }
            ],
             scores: [ // HP has the best keyboards
                {
                    scorerId: '9', finalScore: 92.5, submittedAt: new Date(),
                    itemScores: [{ quoteItemId: 'Q-SP-002-I1', finalScore: 85, scores: [{ type: 'FINANCIAL', score: 85 }] }, { quoteItemId: 'Q-SP-002-I2', finalScore: 100, scores: [{ type: 'FINANCIAL', score: 100 }] }]
                },
                {
                    scorerId: '10', finalScore: 90, submittedAt: new Date(),
                    itemScores: [{ quoteItemId: 'Q-SP-002-I1', finalScore: 88, scores: [{ type: 'TECHNICAL', score: 88 }] }, { quoteItemId: 'Q-SP-002-I2', finalScore: 92, scores: [{ type: 'TECHNICAL', score: 92 }] }]
                }
            ],
            finalAverageScore: 91.25
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


    

    