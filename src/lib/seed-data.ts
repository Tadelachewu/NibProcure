
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
        }
    ],

    requisitions: [
        {
            id: `REQ-1672531200`,
            requesterId: '1',
            title: 'New Laptops for Design Team',
            department: 'Design',
            departmentId: 'DEPT-1',
            items: [
                { id: 'ITEM-1', name: 'MacBook Pro 16-inch', quantity: 5, unitPrice: 2499, description: '' },
                { id: 'ITEM-2', name: '4K Monitor', quantity: 5, unitPrice: 799, description: '' }
            ],
            totalPrice: 16490,
            justification: 'Current laptops are over 5 years old and struggling with new design software.',
            status: 'PreApproved',
            urgency: 'Low',
            createdAt: new Date('2023-10-01T10:00:00Z'),
            updatedAt: new Date('2023-10-05T11:30:00Z'),
            quotations: [],
            financialCommitteeMemberIds: ['9'],
            technicalCommitteeMemberIds: ['10'],
        },
        {
            id: `REQ-1672617600`,
            requesterId: '2',
            title: 'Office Supplies Replenishment',
            department: 'Operations',
            departmentId: 'DEPT-2',
            items: [
                { id: 'ITEM-3', name: 'Printer Paper (Case)', quantity: 10, unitPrice: 45, description: '' },
                { id: 'ITEM-4', name: 'Toner Cartridge', quantity: 4, unitPrice: 150, description: '' }
            ],
            totalPrice: 1050,
            justification: 'Standard quarterly replenishment of office supplies.',
            status: 'Pending_Approval',
            urgency: 'Low',
            createdAt: new Date('2023-10-02T14:00:00Z'),
            updatedAt: new Date('2023-10-02T14:00:00Z'),
            quotations: [],
        },
        {
            id: `REQ-SPLIT-AWARD-01`,
            requesterId: '1',
            title: 'New Branch Office Furniture (Split Award Test)',
            department: 'Design',
            departmentId: 'DEPT-1',
            items: [
                { id: 'ITEM-SPLIT-1', name: 'Executive Desk', quantity: 5, unitPrice: 15000, description: '' },
                { id: 'ITEM-SPLIT-2', name: 'Conference Table', quantity: 1, unitPrice: 40000, description: '' },
            ],
            totalPrice: 115000,
            justification: 'Furnishing for the new downtown branch office. Award has been split between two vendors.',
            status: 'Closed',
            urgency: 'High',
            createdAt: new Date('2023-11-01T09:00:00Z'),
            updatedAt: new Date('2023-11-13T10:00:00Z'),
            quotations: [],
            awardedQuoteItemIds: ['QI-SPLIT-A1', 'QI-SPLIT-B2'], // ID of Desk from Vendor A, ID of Table from Vendor B
        },
        {
            id: 'REQ-PARTIAL-TEST-01',
            requesterId: '1',
            title: 'Partial Award Test - Office Tech',
            department: 'IT',
            departmentId: 'DEPT-3',
            items: [
                { id: 'ITEM-PARTIAL-1', name: 'High-Performance Laptop', quantity: 10, unitPrice: 30000, description: '' },
                { id: 'ITEM-PARTIAL-2', name: '27-inch 4K Monitor', quantity: 20, unitPrice: 8000, description: '' },
            ],
            totalPrice: 460000, // 10*30000 + 20*8000
            justification: 'Seeding a requisition to test a partial award scenario where different items are awarded to different vendors.',
            status: 'PostApproved',
            urgency: 'High',
            createdAt: new Date('2023-12-01T09:00:00Z'),
            updatedAt: new Date('2023-12-05T15:00:00Z'),
            quotations: [],
            awardedQuoteItemIds: ['QI-PARTIAL-A1', 'QI-PARTIAL-B2'], // Apple wins laptops, Dell wins monitors
        },
        // --- 10 NEW AWARDED REQUISITIONS ---
        ...Array.from({ length: 10 }).map((_, i) => {
            const isAppleWinner = i % 2 === 0;
            const winner = isAppleWinner ? 'Apple Inc.' : 'Dell Technologies';
            const loser = isAppleWinner ? 'Dell Technologies' : 'Apple Inc.';
            return {
                id: `REQ-AWARD-TEST-${i + 1}`,
                requesterId: '1',
                title: `Award Test ${i + 1}: ${winner} Laptops`,
                department: 'IT',
                departmentId: 'DEPT-3',
                items: [{ id: `ITEM-AWARD-${i + 1}`, name: 'High-End Laptop', quantity: 50, unitPrice: 2000, description: '' }],
                totalPrice: 100000,
                justification: `High value test case #${i + 1} for award workflow testing.`,
                status: 'PostApproved',
                urgency: 'Medium',
                createdAt: new Date(`2023-11-${15 + i}T10:00:00Z`),
                updatedAt: new Date(`2023-11-${15 + i}T10:00:00Z`),
                quotations: [],
                awardedQuoteItemIds: [`QI-AWARD-${i + 1}-${isAppleWinner ? 'A' : 'B'}`]
            };
        })
    ],

    auditLogs: [
        // Logs for standard requisitions
        { id: 'log-001', timestamp: new Date('2023-10-26T10:00:00Z'), user: 'Alice', role: 'Requester', action: 'CREATE', entity: 'Requisition', entityId: 'REQ-1672531200', details: 'Created new requisition for "New Laptops for Design Team"',},
        { id: 'log-002', timestamp: new Date('2023-10-26T11:30:00Z'), user: 'Diana', role: 'Admin', action: 'APPROVE', entity: 'Requisition', entityId: 'REQ-1672531200', details: 'Approved requisition.', },
        // Logs for split-award test requisition
        { id: 'log-split-001', timestamp: new Date('2023-11-10T10:00:00Z'), user: 'Charlie', role: 'Procurement_Officer', action: 'FINALIZE_AWARD', entity: 'Requisition', entityId: 'REQ-SPLIT-AWARD-01', details: 'Finalized split award for "New Branch Office Furniture".', transactionId: 'REQ-SPLIT-AWARD-01'},
        { id: 'log-split-002', timestamp: new Date('2023-11-10T11:00:00Z'), user: 'Apple Inc.', role: 'Vendor', action: 'ACCEPT_AWARD', entity: 'Quotation', entityId: 'QUO-SPLIT-A', details: 'Vendor accepted award for Executive Desks. PO PO-SPLIT-001 auto-generated.', transactionId: 'REQ-SPLIT-AWARD-01'},
        { id: 'log-split-003', timestamp: new Date('2023-11-12T14:00:00Z'), user: 'David', role: 'Receiving', action: 'RECEIVE_GOODS', entity: 'PurchaseOrder', entityId: 'PO-SPLIT-001', details: 'Received all 5 Executive Desks.', transactionId: 'REQ-SPLIT-AWARD-01'},
        { id: 'log-split-004', timestamp: new Date('2023-11-13T10:00:00Z'), user: 'Eve', role: 'Finance', action: 'PROCESS_PAYMENT', entity: 'Invoice', entityId: 'INV-SPLIT-001', details: 'Processed payment for invoice INV-SPLIT-001.', transactionId: 'REQ-SPLIT-AWARD-01'},
    ],

    quotations: [
        // Standard quotes for laptop req
        { id: 'QUO-001', transactionId: 'REQ-1672531200', requisitionId: 'REQ-1672531200', vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', items: [ { id: 'QI-001', requisitionItemId: 'ITEM-1', name: 'MacBook Pro 16-inch', quantity: 5, unitPrice: 2450, leadTimeDays: 14 }, { id: 'QI-002', requisitionItemId: 'ITEM-2', name: '4K Monitor', quantity: 5, unitPrice: 780, leadTimeDays: 10 } ], totalPrice: 16150, deliveryDate: new Date('2023-11-15T00:00:00Z'), createdAt: new Date('2023-10-06T10:00:00Z'), status: 'Submitted', notes: 'Bulk discount applied. Warranty included.'},
        { id: 'QUO-002', transactionId: 'REQ-1672531200', requisitionId: 'REQ-1672531200', vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', items: [ { id: 'QI-003', requisitionItemId: 'ITEM-1', name: 'MacBook Pro 16-inch', quantity: 5, unitPrice: 2550, leadTimeDays: 20 }, { id: 'QI-004', requisitionItemId: 'ITEM-2', name: '4K Monitor', quantity: 5, unitPrice: 750, leadTimeDays: 5 } ], totalPrice: 16500, deliveryDate: new Date('2023-11-20T00:00:00Z'), createdAt: new Date('2023-10-07T14:30:00Z'), status: 'Submitted', notes: 'Can ship monitors immediately.'},
        
        // Quotes for the split award test case
        {
            id: 'QUO-SPLIT-A',
            transactionId: 'REQ-SPLIT-AWARD-01',
            requisitionId: 'REQ-SPLIT-AWARD-01',
            vendorId: 'VENDOR-001',
            vendorName: 'Apple Inc.',
            items: [
                { id: 'QI-SPLIT-A1', requisitionItemId: 'ITEM-SPLIT-1', name: 'Executive Desk', quantity: 5, unitPrice: 15000, leadTimeDays: 20 }
            ],
            totalPrice: 75000,
            deliveryDate: new Date('2023-12-01T00:00:00Z'),
            createdAt: new Date('2023-11-05T10:00:00Z'),
            status: 'Paid',
        },
        {
            id: 'QUO-SPLIT-B',
            transactionId: 'REQ-SPLIT-AWARD-01',
            requisitionId: 'REQ-SPLIT-AWARD-01',
            vendorId: 'VENDOR-002',
            vendorName: 'Dell Technologies',
            items: [
                { id: 'QI-SPLIT-B2', requisitionItemId: 'ITEM-SPLIT-2', name: 'Conference Table', quantity: 1, unitPrice: 40000, leadTimeDays: 25 }
            ],
            totalPrice: 40000,
            deliveryDate: new Date('2023-12-05T00:00:00Z'),
            createdAt: new Date('2023-11-05T11:00:00Z'),
            status: 'Awarded', // This vendor has been awarded but has not accepted yet
        },

        // Quotes for the NEW partial award test case
        {
            id: 'QUO-PARTIAL-A',
            transactionId: 'REQ-PARTIAL-TEST-01',
            requisitionId: 'REQ-PARTIAL-TEST-01',
            vendorId: 'VENDOR-001', // Apple
            vendorName: 'Apple Inc.',
            items: [
                { id: 'QI-PARTIAL-A1', requisitionItemId: 'ITEM-PARTIAL-1', name: 'High-Performance Laptop', quantity: 10, unitPrice: 30000, leadTimeDays: 14 },
                { id: 'QI-PARTIAL-A2', requisitionItemId: 'ITEM-PARTIAL-2', name: '27-inch 4K Monitor', quantity: 20, unitPrice: 8500, leadTimeDays: 10 },
            ],
            totalPrice: 470000,
            deliveryDate: new Date('2023-12-20T00:00:00Z'),
            createdAt: new Date('2023-12-02T10:00:00Z'),
            status: 'Pending_Award', // Apple is awarded Laptops
        },
        {
            id: 'QUO-PARTIAL-B',
            transactionId: 'REQ-PARTIAL-TEST-01',
            requisitionId: 'REQ-PARTIAL-TEST-01',
            vendorId: 'VENDOR-002', // Dell
            vendorName: 'Dell Technologies',
            items: [
                { id: 'QI-PARTIAL-B1', requisitionItemId: 'ITEM-PARTIAL-1', name: 'High-Performance Laptop', quantity: 10, unitPrice: 31000, leadTimeDays: 12 },
                { id: 'QI-PARTIAL-B2', requisitionItemId: 'ITEM-PARTIAL-2', name: '27-inch 4K Monitor', quantity: 20, unitPrice: 8000, leadTimeDays: 5 },
            ],
            totalPrice: 470000,
            deliveryDate: new Date('2023-12-18T00:00:00Z'),
            createdAt: new Date('2023-12-02T11:00:00Z'),
            status: 'Pending_Award', // Dell is awarded Monitors
        },


         // --- 20 NEW QUOTATIONS FOR THE AWARD TESTS ---
        ...Array.from({ length: 10 }).flatMap((_, i) => {
            const isAppleWinner = i % 2 === 0;
            const winnerPrice = 100000;
            const loserPrice = 105000;

            const appleQuote = {
                id: `QUO-AWARD-${i + 1}-A`,
                transactionId: `REQ-AWARD-TEST-${i + 1}`,
                requisitionId: `REQ-AWARD-TEST-${i + 1}`,
                vendorId: 'VENDOR-001',
                vendorName: 'Apple Inc.',
                items: [{ id: `QI-AWARD-${i + 1}-A`, requisitionItemId: `ITEM-AWARD-${i + 1}`, name: 'High-End Laptop', quantity: 50, unitPrice: isAppleWinner ? 2000 : 2100, leadTimeDays: 14 }],
                totalPrice: isAppleWinner ? winnerPrice : loserPrice,
                deliveryDate: new Date(`2023-12-01T00:00:00Z`),
                createdAt: new Date(`2023-11-${15 + i}T11:00:00Z`),
                status: isAppleWinner ? 'Pending_Award' : 'Standby',
                rank: isAppleWinner ? 1 : 2,
            };

            const dellQuote = {
                id: `QUO-AWARD-${i + 1}-B`,
                transactionId: `REQ-AWARD-TEST-${i + 1}`,
                requisitionId: `REQ-AWARD-TEST-${i + 1}`,
                vendorId: 'VENDOR-002',
                vendorName: 'Dell Technologies',
                items: [{ id: `QI-AWARD-${i + 1}-B`, requisitionItemId: `ITEM-AWARD-${i + 1}`, name: 'High-End Laptop', quantity: 50, unitPrice: !isAppleWinner ? 2000 : 2100, leadTimeDays: 12 }],
                totalPrice: !isAppleWinner ? winnerPrice : loserPrice,
                deliveryDate: new Date(`2023-12-01T00:00:00Z`),
                createdAt: new Date(`2023-11-${15 + i}T12:00:00Z`),
                status: !isAppleWinner ? 'Pending_Award' : 'Standby',
                rank: !isAppleWinner ? 1 : 2,
            };

            return [appleQuote, dellQuote];
        })
    ],
    purchaseOrders: [
        // PO for the split-award test (Vendor A's part)
        {
            id: 'PO-SPLIT-001',
            transactionId: 'REQ-SPLIT-AWARD-01',
            requisitionId: 'REQ-SPLIT-AWARD-01',
            requisitionTitle: 'New Branch Office Furniture (Split Award Test)',
            vendor: { id: 'VENDOR-001', userId: '6', name: 'Apple Inc.', contactPerson: 'Tim Cook', email: 'tade2024bdugit@gmail.com', phone: '1-800-MY-APPLE', address: '1 Apple Park Way', kycStatus: 'Verified' },
            items: [
                { id: 'PO-ITEM-SPLIT-1', name: 'Executive Desk', requisitionItemId: 'ITEM-SPLIT-1', quantity: 5, unitPrice: 15000, totalPrice: 75000, receivedQuantity: 5 }
            ],
            totalAmount: 75000,
            status: 'Delivered', // This part is fully delivered
            createdAt: new Date('2023-11-10T11:00:00Z')
        }
    ],
    goodsReceipts: [
        {
            id: 'GRN-SPLIT-001',
            transactionId: 'REQ-SPLIT-AWARD-01',
            purchaseOrderId: 'PO-SPLIT-001',
            receivedById: '4', // David
            receivedBy: { id: '4', name: 'David', email: 'david@example.com', role: 'Receiving' },
            receivedDate: new Date('2023-11-12T14:00:00Z'),
            items: [
                { poItemId: 'PO-ITEM-SPLIT-1', quantityReceived: 5, condition: 'Good' }
            ]
        }
    ],
    invoices: [
        {
            id: 'INV-SPLIT-001',
            transactionId: 'REQ-SPLIT-AWARD-01',
            purchaseOrderId: 'PO-SPLIT-001',
            vendorId: 'VENDOR-001',
            invoiceDate: new Date('2023-11-12T15:00:00Z'),
            items: [
                { id: 'INV-ITEM-SPLIT-1', name: 'Executive Desk', quantity: 5, unitPrice: 15000, totalPrice: 75000 }
            ],
            totalAmount: 75000,
            status: 'Paid',
            paymentDate: new Date('2023-11-13T10:00:00Z'),
            paymentReference: 'PAY-SPLIT-98765'
        }
    ],
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
