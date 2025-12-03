
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
        // New, detailed requisition for "Award by Best Item" testing
        {
            id: 'REQ-BEST-ITEM',
            requesterId: '1', // Alice
            title: 'IT Infrastructure Upgrade 2024',
            department: 'IT',
            departmentId: 'DEPT-3',
            items: [
                { id: 'ITEM-CPU-01', name: 'High-Performance CPUs', quantity: 50, unitPrice: 450, description: 'CPUs for server upgrades, minimum 16 cores.' },
                { id: 'ITEM-SSD-01', name: 'Bulk NVMe SSD Storage', quantity: 100, unitPrice: 120, description: '1TB NVMe SSDs for enterprise workstations.' }
            ],
            totalPrice: 34500, // (50 * 450) + (100 * 120)
            justification: 'Urgent upgrade required for aging server and workstation hardware to improve performance and reliability across the organization.',
            status: 'Scoring_Complete',
            urgency: 'High',
            createdAt: new Date('2024-07-20T09:00:00Z'),
            updatedAt: new Date('2024-07-28T14:00:00Z'),
            deadline: new Date('2024-07-25T17:00:00Z'),
            scoringDeadline: new Date('2024-07-28T17:00:00Z'),
            customQuestions: [
                { id: 'CQ-1', questionText: 'Do all proposed items come with a minimum 3-year enterprise warranty?', questionType: 'boolean', isRequired: true },
                { id: 'CQ-2', questionText: 'What is the estimated delivery timeframe upon PO issuance?', questionType: 'text', isRequired: true },
            ],
            evaluationCriteria: {
                financialWeight: 40,
                technicalWeight: 60,
                financialCriteria: [
                    { id: 'FC-1', name: 'Unit Price Competitiveness', weight: 80 },
                    { id: 'FC-2', name: 'Bulk Discount Offered', weight: 20 },
                ],
                technicalCriteria: [
                    { id: 'TC-1', name: 'Performance Benchmarks', weight: 50 },
                    { id: 'TC-2', name: 'Warranty and Support Terms', weight: 30 },
                    { id: 'TC-3', name: 'Lead Time / Availability', weight: 20 },
                ]
            },
            financialCommitteeMemberIds: ['9'], // Fiona
            technicalCommitteeMemberIds: ['10'], // George
            quotations: [],
        }
    ],

    auditLogs: [
        { id: 'log-001', timestamp: new Date('2023-10-26T10:00:00Z'), user: 'Alice', role: 'Requester', action: 'CREATE', entity: 'Requisition', entityId: 'REQ-1672531200', details: 'Created new requisition for "New Laptops for Design Team"',},
    ],

    quotations: [
        // --- Quotes for REQ-BEST-ITEM ---
        // VENDOR-001 (Apple) - Good on CPU, okay on SSD
        {
            id: 'QUO-BI-01',
            requisitionId: 'REQ-BEST-ITEM',
            vendorId: 'VENDOR-001',
            vendorName: 'Apple Inc.',
            totalPrice: 35000,
            deliveryDate: new Date('2024-08-15T00:00:00Z'),
            createdAt: new Date('2024-07-22T10:00:00Z'),
            status: 'Submitted',
            items: [
                { id: 'QI-BI-A1', requisitionItemId: 'ITEM-CPU-01', name: 'M3 Max Chip', quantity: 50, unitPrice: 460, leadTimeDays: 14, brandDetails: 'Apple Silicon' },
                { id: 'QI-BI-A2', requisitionItemId: 'ITEM-SSD-01', name: 'Apple Branded 1TB SSD', quantity: 100, unitPrice: 120, leadTimeDays: 10, brandDetails: 'Apple' },
            ],
            answers: [
                { questionId: 'CQ-1', answer: 'true' },
                { questionId: 'CQ-2', answer: '10-14 business days.' },
            ],
            scores: [
                // Fiona's Score (Financial)
                { id: 'SCORE-F1', scorerId: '9', finalScore: 85, committeeComment: "Prices are slightly high, but acceptable.", itemScores: [
                    { id: 'IS-F1A1', quoteItemId: 'QI-BI-A1', finalScore: 80, scores: [{ id: 'S-F1A1-1', type: 'FINANCIAL', financialCriterionId: 'FC-1', score: 80, comment: 'CPU price is high.'}, { id: 'S-F1A1-2', type: 'FINANCIAL', financialCriterionId: 'FC-2', score: 80, comment: 'No explicit bulk discount mentioned.'}] },
                    { id: 'IS-F1A2', quoteItemId: 'QI-BI-A2', finalScore: 90, scores: [{ id: 'S-F1A2-1', type: 'FINANCIAL', financialCriterionId: 'FC-1', score: 90, comment: 'SSD price is competitive.'}, { id: 'S-F1A2-2', type: 'FINANCIAL', financialCriterionId: 'FC-2', score: 90, comment: 'Standard pricing.'}] },
                ]},
                // George's Score (Technical)
                { id: 'SCORE-G1', scorerId: '10', finalScore: 95, committeeComment: "Excellent performance and warranty terms.", itemScores: [
                    { id: 'IS-G1A1', quoteItemId: 'QI-BI-A1', finalScore: 98, scores: [{ id: 'S-G1A1-1', type: 'TECHNICAL', technicalCriterionId: 'TC-1', score: 100, comment: 'Top-tier performance.'}, { id: 'S-G1A1-2', type: 'TECHNICAL', technicalCriterionId: 'TC-2', score: 100, comment: 'Excellent AppleCare support.'}, { id: 'S-G1A1-3', type: 'TECHNICAL', technicalCriterionId: 'TC-3', score: 90, comment: 'Slightly longer lead time.'}] },
                    { id: 'IS-G1A2', quoteItemId: 'QI-BI-A2', finalScore: 92, scores: [{ id: 'S-G1A2-1', type: 'TECHNICAL', technicalCriterionId: 'TC-1', score: 90, comment: 'Good performance.'}, { id: 'S-G1A2-2', type: 'TECHNICAL', technicalCriterionId: 'TC-2', score: 100, comment: 'Great warranty.'}, { id: 'S-G1A2-3', type: 'TECHNICAL', technicalCriterionId: 'TC-3', score: 90, comment: 'Good availability.'}] },
                ]}
            ]
        },
        // VENDOR-002 (Dell) - Okay on CPU, good on SSD
        {
            id: 'QUO-BI-02',
            requisitionId: 'REQ-BEST-ITEM',
            vendorId: 'VENDOR-002',
            vendorName: 'Dell Technologies',
            totalPrice: 33250,
            deliveryDate: new Date('2024-08-12T00:00:00Z'),
            createdAt: new Date('2024-07-23T11:00:00Z'),
            status: 'Submitted',
            items: [
                { id: 'QI-BI-B1', requisitionItemId: 'ITEM-CPU-01', name: 'Intel Xeon W-2295', quantity: 50, unitPrice: 455, leadTimeDays: 12, brandDetails: 'Intel' },
                { id: 'QI-BI-B2', requisitionItemId: 'ITEM-SSD-01', name: 'Dell Ultra-Speed 1TB NVMe', quantity: 100, unitPrice: 110, leadTimeDays: 7, brandDetails: 'Dell/Samsung' },
            ],
            answers: [
                { questionId: 'CQ-1', answer: 'true' },
                { questionId: 'CQ-2', answer: '7-12 business days.' },
            ],
            scores: [
                 // Fiona's Score (Financial)
                { id: 'SCORE-F2', scorerId: '9', finalScore: 95, committeeComment: "Very competitive pricing, especially on SSDs.", itemScores: [
                    { id: 'IS-F2B1', quoteItemId: 'QI-BI-B1', finalScore: 90, scores: [{ id: 'S-F2B1-1', type: 'FINANCIAL', financialCriterionId: 'FC-1', score: 90, comment: 'CPU price is average.'}, { id: 'S-F2B1-2', type: 'FINANCIAL', financialCriterionId: 'FC-2', score: 90, comment: 'Good bulk offer.'}] },
                    { id: 'IS-F2B2', quoteItemId: 'QI-BI-B2', finalScore: 100, scores: [{ id: 'S-F2B2-1', type: 'FINANCIAL', financialCriterionId: 'FC-1', score: 100, comment: 'Excellent SSD price.'}, { id: 'S-F2B2-2', type: 'FINANCIAL', financialCriterionId: 'FC-2', score: 100, comment: 'Great discount.'}] },
                ]},
                // George's Score (Technical)
                { id: 'SCORE-G2', scorerId: '10', finalScore: 88, committeeComment: "Solid, reliable hardware.", itemScores: [
                    { id: 'IS-G2B1', quoteItemId: 'QI-BI-B1', finalScore: 85, scores: [{ id: 'S-G2B1-1', type: 'TECHNICAL', technicalCriterionId: 'TC-1', score: 85, comment: 'Good server performance.'}, { id: 'S-G2B1-2', type: 'TECHNICAL', technicalCriterionId: 'TC-2', score: 90, comment: 'Dell ProSupport is solid.'}, { id: 'S-G2B1-3', type: 'TECHNICAL', technicalCriterionId: 'TC-3', score: 80, comment: 'Acceptable lead time.'}] },
                    { id: 'IS-G2B2', quoteItemId: 'QI-BI-B2', finalScore: 91, scores: [{ id: 'S-G2B2-1', type: 'TECHNICAL', technicalCriterionId: 'TC-1', score: 90, comment: 'Fast SSDs.'}, { id: 'S-G2B2-2', type: 'TECHNICAL', technicalCriterionId: 'TC-2', score: 90, comment: 'Standard warranty.'}, { id: 'S-G2B2-3', type: 'TECHNICAL', technicalCriterionId: 'TC-3', score: 95, comment: 'Very fast shipping.'}] },
                ]}
            ]
        },
        // VENDOR-004 (HP) - Standby / Third option
        {
            id: 'QUO-BI-03',
            requisitionId: 'REQ-BEST-ITEM',
            vendorId: 'VENDOR-004',
            vendorName: 'HP Inc.',
            totalPrice: 34000,
            deliveryDate: new Date('2024-08-20T00:00:00Z'),
            createdAt: new Date('2024-07-24T14:00:00Z'),
            status: 'Submitted',
            items: [
                { id: 'QI-BI-C1', requisitionItemId: 'ITEM-CPU-01', name: 'AMD Ryzen Threadripper PRO', quantity: 50, unitPrice: 470, leadTimeDays: 20, brandDetails: 'AMD' },
                { id: 'QI-BI-C2', requisitionItemId: 'ITEM-SSD-01', name: 'HP Z Turbo Drive', quantity: 100, unitPrice: 115, leadTimeDays: 15, brandDetails: 'HP/WD' },
            ],
            answers: [
                { questionId: 'CQ-1', answer: 'true' },
                { questionId: 'CQ-2', answer: '15-20 business days.' },
            ],
            scores: [
                 // Fiona's Score (Financial)
                { id: 'SCORE-F3', scorerId: '9', finalScore: 80, committeeComment: "Pricing is not as competitive.", itemScores: [
                    { id: 'IS-F3C1', quoteItemId: 'QI-BI-C1', finalScore: 75, scores: [{ id: 'S-F3C1-1', type: 'FINANCIAL', financialCriterionId: 'FC-1', score: 70, comment: 'Highest price for CPU.'}, { id: 'S-F3C1-2', type: 'FINANCIAL', financialCriterionId: 'FC-2', score: 80, comment: 'Some discount applied.'}] },
                    { id: 'IS-F3C2', quoteItemId: 'QI-BI-C2', finalScore: 85, scores: [{ id: 'S-F3C2-1', type: 'FINANCIAL', financialCriterionId: 'FC-1', score: 85, comment: 'Decent SSD price.'}, { id: 'S-F3C2-2', type: 'FINANCIAL', financialCriterionId: 'FC-2', score: 85, comment: 'Standard bulk pricing.'}] },
                ]},
                // George's Score (Technical)
                { id: 'SCORE-G3', scorerId: '10', finalScore: 82, committeeComment: "Good workstation parts, but longer lead times.", itemScores: [
                    { id: 'IS-G3C1', quoteItemId: 'QI-BI-C1', finalScore: 88, scores: [{ id: 'S-G3C1-1', type: 'TECHNICAL', technicalCriterionId: 'TC-1', score: 95, comment: 'Excellent multi-core performance.'}, { id: 'S-G3C1-2', type: 'TECHNICAL', technicalCriterionId: 'TC-2', score: 80, comment: 'Standard HP warranty.'}, { id: 'S-G3C1-3', type: 'TECHNICAL', technicalCriterionId: 'TC-3', score: 70, comment: 'Long lead time.'}] },
                    { id: 'IS-G3C2', quoteItemId: 'QI-BI-C2', finalScore: 76, scores: [{ id: 'S-G3C2-1', type: 'TECHNICAL', technicalCriterionId: 'TC-1', score: 80, comment: 'Solid SSD performance.'}, { id: 'S-G3C2-2', type: 'TECHNICAL', technicalCriterionId: 'TC-2', score: 80, comment: 'Standard warranty.'}, { id: 'S-G3C2-3', type: 'TECHNICAL', technicalCriterionId: 'TC-3', score: 70, comment: 'Slow shipping.'}] },
                ]}
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
