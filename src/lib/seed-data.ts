
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
            id: 'REQ-E2E-AWARD-TEST',
            transactionId: 'REQ-E2E-AWARD-TEST',
            requesterId: '1',
            departmentId: 'DEPT-4',
            title: 'E2E Award Test - Office Furnishings',
            justification: 'New office setup for the expanding marketing team requires ergonomic furniture to ensure employee well-being and productivity.',
            status: 'Scoring_Complete',
            urgency: 'Medium',
            totalPrice: 11500,
            createdAt: new Date('2024-05-10T09:00:00Z'),
            updatedAt: new Date('2024-05-25T14:00:00Z'),
            deadline: new Date('2024-05-20T17:00:00Z'),
            scoringDeadline: new Date('2024-05-25T17:00:00Z'),
            items: [
                { id: 'ITEM-FURN-1', name: 'Ergonomic Office Chair', quantity: 10, unitPrice: 450, description: 'High-back, adjustable lumbar support, and armrests' },
                { id: 'ITEM-FURN-2', name: 'Standing Desk (Electric)', quantity: 10, unitPrice: 700, description: 'Dual motor, memory presets, 140x70cm top' }
            ],
            customQuestions: [
                { id: 'CQ-FURN-1', questionText: 'What is the warranty period for the chairs?', questionType: 'text', isRequired: true },
                { id: 'CQ-FURN-2', questionText: 'Do you offer bulk assembly services?', questionType: 'boolean', isRequired: true },
            ],
            evaluationCriteria: {
                financialWeight: 40,
                technicalWeight: 60,
                financialCriteria: [{ id: 'fc-1', name: 'Price per Unit', weight: 100 }],
                technicalCriteria: [
                    { id: 'tc-1', name: 'Product Durability', weight: 50 },
                    { id: 'tc-2', name: 'Warranty Period', weight: 50 }
                ],
            },
            financialCommitteeMemberIds: ['9'], // Fiona
            technicalCommitteeMemberIds: ['10'], // George
            committeeName: 'Office Furnishing Evaluation Committee',
            committeePurpose: 'To select the best value ergonomic furniture for the new marketing office.',
            quotations: [],
        }
    ],

    auditLogs: [
        { id: 'log-001', timestamp: new Date('2023-10-26T10:00:00Z'), user: 'Alice', role: 'Requester', action: 'CREATE', entity: 'Requisition', entityId: 'REQ-1672531200', details: 'Created new requisition for "New Laptops for Design Team"',},
    ],

    quotations: [
        {
            id: 'QUO-FURN-001',
            transactionId: 'REQ-E2E-AWARD-TEST',
            requisitionId: 'REQ-E2E-AWARD-TEST',
            vendorId: 'VENDOR-001',
            vendorName: 'Apple Inc.',
            totalPrice: 12500,
            deliveryDate: new Date('2024-06-10T00:00:00Z'),
            createdAt: new Date('2024-05-15T10:00:00Z'),
            updatedAt: new Date('2024-05-15T10:00:00Z'),
            status: 'Submitted',
            notes: 'Premium materials, 10 year warranty.',
            items: [
                { id: 'QI-FURN-1A', requisitionItemId: 'ITEM-FURN-1', name: 'Herman Miller Aeron', quantity: 10, unitPrice: 500, leadTimeDays: 14, brandDetails: 'Herman Miller', imageUrl: 'https://picsum.photos/seed/chair1/400/300' },
                { id: 'QI-FURN-2A', requisitionItemId: 'ITEM-FURN-2', name: 'Fully Jarvis Standing Desk', quantity: 10, unitPrice: 750, leadTimeDays: 20, brandDetails: 'Fully', imageUrl: 'https://picsum.photos/seed/desk1/400/300' }
            ],
            answers: [
                { questionId: 'CQ-FURN-1', answer: 'We offer a 12-year warranty on the Aeron chairs.' },
                { questionId: 'CQ-FURN-2', answer: 'true' }
            ],
        },
        {
            id: 'QUO-FURN-002',
            transactionId: 'REQ-E2E-AWARD-TEST',
            requisitionId: 'REQ-E2E-AWARD-TEST',
            vendorId: 'VENDOR-002',
            vendorName: 'Dell Technologies',
            totalPrice: 11000,
            deliveryDate: new Date('2024-06-15T00:00:00Z'),
            createdAt: new Date('2024-05-16T11:00:00Z'),
            updatedAt: new Date('2024-05-16T11:00:00Z'),
            status: 'Submitted',
            notes: 'Best value proposition.',
            items: [
                { id: 'QI-FURN-1B', requisitionItemId: 'ITEM-FURN-1', name: 'Steelcase Series 2', quantity: 10, unitPrice: 420, leadTimeDays: 10, brandDetails: 'Steelcase', imageUrl: 'https://picsum.photos/seed/chair2/400/300' },
                { id: 'QI-FURN-2B', requisitionItemId: 'ITEM-FURN-2', name: 'Uplift V2 Standing Desk', quantity: 10, unitPrice: 680, leadTimeDays: 15, brandDetails: 'Uplift Desk', imageUrl: 'https://picsum.photos/seed/desk2/400/300' }
            ],
            answers: [
                { questionId: 'CQ-FURN-1', answer: '5-year warranty on all parts.' },
                { questionId: 'CQ-FURN-2', answer: 'false' }
            ],
        },
        {
            id: 'QUO-FURN-003',
            transactionId: 'REQ-E2E-AWARD-TEST',
            requisitionId: 'REQ-E2E-AWARD-TEST',
            vendorId: 'VENDOR-004',
            vendorName: 'HP Inc.',
            totalPrice: 11800,
            deliveryDate: new Date('2024-06-20T00:00:00Z'),
            createdAt: new Date('2024-05-17T14:00:00Z'),
            updatedAt: new Date('2024-05-17T14:00:00Z'),
            status: 'Submitted',
            items: [
                { id: 'QI-FURN-1C', requisitionItemId: 'ITEM-FURN-1', name: 'Haworth Fern', quantity: 10, unitPrice: 480, leadTimeDays: 12, brandDetails: 'Haworth', imageUrl: 'https://picsum.photos/seed/chair3/400/300' },
                { id: 'QI-FURN-2C', requisitionItemId: 'ITEM-FURN-2', name: 'Vari Electric Standing Desk', quantity: 10, unitPrice: 700, leadTimeDays: 18, brandDetails: 'Vari', imageUrl: 'https://picsum.photos/seed/desk3/400/300' }
            ],
            answers: [
                { questionId: 'CQ-FURN-1', answer: '8-year warranty.' },
                { questionId: 'CQ-FURN-2', answer: 'true' }
            ],
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

    