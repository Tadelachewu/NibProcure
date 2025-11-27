
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
        { id: 'VENDOR-001', userId: '6', name: 'Apple Inc.', contactPerson: 'Tim Cook', email: 'vendor.apple@example.com', phone: '1-800-MY-APPLE', address: '1 Apple Park Way, Cupertino, CA 95014', kycStatus: 'Verified' },
        { id: 'VENDOR-002', userId: '7', name: 'Dell Technologies', contactPerson: 'Michael Dell', email: 'vendor.dell@example.com', phone: '1-877-275-3355', address: '1 Dell Way, Round Rock, TX 78682', kycStatus: 'Verified' },
        { id: 'VENDOR-003', userId: '8', name: 'HP Inc.', contactPerson: 'Enrique Lores', email: 'vendor.hp@example.com', phone: '1-800-474-6836', address: '1501 Page Mill Rd, Palo Alto, CA 94304', kycStatus: 'Verified' },
        { id: 'VENDOR-004', userId: '13', name: 'Logitech', contactPerson: 'Bracken Darrell', email: 'vendor.logi@example.com', phone: '1-510-795-8500', address: '7700 Gateway Blvd, Newark, CA 94560', kycStatus: 'Verified' },
        { id: 'VENDOR-005', userId: '14', name: 'Samsung Electronics', contactPerson: 'Kim Hyun Suk', email: 'vendor.samsung@example.com', phone: '1-800-726-7864', address: '1320-10 Seocho 2-dong, Seoul, South Korea', kycStatus: 'Verified' },
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
        { id: '13', name: 'Logi Vendor User', email: 'vendor.logi@example.com', password: 'password123', role: 'Vendor', vendorId: 'VENDOR-004' },
        { id: '14', name: 'Samsung Vendor User', email: 'vendor.samsung@example.com', password: 'password123', role: 'Vendor', vendorId: 'VENDOR-005' },
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
        // --- CASE 1: HAPPY PATH (Multi-Vendor Win) - 4 Requisitions ---
        { id: 'REQ-HP-1', status: 'Closed', title: 'HP-1: Office Upgrade', departmentId: 'DEPT-2', items: [
            { id: 'HP1-I1', name: 'Laptop', unitPrice: 1500, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', score: 95, status: 'Accepted' }] },
            { id: 'HP1-I2', name: 'Monitor', unitPrice: 400, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', score: 92, status: 'Accepted' }] }
        ]},
        { id: 'REQ-HP-2', status: 'PO_Created', title: 'HP-2: New Hire Kits', departmentId: 'DEPT-1', items: [
            { id: 'HP2-I1', name: 'Keyboard', unitPrice: 80, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-004', vendorName: 'Logitech', score: 91, status: 'Accepted' }] },
            { id: 'HP2-I2', name: 'Mouse', unitPrice: 50, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-004', vendorName: 'Logitech', score: 93, status: 'Accepted' }] },
            { id: 'HP2-I3', name: 'Webcam', unitPrice: 120, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', score: 88, status: 'Accepted' }] }
        ]},
        { id: 'REQ-HP-3', status: 'Awarded', title: 'HP-3: Marketing Event Gear', departmentId: 'DEPT-1', items: [
            { id: 'HP3-I1', name: 'Large Display TV', unitPrice: 2000, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', score: 94, status: 'Awarded' }] },
            { id: 'HP3-I2', name: 'Sound System', unitPrice: 800, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', score: 89, status: 'Awarded' }] }
        ]},
        { id: 'REQ-HP-4', status: 'PO_Created', title: 'HP-4: Full Remote Setup', departmentId: 'DEPT-3', items: [
            { id: 'HP4-I1', name: 'Ergonomic Chair', unitPrice: 500, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', score: 91, status: 'Accepted'}]},
            { id: 'HP4-I2', name: 'Standing Desk', unitPrice: 700, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', score: 90, status: 'Accepted' }]}
        ]},

        // --- CASE 2: DECLINE & PROMOTE - 4 Requisitions ---
        { id: 'REQ-DP-1', status: 'Award_Declined', title: 'DP-1: Server Room Upgrade', departmentId: 'DEPT-3', items: [
            { id: 'DP1-I1', name: 'Rack Server', unitPrice: 5000, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', score: 90, status: 'Declined' }, { rank: 2, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', score: 88, status: 'Standby' }] },
            { id: 'DP1-I2', name: 'UPS Backup', unitPrice: 1200, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', score: 92, status: 'Accepted' }] }
        ]},
        { id: 'REQ-DP-2', status: 'Award_Declined', title: 'DP-2: Mobile Device Refresh', departmentId: 'DEPT-2', items: [
            { id: 'DP2-I1', name: 'Smartphone', unitPrice: 900, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', score: 95, status: 'Awarded' }] },
            { id: 'DP2-I2', name: 'Tablet', unitPrice: 700, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', score: 93, status: 'Declined' }, { rank: 2, vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', score: 91, status: 'Standby' }] }
        ]},
        { id: 'REQ-DP-3', status: 'Awarded', title: 'DP-3: Security System Overhaul', departmentId: 'DEPT-2', items: [
            { id: 'DP3-I1', name: 'IP Camera', unitPrice: 300, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-004', vendorName: 'Logitech', score: 85, status: 'Awarded' }, { rank: 2, vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', score: 84, status: 'Standby'}] },
            { id: 'DP3-I2', name: 'Access Control Panel', unitPrice: 1500, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', score: 89, status: 'Awarded' }] }
        ]},
         { id: 'REQ-DP-4', status: 'Award_Declined', title: 'DP-4: Design Studio Monitors', departmentId: 'DEPT-1', items: [
            { id: 'DP4-I1', name: 'Color-Accurate Monitor', unitPrice: 1800, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', score: 96, status: 'Declined' }, { rank: 2, vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', score: 94, status: 'Standby' }, { rank: 3, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', score: 92, status: 'Standby' }] }
        ]},

        // --- CASE 3: EXHAUSTION & RESTART - 4 Requisitions ---
        { id: 'REQ-ER-1', status: 'Award_Declined', title: 'ER-1: Specialized Printing Press', departmentId: 'DEPT-2', items: [
            { id: 'ER1-I1', name: '3D Printer', unitPrice: 8000, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', score: 85, status: 'Failed_to_Award' }, { rank: 2, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', score: 82, status: 'Failed_to_Award' }, { rank: 3, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', score: 80, status: 'Declined' }] }
        ]},
        { id: 'REQ-ER-2', status: 'Award_Declined', title: 'ER-2: High-Capacity Storage Array', departmentId: 'DEPT-3', items: [
            { id: 'ER2-I1', name: '100TB NAS', unitPrice: 25000, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', score: 91, status: 'Failed_to_Award' }, { rank: 2, vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', score: 89, status: 'Declined' }] }
        ]},
        { id: 'REQ-ER-3', status: 'PO_Created', title: 'ER-3: AV Equipment', departmentId: 'DEPT-1', items: [
            { id: 'ER3-I1', name: 'Projector', unitPrice: 1500, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', score: 88, status: 'Accepted'}] },
            { id: 'ER3-I2', name: 'Conference Mic', unitPrice: 600, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', score: 86, status: 'Failed_to_Award' }, { rank: 2, vendorId: 'VENDOR-004', vendorName: 'Logitech', score: 84, status: 'Declined'}] }
        ]},
        { id: 'REQ-ER-4', status: 'Award_Declined', title: 'ER-4: Custom VR Headsets', departmentId: 'DEPT-1', items: [
            { id: 'ER4-I1', name: 'VR Headset', unitPrice: 3000, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', score: 94, status: 'Declined' }] }
        ]},
        
        // --- CASE 4: PARTIAL PAYMENT - 4 Requisitions ---
        { id: 'REQ-PP-1', status: 'PO_Created', title: 'PP-1: IT Infrastructure', departmentId: 'DEPT-3', items: [
            { id: 'PP1-I1', name: 'Firewall Appliance', unitPrice: 4000, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', score: 93, status: 'Accepted' }] }, // This PO will be Paid
            { id: 'PP1-I2', name: 'Core Switch', unitPrice: 10000, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', score: 91, status: 'Awarded' }] } // This PO will be pending vendor response
        ]},
        { id: 'REQ-PP-2', status: 'PO_Created', title: 'PP-2: Operations Fleet', departmentId: 'DEPT-2', items: [
            { id: 'PP2-I1', name: 'Delivery Van', unitPrice: 40000, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', score: 88, status: 'Accepted'}]}, // Paid
            { id: 'PP2-I2', name: 'GPS Tracker', unitPrice: 200, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', score: 90, status: 'Declined' }, { rank: 2, vendorId: 'VENDOR-004', vendorName: 'Logitech', score: 89, status: 'Standby'}]} // Standby available
        ]},
        { id: 'REQ-PP-3', status: 'Award_Declined', title: 'PP-3: R&D Lab Equipment', departmentId: 'DEPT-3', items: [
            { id: 'PP3-I1', name: 'Oscilloscope', unitPrice: 7000, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', score: 92, status: 'Accepted'}] }, // Paid
            { id: 'PP3-I2', name: 'Spectrum Analyzer', unitPrice: 12000, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', score: 90, status: 'Declined'}] } // No standby
        ]},
        { id: 'REQ-PP-4', status: 'PO_Created', title: 'PP-4: Office Furniture Refresh', departmentId: 'DEPT-2', items: [
            { id: 'PP4-I1', name: 'Desk', unitPrice: 300, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', score: 85, status: 'Accepted' }] }, // Paid
            { id: 'PP4-I2', name: 'Chair', unitPrice: 200, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', score: 88, status: 'Accepted' }] }, // Not paid yet
            { id: 'PP4-I3', name: 'Filing Cabinet', unitPrice: 150, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', score: 86, status: 'Awarded' }] } // Pending
        ]},

         // --- CASE 5: COMPLEX MIXED STATES - 4 Requisitions ---
        { id: 'REQ-MX-1', status: 'Award_Declined', title: 'MX-1: All-In-One Test', departmentId: 'DEPT-1', items: [
            { id: 'MX1-I1', name: 'Item A (Accepted)', unitPrice: 100, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', score: 95, status: 'Accepted'}] },
            { id: 'MX1-I2', name: 'Item B (Declined)', unitPrice: 200, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', score: 94, status: 'Declined'}, { rank: 2, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', score: 93, status: 'Standby'}] },
            { id: 'MX1-I3', name: 'Item C (Awarded)', unitPrice: 300, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-004', vendorName: 'Logitech', score: 92, status: 'Awarded' }] },
            { id: 'MX1-I4', name: 'Item D (Standby)', unitPrice: 400, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', score: 91, status: 'Failed_to_Award' }, { rank: 2, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', score: 90, status: 'Standby' }] }
        ]},
        { id: 'REQ-MX-2', status: 'Awarded', title: 'MX-2: Another Mixed Case', departmentId: 'DEPT-3', items: [
            { id: 'MX2-I1', name: 'Item E (Awarded)', unitPrice: 500, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', score: 99, status: 'Awarded'}] },
            { id: 'MX2-I2', name: 'Item F (Standby)', unitPrice: 600, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', score: 98, status: 'Accepted'}, { rank: 2, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', score: 97, status: 'Standby' }] }
        ]},
        { id: 'REQ-MX-3', status: 'PO_Created', title: 'MX-3: One Paid, One Pending', departmentId: 'DEPT-2', items: [
            { id: 'MX3-I1', name: 'Item G (Paid)', unitPrice: 1000, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-004', vendorName: 'Logitech', score: 96, status: 'Accepted' }] },
            { id: 'MX3-I2', name: 'Item H (Awarded)', unitPrice: 2000, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', score: 95, status: 'Awarded' }] }
        ]},
        { id: 'REQ-MX-4', status: 'Award_Declined', title: 'MX-4: Restart Candidate', departmentId: 'DEPT-1', items: [
            { id: 'MX4-I1', name: 'Item I (Accepted)', unitPrice: 50, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', score: 92, status: 'Accepted' }] },
            { id: 'MX4-I2', name: 'Item J (Failed)', unitPrice: 150, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', score: 91, status: 'Failed_to_Award' }] }
        ]},

    ].map(r => ({ ...r, requesterId: '1', justification: r.title, urgency: 'Medium', createdAt: new Date(), updatedAt: new Date(), rfqSettings: { awardStrategy: 'item' }})) as unknown as PurchaseRequisition[],

    quotations: [] as Quotation[],
    purchaseOrders: [] as PurchaseOrder[],
    invoices: [] as Invoice[],
    goodsReceipts: [] as GoodsReceiptNote[],
    auditLogs: [],
};
