
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
    
    // --- START OF EXPANDED SEED DATA ---
    requisitions: [
        // === HAPPY PATH (HP) SCENARIOS ===
        // Goal: Test a clean run where two different vendors win items on the same req.
        ...[
            { id: 'REQ-HP-1', status: 'Closed', totalPrice: 270000, title: 'HP-1: Office Upgrade', departmentId: 'DEPT-2', items: [
                { id: 'ITEM-HP-1A', name: 'High-End PC', quantity: 100, unitPrice: 2500, perItemAwardDetails: [{ score: 95, rank: 1, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', status: 'Accepted', quoteItemId: 'QITEM-HP-1A', proposedItemName: 'Mac Studio', unitPrice: 2500 }] },
                { id: 'ITEM-HP-1B', name: 'Ergonomic Chair', quantity: 100, unitPrice: 200, perItemAwardDetails: [{ score: 98, rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Accepted', quoteItemId: 'QITEM-HP-1B', proposedItemName: 'Herman Miller Aeron', unitPrice: 200 }] }
            ]},
            { id: 'REQ-HP-2', status: 'Closed', totalPrice: 5500, title: 'HP-2: Marketing Event Kit', departmentId: 'DEPT-1', items: [
                { id: 'ITEM-HP-2A', name: 'Portable Banner', quantity: 5, unitPrice: 300, perItemAwardDetails: [{ score: 92, rank: 1, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', status: 'Accepted', quoteItemId: 'QITEM-HP-2A', proposedItemName: 'Retractable Banner', unitPrice: 300 }] },
                { id: 'ITEM-HP-2B', name: 'HD Projector', quantity: 1, unitPrice: 4000, perItemAwardDetails: [{ score: 94, rank: 1, vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', status: 'Accepted', quoteItemId: 'QITEM-HP-2B', proposedItemName: 'Samsung Freestyle', unitPrice: 4000 }] }
            ]},
            { id: 'REQ-HP-3', status: 'Closed', totalPrice: 3200, title: 'HP-3: Podcasting Studio Setup', departmentId: 'DEPT-3', items: [
                { id: 'ITEM-HP-3A', name: 'USB Microphones', quantity: 4, unitPrice: 400, perItemAwardDetails: [{ score: 96, rank: 1, vendorId: 'VENDOR-004', vendorName: 'Logitech', status: 'Accepted', quoteItemId: 'QITEM-HP-3A', proposedItemName: 'Blue Yeti X', unitPrice: 400 }] },
                { id: 'ITEM-HP-3B', name: 'Acoustic Panels', quantity: 20, unitPrice: 80, perItemAwardDetails: [{ score: 91, rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Accepted', quoteItemId: 'QITEM-HP-3B', proposedItemName: 'Auralex Panels', unitPrice: 80 }] }
            ]},
            { id: 'REQ-HP-4', status: 'Closed', totalPrice: 15500, title: 'HP-4: Network Infrastructure Upgrade', departmentId: 'DEPT-3', items: [
                { id: 'ITEM-HP-4A', name: '48-Port PoE Switch', quantity: 1, unitPrice: 7500, perItemAwardDetails: [{ score: 93, rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Accepted', quoteItemId: 'QITEM-HP-4A', proposedItemName: 'Dell PowerSwitch', unitPrice: 7500 }] },
                { id: 'ITEM-HP-4B', name: 'Wi-Fi 6 Access Points', quantity: 5, unitPrice: 1600, perItemAwardDetails: [{ score: 95, rank: 1, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', status: 'Accepted', quoteItemId: 'QITEM-HP-4B', proposedItemName: 'Aruba AP-535', unitPrice: 1600 }] }
            ]},
        ],
        // === DECLINE & PROMOTE (DP) SCENARIOS ===
        // Goal: Test the workflow where a winning vendor declines, and the PO promotes a standby.
        ...[
            { id: 'REQ-DP-1', status: 'Awarded', totalPrice: 22800, title: 'DP-1: Security System Overhaul', departmentId: 'DEPT-2', items: [
                { id: 'ITEM-DP-1A', name: 'IP Security Cameras', quantity: 20, unitPrice: 150, perItemAwardDetails: [
                    { score: 91, rank: 1, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', status: 'Awarded', quoteItemId: 'QITEM-DP-1A', proposedItemName: 'Generic Cam', unitPrice: 150 },
                    { score: 90, rank: 2, vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', status: 'Standby', quoteItemId: 'QITEM-DP-1B', proposedItemName: 'Samsung Cam', unitPrice: 140 }
                ]},
                { id: 'ITEM-DP-1B', name: 'Network Video Recorder', quantity: 1, unitPrice: 2000, perItemAwardDetails: [{ score: 94, rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Awarded', quoteItemId: 'QITEM-DP-1C', proposedItemName: 'Dell NVR', unitPrice: 2000 }] }
            ]},
            { id: 'REQ-DP-2', status: 'Awarded', totalPrice: 1800, title: 'DP-2: Graphics Tablets for Design', departmentId: 'DEPT-1', items: [
                { id: 'ITEM-DP-2A', name: 'Wacom Intuos Pro', quantity: 3, unitPrice: 600, perItemAwardDetails: [
                    { score: 96, rank: 1, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', status: 'Awarded', quoteItemId: 'QITEM-DP-2A', proposedItemName: 'Wacom Intuos Pro', unitPrice: 600 },
                    { score: 92, rank: 2, vendorId: 'VENDOR-004', vendorName: 'Logitech', status: 'Standby', quoteItemId: 'QITEM-DP-2B', proposedItemName: 'Logi Pen Tablet', unitPrice: 580 }
                ]}
            ]},
            { id: 'REQ-DP-3', status: 'Awarded', totalPrice: 5000, title: 'DP-3: Large Format Printer', departmentId: 'DEPT-1', items: [
                { id: 'ITEM-DP-3A', name: '44-inch Plotter', quantity: 1, unitPrice: 5000, perItemAwardDetails: [
                    { score: 93, rank: 1, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', status: 'Awarded', quoteItemId: 'QITEM-DP-3A', proposedItemName: 'HP DesignJet Z9+', unitPrice: 5000 },
                    { score: 91, rank: 2, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Standby', quoteItemId: 'QITEM-DP-3B', proposedItemName: 'Canon imagePROGRAF', unitPrice: 4900 }
                ]}
            ]},
            { id: 'REQ-DP-4', status: 'Awarded', totalPrice: 22000, title: 'DP-4: Color-Accurate Monitors', departmentId: 'DEPT-1', items: [
                { id: 'ITEM-DP-4A', name: '32-inch 4K Monitor', quantity: 4, unitPrice: 5500, perItemAwardDetails: [
                    { score: 97, rank: 1, vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', status: 'Awarded', quoteItemId: 'QITEM-DP-4A', proposedItemName: 'BenQ PD3220U', unitPrice: 5500 },
                    { score: 96, rank: 2, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Standby', quoteItemId: 'QITEM-DP-4B', proposedItemName: 'Dell UltraSharp U3223QE', unitPrice: 5400 }
                ]}
            ]},
        ],
        // === STANDBY EXHAUSTION (SE) SCENARIOS ===
        // Goal: Test the flow where all vendors decline, and the item fails to be awarded.
        ...[
             { id: 'REQ-SE-1', status: 'Award_Declined', totalPrice: 9700, title: 'SE-1: Specialized LIDAR Sensor', departmentId: 'DEPT-3', items: [
                { id: 'ITEM-SE-1A', name: 'Industrial LIDAR Unit', quantity: 1, unitPrice: 10000, perItemAwardDetails: [
                    { score: 85, rank: 1, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', status: 'Failed_to_Award', quoteItemId: 'QITEM-SE-1A', proposedItemName: 'Apple LIDAR', unitPrice: 10000 },
                    { score: 82, rank: 2, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Declined', quoteItemId: 'QITEM-SE-1B', proposedItemName: 'Dell LIDAR', unitPrice: 9800 },
                    { score: 80, rank: 3, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', status: 'Standby', quoteItemId: 'QITEM-SE-1C', proposedItemName: 'HP LIDAR', unitPrice: 9700 }
                ]}
            ]},
            { id: 'REQ-SE-2', status: 'Award_Declined', totalPrice: 23750, title: 'SE-2: VR Headsets', departmentId: 'DEPT-1', items: [
                { id: 'ITEM-SE-2A', name: 'High-End VR Headset', quantity: 5, unitPrice: 5000, perItemAwardDetails: [
                    { score: 90, rank: 1, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', status: 'Failed_to_Award', quoteItemId: 'QITEM-SE-2A', proposedItemName: 'HP Reverb G2', unitPrice: 5000 },
                    { score: 88, rank: 2, vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', status: 'Declined', quoteItemId: 'QITEM-SE-2B', proposedItemName: 'Samsung Odyssey+', unitPrice: 4800 },
                    { score: 87, rank: 3, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Standby', quoteItemId: 'QITEM-SE-2C', proposedItemName: 'Dell Visor', unitPrice: 4750 }
                ]}
            ]},
            { id: 'REQ-SE-3', status: 'Award_Declined', totalPrice: 2800, title: 'SE-3: Ergonomic Keyboards', departmentId: 'DEPT-2', items: [
                { id: 'ITEM-SE-3A', name: 'Split Ergonomic Keyboard', quantity: 10, unitPrice: 300, perItemAwardDetails: [
                    { score: 95, rank: 1, vendorId: 'VENDOR-004', vendorName: 'Logitech', status: 'Failed_to_Award', quoteItemId: 'QITEM-SE-3A', proposedItemName: 'Kinesis Freestyle2', unitPrice: 300 },
                    { score: 94, rank: 2, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Declined', quoteItemId: 'QITEM-SE-3B', proposedItemName: 'Dell Ergonomic Keyboard', unitPrice: 290 },
                    { score: 93, rank: 3, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', status: 'Standby', quoteItemId: 'QITEM-SE-3C', proposedItemName: 'HP Ergonomic Keyboard', unitPrice: 280 }
                ]}
            ]},
             { id: 'REQ-SE-4', status: 'Award_Declined', totalPrice: 11000, title: 'SE-4: High-Speed NAS Storage', departmentId: 'DEPT-3', items: [
                { id: 'ITEM-SE-4A', name: '8-Bay NAS Enclosure', quantity: 1, unitPrice: 12000, perItemAwardDetails: [
                    { score: 89, rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Failed_to_Award', quoteItemId: 'QITEM-SE-4A', proposedItemName: 'Synology DS1821+', unitPrice: 12000 },
                    { score: 87, rank: 2, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', status: 'Declined', quoteItemId: 'QITEM-SE-4B', proposedItemName: 'QNAP TVS-872XT', unitPrice: 11500 },
                    { score: 85, rank: 3, vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', status: 'Standby', quoteItemId: 'QITEM-SE-4C', proposedItemName: 'Asustor Lockerstor 8', unitPrice: 11000 }
                ]}
            ]},
        ],
        // === PARTIAL PAYMENT (PP) SCENARIOS ===
        // Goal: Ensure paying for one item's PO does not close the whole requisition.
        ...[
            { id: 'REQ-PP-1', status: 'PO_Created', totalPrice: 13000, title: 'PP-1: Remote Work Kits', departmentId: 'DEPT-2', items: [
                { id: 'ITEM-PP-1A', name: 'Noise-Cancelling Headphones', quantity: 10, unitPrice: 500, perItemAwardDetails: [{ score: 93, rank: 1, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', status: 'Accepted', quoteItemId: 'QITEM-PP-1A', proposedItemName: 'Bose QC45', unitPrice: 500 }] },
                { id: 'ITEM-PP-1B', name: 'External SSD', quantity: 10, unitPrice: 800, perItemAwardDetails: [{ score: 95, rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Awarded', quoteItemId: 'QITEM-PP-1B', proposedItemName: 'Samsung T7 Shield', unitPrice: 800 }] }
            ]},
            { id: 'REQ-PP-2', status: 'PO_Created', totalPrice: 30000, title: 'PP-2: IT Laptops & Docks', departmentId: 'DEPT-3', items: [
                { id: 'ITEM-PP-2A', name: '15-inch Dell Laptop', quantity: 10, unitPrice: 2000, perItemAwardDetails: [{ score: 98, rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Accepted', quoteItemId: 'QITEM-PP-2A', proposedItemName: 'Dell Latitude 5530', unitPrice: 2000 }] },
                { id: 'ITEM-PP-2B', name: 'Thunderbolt Dock', quantity: 10, unitPrice: 1000, perItemAwardDetails: [{ score: 96, rank: 1, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', status: 'Awarded', quoteItemId: 'QITEM-PP-2B', proposedItemName: 'HP Thunderbolt Dock G4', unitPrice: 1000 }] }
            ]},
            { id: 'REQ-PP-3', status: 'PO_Created', totalPrice: 2500, title: 'PP-3: Lobby Digital Signage', departmentId: 'DEPT-2', items: [
                { id: 'ITEM-PP-3A', name: 'Signage Display Tablet', quantity: 1, unitPrice: 1000, perItemAwardDetails: [{ score: 90, rank: 1, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', status: 'Accepted', quoteItemId: 'QITEM-PP-3A', proposedItemName: 'iPad 10.9', unitPrice: 1000 }] },
                { id: 'ITEM-PP-3B', name: 'Wall Mount', quantity: 1, unitPrice: 1500, perItemAwardDetails: [{ score: 89, rank: 1, vendorId: 'VENDOR-004', vendorName: 'Logitech', status: 'Awarded', quoteItemId: 'QITEM-PP-3B', proposedItemName: 'VESA Wall Mount', unitPrice: 1500 }] }
            ]},
            { id: 'REQ-PP-4', status: 'PO_Created', totalPrice: 6000, title: 'PP-4: Bulk Printer Supplies', departmentId: 'DEPT-2', items: [
                { id: 'ITEM-PP-4A', name: 'Laser Toner Cartridges', quantity: 20, unitPrice: 300, perItemAwardDetails: [{ score: 91, rank: 1, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', status: 'Accepted', quoteItemId: 'QITEM-PP-4A', proposedItemName: 'HP 58A Toner', unitPrice: 300 }] },
                { id: 'ITEM-PP-4B', name: 'Paper Reams (Case)', quantity: 5, unitPrice: 0, perItemAwardDetails: [{ score: 88, rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Awarded', quoteItemId: 'QITEM-PP-4B', proposedItemName: 'Hammermill Paper', unitPrice: 0 }] }
            ]},
        ],
        // === MIXED STATE (MS) SCENARIOS ===
        // Goal: Test UI and logic with a complex mix of item statuses on a single requisition.
        ...[
            { id: 'REQ-MS-1', status: 'PO_Created', totalPrice: 15000, title: 'MS-1: Full Office Refresh', departmentId: 'DEPT-1', items: [
                { id: 'ITEM-MS-1A', name: 'Desk Chairs', quantity: 10, unitPrice: 500, perItemAwardDetails: [{ score: 95, rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Accepted', quoteItemId: 'QITEM-MS-1A', proposedItemName: 'Dell Chair', unitPrice: 500 }] },
                { id: 'ITEM-MS-1B', name: '4K Webcams', quantity: 10, unitPrice: 200, perItemAwardDetails: [{ score: 98, rank: 1, vendorId: 'VENDOR-004', vendorName: 'Logitech', status: 'Awarded', quoteItemId: 'QITEM-MS-1B', proposedItemName: 'Logi Brio', unitPrice: 200 }] },
                { id: 'ITEM-MS-1C', name: 'Standing Desks', quantity: 5, unitPrice: 1600, perItemAwardDetails: [
                    { score: 92, rank: 1, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', status: 'Declined', quoteItemId: 'QITEM-MS-1C', proposedItemName: 'iDesk', unitPrice: 1600 },
                    { score: 91, rank: 2, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', status: 'Standby', quoteItemId: 'QITEM-MS-1D', proposedItemName: 'HP Desk', unitPrice: 1550 },
                ]}
            ]},
            { id: 'REQ-MS-2', status: 'Award_Declined', totalPrice: 1000, title: 'MS-2: Podcast Mic Failure', departmentId: 'DEPT-1', items: [
                { id: 'ITEM-MS-2A', name: 'XLR Microphone', quantity: 1, unitPrice: 1000, perItemAwardDetails: [
                     { score: 95, rank: 1, vendorId: 'VENDOR-004', vendorName: 'Logitech', status: 'Failed_to_Award', quoteItemId: 'QITEM-MS-2A', proposedItemName: 'Shure SM7B', unitPrice: 1000 },
                     { score: 94, rank: 2, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', status: 'Declined', quoteItemId: 'QITEM-MS-2B', proposedItemName: 'Apogee Mic', unitPrice: 950 },
                ]}
            ]},
        ]
    ].map(r => ({ ...r, requesterId: '1', justification: r.title, urgency: 'Medium', createdAt: new Date(), updatedAt: new Date(), rfqSettings: { awardStrategy: 'item' } })) as unknown as PurchaseRequisition[],

  quotations: [],
  purchaseOrders: [],
  invoices: [],
  goodsReceipts: [],
  auditLogs: [],
};

// Auto-generate quotes, POs, invoices, etc. based on requisition scenarios
// This keeps the seed data DRY
const now = new Date();

seedData.requisitions.forEach(req => {
  const itemDetails = req.items.flatMap(i => i.perItemAwardDetails || []);
  const vendorBids = new Map<string, { items: any[], totalPrice: number }>();

  itemDetails.forEach(detail => {
    if (!vendorBids.has(detail.vendorId)) {
      vendorBids.set(detail.vendorId, { items: [], totalPrice: 0 });
    }
    const bid = vendorBids.get(detail.vendorId)!;
    const reqItem = req.items.find(i => (i.perItemAwardDetails || []).some(d => d.quoteItemId === detail.quoteItemId));
    if (reqItem) {
        bid.items.push({
            id: detail.quoteItemId,
            requisitionItemId: reqItem.id,
            name: detail.proposedItemName,
            quantity: reqItem.quantity,
            unitPrice: detail.unitPrice,
            leadTimeDays: 14,
        });
        bid.totalPrice += reqItem.quantity * detail.unitPrice;
    }
  });

  Array.from(vendorBids.entries()).forEach(([vendorId, bid]) => {
    const vendor = seedData.vendors.find(v => v.id === vendorId)!;
    const allStatuses = itemDetails.filter(d => d.vendorId === vendorId).map(d => d.status);
    let finalStatus: Quotation['status'] = 'Submitted';
    
    if (allStatuses.some(s => s === 'Accepted')) finalStatus = 'Accepted';
    else if (allStatuses.some(s => s === 'Awarded')) finalStatus = 'Awarded';
    else if (allStatuses.some(s => s === 'Declined')) finalStatus = 'Declined';
    else if (allStatuses.some(s => s === 'Standby')) finalStatus = 'Standby';
    else if (allStatuses.some(s => s === 'Failed_to_Award')) finalStatus = 'Failed';

    seedData.quotations.push({
      id: `QUO-${req.id.replace('REQ-','')}-${vendorId.replace('VENDOR-','')}`,
      transactionId: req.id,
      requisitionId: req.id,
      vendorId: vendorId,
      vendorName: vendor.name,
      items: bid.items,
      totalPrice: bid.totalPrice,
      status: finalStatus,
      createdAt: now,
      updatedAt: now,
      deliveryDate: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
    });

    if (finalStatus === 'Accepted') {
        const poId = `PO-${req.id.replace('REQ-','')}-${vendorId.replace('VENDOR-','')}`;
        seedData.purchaseOrders.push({
            id: poId,
            transactionId: req.id,
            requisitionId: req.id,
            requisitionTitle: req.title,
            vendorId: vendor.id,
            totalAmount: bid.totalPrice,
            status: 'Delivered',
            createdAt: now,
            items: bid.items.map(i => ({...i, id: `POITEM-${i.id}`, totalPrice: i.quantity * i.unitPrice, receivedQuantity: i.quantity })),
        });
        
        // Handle partial payment scenarios
        if (req.id.startsWith('REQ-PP')) {
           const invId = `INV-${poId}`;
           // Determine if this specific PO contains an item that should be marked as "Paid"
           const hasPaidItemInPO = bid.items.some((item: any) => {
               return (req.id === 'REQ-PP-1' && item.requisitionItemId === 'ITEM-PP-1A') ||
                      (req.id === 'REQ-PP-2' && item.requisitionItemId === 'ITEM-PP-2A') ||
                      (req.id === 'REQ-PP-3' && item.requisitionItemId === 'ITEM-PP-3A') ||
                      (req.id === 'REQ-PP-4' && item.requisitionItemId === 'ITEM-PP-4A');
           });

           seedData.invoices.push({
                id: invId,
                transactionId: req.id,
                purchaseOrderId: poId,
                vendorId: vendor.id,
                invoiceDate: now,
                totalAmount: bid.totalPrice,
                status: hasPaidItemInPO ? 'Paid' : 'Approved_for_Payment',
                paymentReference: hasPaidItemInPO ? `PAY-${invId}` : undefined,
                items: bid.items.map(i => ({ id: `INVITEM-${i.id}`, name: i.name, quantity: i.quantity, unitPrice: i.unitPrice, totalPrice: i.quantity * i.unitPrice })),
           });

           seedData.goodsReceipts.push({
                id: `GRN-${poId}`,
                transactionId: req.id,
                purchaseOrderId: poId,
                receivedById: '4', // David (Receiving)
                receivedDate: now,
                items: bid.items.map(i => ({ poItemId: `POITEM-${i.id}`, quantityReceived: i.quantity, condition: 'Good' }))
           });
        }
    }
  });
});
