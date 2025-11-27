
import type { PurchaseRequisition, AuditLog, Vendor, Quotation, PurchaseOrder, GoodsReceiptNote, Invoice, User, Department, PerItemAwardDetail } from './types';

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
  const initialData = structuredClone(seedData);
  return initialData;
}

const seedData: AppData = {
    vendors: [
        {
            id: 'VENDOR-001',
            userId: '6',
            name: 'Apple Inc.',
            contactPerson: 'Tim Cook',
            email: 'vendor.apple@example.com',
            phone: '1-800-MY-APPLE',
            address: '1 Apple Park Way, Cupertino, CA 95014',
            kycStatus: 'Verified',
        },
        {
            id: 'VENDOR-002',
            userId: '7',
            name: 'Dell Technologies',
            contactPerson: 'Michael Dell',
            email: 'vendor.dell@example.com',
            phone: '1-877-275-3355',
            address: '1 Dell Way, Round Rock, TX 78682',
            kycStatus: 'Verified',
        },
        {
            id: 'VENDOR-003',
            name: 'HP Inc.',
            userId: '8',
            contactPerson: 'Enrique Lores',
            email: 'vendor.hp@example.com',
            phone: '1-800-474-6836',
            address: '1501 Page Mill Rd, Palo Alto, CA 94304',
            kycStatus: 'Verified',
        }
    ],

    users: [
        { id: '1', name: 'Alice (Requester)', email: 'alice@example.com', password: 'password123', role: 'Requester', departmentId: 'DEPT-1', department: 'Design' },
        { id: '3', name: 'Charlie (Procurement)', email: 'charlie@example.com', password: 'password123', role: 'Procurement_Officer', departmentId: 'DEPT-2', department: 'Operations' },
        { id: '5', name: 'Eve (Finance)', email: 'eve@example.com', password: 'password123', role: 'Finance', departmentId: 'DEPT-5', department: 'Finance' },
        { id: '4', name: 'David (Receiving)', email: 'david@example.com', password: 'password123', role: 'Receiving', departmentId: 'DEPT-2', department: 'Operations' },
        { id: '12', name: 'Diana (Admin)', email: 'diana@example.com', password: 'password123', role: 'Admin', departmentId: 'DEPT-1' },
        { id: '6', name: 'Apple Vendor User', email: 'vendor.apple@example.com', password: 'password123', role: 'Vendor', vendorId: 'VENDOR-001' },
        { id: '7', name: 'Dell Vendor User', email: 'vendor.dell@example.com', password: 'password123', role: 'Vendor', vendorId: 'VENDOR-002' },
        { id: '8', name: 'HP Vendor User', email: 'vendor.hp@example.com', password: 'password123', role: 'Vendor', vendorId: 'VENDOR-003' },
        { id: '9', name: 'Fiona (Committee)', email: 'fiona@example.com', password: 'password123', role: 'Committee_Member', departmentId: 'DEPT-1', department: 'Design' },
        { id: '10', name: 'George (Committee)', email: 'george@example.com', password: 'password123', role: 'Committee_Member', departmentId: 'DEPT-3', department: 'IT' },
        { id: '15', name: 'Manager (Approval)', email: 'manager.proc@example.com', password: 'password123', role: 'Manager_Procurement_Division', departmentId: 'DEPT-2', department: 'Operations' },
    ],

    departments: [
        { id: 'DEPT-1', name: 'Design', description: 'Handles all creative and design tasks.', headId: '12' },
        { id: 'DEPT-2', name: 'Operations', description: 'Manages day-to-day business operations.', headId: null },
        { id: 'DEPT-3', name: 'IT', description: 'Manages all technology and infrastructure.', headId: null },
        { id: 'DEPT-5', name: 'Finance', description: 'Handles all financial matters.', headId: '5' },
    ],

    requisitions: [
        // --- SCENARIO A: Multi-Vendor Win (Happy Path) ---
        // GOAL: Test that two vendors can win, accept, and get paid independently. Requisition should only close at the very end.
        {
            id: 'REQ-SCENARIO-A',
            requesterId: '1',
            title: 'Scenario A: Multi-Vendor Win',
            department: 'Design',
            departmentId: 'DEPT-1',
            totalPrice: 275000, // 250k for PCs + 25k for Chairs
            justification: 'Full lifecycle test for per-item awards.',
            status: 'PO_Created',
            urgency: 'Medium',
            createdAt: new Date('2024-05-10T10:00:00Z'),
            updatedAt: new Date('2024-05-20T11:00:00Z'),
            rfqSettings: { awardStrategy: 'item' },
            items: [
                {
                    id: 'ITEM-A1',
                    name: 'High-End PC',
                    quantity: 100,
                    unitPrice: 2500,
                    perItemAwardDetails: [
                        { rank: 1, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', quotationId: 'QUO-A1', quoteItemId: 'QITEM-A1', proposedItemName: 'Mac Studio', unitPrice: 2500, status: 'Accepted' },
                        { rank: 2, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', quotationId: 'QUO-A2', quoteItemId: 'QITEM-A2', proposedItemName: 'Dell XPS Tower', unitPrice: 2400, status: 'Standby' }
                    ] as PerItemAwardDetail[]
                },
                {
                    id: 'ITEM-A2',
                    name: 'Ergonomic Chair',
                    quantity: 100,
                    unitPrice: 250,
                    perItemAwardDetails: [
                        { rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', quotationId: 'QUO-A2', quoteItemId: 'QITEM-A3', proposedItemName: 'Herman Miller Aeron', unitPrice: 250, status: 'Accepted' },
                        { rank: 2, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', quotationId: 'QUO-A3', quoteItemId: 'QITEM-A4', proposedItemName: 'HP Ergonomic Chair', unitPrice: 220, status: 'Standby' }
                    ] as PerItemAwardDetail[]
                },
            ],
        } as unknown as PurchaseRequisition,

        // --- SCENARIO B: Decline and Standby Promotion ---
        // GOAL: Test that if a winning vendor declines an item, the Procurement Officer can correctly promote the standby vendor for *that specific item* without affecting other awarded items.
        {
            id: 'REQ-SCENARIO-B',
            requesterId: '1',
            title: 'Scenario B: Decline & Promote',
            department: 'IT',
            departmentId: 'DEPT-3',
            totalPrice: 60000,
            justification: 'Test standby promotion logic for a specific item.',
            status: 'Awarded', // Simulating that awards have been sent out.
            urgency: 'High',
            createdAt: new Date('2024-05-11T00:00:00Z'),
            updatedAt: new Date('2024-05-21T00:00:00Z'),
            rfqSettings: { awardStrategy: 'item' },
            items: [
                {
                    id: 'ITEM-B1',
                    name: '4K Security Camera',
                    quantity: 50,
                    unitPrice: 800,
                    perItemAwardDetails: [
                        { rank: 1, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', quotationId: 'QUO-B1', quoteItemId: 'QITEM-B1', proposedItemName: 'Axis 4K Camera', unitPrice: 800, status: 'Awarded' },
                        { rank: 2, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', quotationId: 'QUO-B3', quoteItemId: 'QITEM-B4', proposedItemName: 'HP Security Cam', unitPrice: 750, status: 'Standby' }
                    ] as PerItemAwardDetail[]
                },
                {
                    id: 'ITEM-B2',
                    name: '24-Port Network Switch',
                    quantity: 10,
                    unitPrice: 2000,
                    perItemAwardDetails: [
                        { rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', quotationId: 'QUO-B2', quoteItemId: 'QITEM-B3', proposedItemName: 'Cisco Catalyst', unitPrice: 2000, status: 'Awarded' }
                    ] as PerItemAwardDetail[]
                },
            ]
        } as unknown as PurchaseRequisition,

        // --- SCENARIO C: Full Exhaustion & Restart ---
        // GOAL: Test that if all vendors decline, the item can be put into a restart flow.
        {
            id: 'REQ-SCENARIO-C',
            requesterId: '1',
            title: 'Scenario C: Standby Exhaustion',
            department: 'Operations',
            departmentId: 'DEPT-2',
            totalPrice: 15000,
            justification: 'Test what happens when all vendors for an item decline.',
            status: 'Award_Declined', // State after the second vendor has declined.
            urgency: 'Medium',
            createdAt: new Date('2024-05-12T00:00:00Z'),
            updatedAt: new Date('2024-05-22T00:00:00Z'),
            rfqSettings: { awardStrategy: 'item' },
            items: [
                {
                    id: 'ITEM-C1',
                    name: 'Conference Room Projector',
                    quantity: 5,
                    unitPrice: 3000,
                    perItemAwardDetails: [
                        { rank: 1, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', quotationId: 'QUO-C1', quoteItemId: 'QITEM-C1', proposedItemName: 'Epson Pro', unitPrice: 3000, status: 'Failed_to_Award' },
                        { rank: 2, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', quotationId: 'QUO-C2', quoteItemId: 'QITEM-C2', proposedItemName: 'BenQ Projector', unitPrice: 2800, status: 'Failed_to_Award' },
                        { rank: 3, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', quotationId: 'QUO-C3', quoteItemId: 'QITEM-C3', proposedItemName: 'ViewSonic 4K', unitPrice: 3100, status: 'Awarded' }
                    ] as PerItemAwardDetail[]
                }
            ]
        } as unknown as PurchaseRequisition,

        // --- SCENARIO D: Partial Payment State (THE CRITICAL BUG TEST) ---
        // GOAL: Ensure paying for one item does not close the whole requisition, blocking other items.
        {
            id: 'REQ-SCENARIO-D',
            requesterId: '1',
            title: 'Scenario D: Partial Payment Test',
            department: 'IT',
            departmentId: 'DEPT-3',
            totalPrice: 160000,
            justification: 'Test to ensure the requisition stays open while some items are still pending award.',
            status: 'PO_Created', // State is driven by POs, but items have different states.
            urgency: 'Low',
            createdAt: new Date('2024-05-13T00:00:00Z'),
            updatedAt: new Date('2024-05-23T00:00:00Z'),
            rfqSettings: { awardStrategy: 'item' },
            items: [
                {
                    id: 'ITEM-D1',
                    name: 'USB-C Docking Station',
                    quantity: 100,
                    unitPrice: 400,
                    perItemAwardDetails: [
                        { rank: 1, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', quotationId: 'QUO-D1', quoteItemId: 'QITEM-D1', proposedItemName: 'CalDigit TS4', unitPrice: 400, status: 'Accepted' }
                    ] as PerItemAwardDetail[]
                },
                {
                    id: 'ITEM-D2',
                    name: '4K Monitor',
                    quantity: 100,
                    unitPrice: 1200,
                    perItemAwardDetails: [
                        { rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', quotationId: 'QUO-D2', quoteItemId: 'QITEM-D2', proposedItemName: 'Dell UltraSharp', unitPrice: 1200, status: 'Awarded' }
                    ] as PerItemAwardDetail[]
                },
            ]
        } as unknown as PurchaseRequisition,
    ],

    // --- Supporting Data for Scenarios ---
    quotations: [
        // Scenario A
        { id: 'QUO-A1', requisitionId: 'REQ-SCENARIO-A', vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', status: 'Accepted', totalPrice: 250000, createdAt: new Date('2024-05-15T09:00:00Z'), deliveryDate: new Date('2024-05-30T09:00:00Z'), items: [{id: 'QITEM-A1', requisitionItemId: 'ITEM-A1', name: 'Mac Studio', quantity: 100, unitPrice: 2500, leadTimeDays: 15}] },
        { id: 'QUO-A2', requisitionId: 'REQ-SCENARIO-A', vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Accepted', totalPrice: 265000, createdAt: new Date('2024-05-15T10:00:00Z'), deliveryDate: new Date('2024-05-31T10:00:00Z'), items: [{id: 'QITEM-A2', requisitionItemId: 'ITEM-A1', name: 'Dell XPS Tower', quantity: 100, unitPrice: 2400, leadTimeDays: 10}, {id: 'QITEM-A3', requisitionItemId: 'ITEM-A2', name: 'Herman Miller Aeron', quantity: 100, unitPrice: 250, leadTimeDays: 20}] },
        { id: 'QUO-A3', requisitionId: 'REQ-SCENARIO-A', vendorId: 'VENDOR-003', vendorName: 'HP Inc.', status: 'Standby', totalPrice: 22000, createdAt: new Date('2024-05-15T11:00:00Z'), deliveryDate: new Date('2024-06-01T11:00:00Z'), items: [{id: 'QITEM-A4', requisitionItemId: 'ITEM-A2', name: 'HP Ergonomic Chair', quantity: 100, unitPrice: 220, leadTimeDays: 12}] },
        // Scenario B
        { id: 'QUO-B1', requisitionId: 'REQ-SCENARIO-B', vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', status: 'Awarded', totalPrice: 40000, createdAt: new Date('2024-05-16T09:00:00Z'), deliveryDate: new Date('2024-06-02T09:00:00Z'), items: [{id: 'QITEM-B1', requisitionItemId: 'ITEM-B1', name: 'Axis 4K Camera', quantity: 50, unitPrice: 800, leadTimeDays: 14}] },
        { id: 'QUO-B2', requisitionId: 'REQ-SCENARIO-B', vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Awarded', totalPrice: 20000, createdAt: new Date('2024-05-16T10:00:00Z'), deliveryDate: new Date('2024-06-03T10:00:00Z'), items: [{id: 'QITEM-B3', requisitionItemId: 'ITEM-B2', name: 'Cisco Catalyst', quantity: 10, unitPrice: 2000, leadTimeDays: 7}] },
        { id: 'QUO-B3', requisitionId: 'REQ-SCENARIO-B', vendorId: 'VENDOR-003', vendorName: 'HP Inc.', status: 'Standby', totalPrice: 37500, createdAt: new Date('2024-05-16T11:00:00Z'), deliveryDate: new Date('2024-06-04T11:00:00Z'), items: [{id: 'QITEM-B4', requisitionItemId: 'ITEM-B1', name: 'HP Security Cam', quantity: 50, unitPrice: 750, leadTimeDays: 18}] },
        // Scenario C
        { id: 'QUO-C1', requisitionId: 'REQ-SCENARIO-C', vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', status: 'Failed_to_Award', totalPrice: 15000, createdAt: new Date('2024-05-17T09:00:00Z'), deliveryDate: new Date('2024-06-05T09:00:00Z'), items: [{id: 'QITEM-C1', requisitionItemId: 'ITEM-C1', name: 'Epson Pro', quantity: 5, unitPrice: 3000, leadTimeDays: 10}] },
        { id: 'QUO-C2', requisitionId: 'REQ-SCENARIO-C', vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Failed_to_Award', totalPrice: 14000, createdAt: new Date('2024-05-17T10:00:00Z'), deliveryDate: new Date('2024-06-06T10:00:00Z'), items: [{id: 'QITEM-C2', requisitionItemId: 'ITEM-C1', name: 'BenQ Projector', quantity: 5, unitPrice: 2800, leadTimeDays: 21}] },
        { id: 'QUO-C3', requisitionId: 'REQ-SCENARIO-C', vendorId: 'VENDOR-003', vendorName: 'HP Inc.', status: 'Awarded', totalPrice: 15500, createdAt: new Date('2024-05-17T11:00:00Z'), deliveryDate: new Date('2024-06-07T11:00:00Z'), items: [{id: 'QITEM-C3', requisitionItemId: 'ITEM-C1', name: 'ViewSonic 4K', quantity: 5, unitPrice: 3100, leadTimeDays: 16}] },
        // Scenario D
        { id: 'QUO-D1', requisitionId: 'REQ-SCENARIO-D', vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', status: 'Accepted', totalPrice: 40000, createdAt: new Date('2024-05-18T09:00:00Z'), deliveryDate: new Date('2024-06-08T09:00:00Z'), items: [{id: 'QITEM-D1', requisitionItemId: 'ITEM-D1', name: 'CalDigit TS4', quantity: 100, unitPrice: 400, leadTimeDays: 5}] },
        { id: 'QUO-D2', requisitionId: 'REQ-SCENARIO-D', vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Awarded', totalPrice: 120000, createdAt: new Date('2024-05-18T10:00:00Z'), deliveryDate: new Date('2024-06-09T10:00:00Z'), items: [{id: 'QITEM-D2', requisitionItemId: 'ITEM-D2', name: 'Dell UltraSharp', quantity: 100, unitPrice: 1200, leadTimeDays: 14}] },

    ] as unknown as Quotation[],

    purchaseOrders: [
        { id: 'PO-SCENARIO-A1', requisitionId: 'REQ-SCENARIO-A', vendor: {id: 'VENDOR-001', name: 'Apple Inc.'}, totalAmount: 250000, status: 'Delivered', createdAt: new Date(), items: [{id: 'POITEM-A1', name: 'Mac Studio', quantity: 100, unitPrice: 2500, totalPrice: 250000, requisitionItemId: 'ITEM-A1'}] },
        { id: 'PO-SCENARIO-A2', requisitionId: 'REQ-SCENARIO-A', vendor: {id: 'VENDOR-002', name: 'Dell Technologies'}, totalAmount: 25000, status: 'Delivered', createdAt: new Date(), items: [{id: 'POITEM-A2', name: 'Herman Miller Aeron', quantity: 100, unitPrice: 250, totalPrice: 25000, requisitionItemId: 'ITEM-A2'}] },
        { id: 'PO-SCENARIO-D1', requisitionId: 'REQ-SCENARIO-D', vendor: {id: 'VENDOR-001', name: 'Apple Inc.'}, totalAmount: 40000, status: 'Delivered', createdAt: new Date(), items: [{id: 'POITEM-D1', name: 'CalDigit TS4', quantity: 100, unitPrice: 400, totalPrice: 40000, requisitionItemId: 'ITEM-D1'}] },
    ] as unknown as PurchaseOrder[],

    invoices: [
        { id: 'INV-SCENARIO-A1', purchaseOrderId: 'PO-SCENARIO-A1', vendorId: 'VENDOR-001', invoiceDate: new Date(), totalAmount: 250000, status: 'Paid', paymentDate: new Date(), items: [{id: 'INVITEM-A1', name: 'Mac Studio', quantity: 100, unitPrice: 2500, totalPrice: 250000}] },
        { id: 'INV-SCENARIO-A2', purchaseOrderId: 'PO-SCENARIO-A2', vendorId: 'VENDOR-002', invoiceDate: new Date(), totalAmount: 25000, status: 'Paid', paymentDate: new Date(), items: [{id: 'INVITEM-A2', name: 'Herman Miller Aeron', quantity: 100, unitPrice: 250, totalPrice: 25000}] },
        { id: 'INV-SCENARIO-D1', purchaseOrderId: 'PO-SCENARIO-D1', vendorId: 'VENDOR-001', invoiceDate: new Date(), totalAmount: 40000, status: 'Paid', paymentDate: new Date(), items: [{id: 'INVITEM-D1', name: 'CalDigit TS4', quantity: 100, unitPrice: 400, totalPrice: 40000}] },
    ] as unknown as Invoice[],

    goodsReceipts: [
        { id: 'GRN-SCENARIO-A1', purchaseOrderId: 'PO-SCENARIO-A1', receivedById: '4', receivedDate: new Date(), items: [{poItemId: 'POITEM-A1', quantityReceived: 100, condition: 'Good'}] },
        { id: 'GRN-SCENARIO-A2', purchaseOrderId: 'PO-SCENARIO-A2', receivedById: '4', receivedDate: new Date(), items: [{poItemId: 'POITEM-A2', quantityReceived: 100, condition: 'Good'}] },
        { id: 'GRN-SCENARIO-D1', purchaseOrderId: 'PO-SCENARIO-D1', receivedById: '4', receivedDate: new Date(), items: [{poItemId: 'POITEM-D1', quantityReceived: 100, condition: 'Good'}] },
    ] as unknown as GoodsReceiptNote[],

    auditLogs: [],
};
