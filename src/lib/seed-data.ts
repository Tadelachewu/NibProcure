
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
        // === SCENARIO A: HAPPY PATH (MULTI-VENDOR WIN) ===
        // Goal: Test a clean run where two different vendors win items on the same req.
        { id: 'REQ-A1', status: 'PO_Created', totalPrice: 270000, title: 'A1: New Hire Workstations', departmentId: 'DEPT-1', items: [
            { id: 'ITEM-A1', name: 'High-End PC', quantity: 100, unitPrice: 2500, perItemAwardDetails: [{ score: 95, rank: 1, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', status: 'Accepted', quoteItemId: 'QITEM-A1', proposedItemName: 'Mac Studio', unitPrice: 2500 }] },
            { id: 'ITEM-A2', name: 'Ergonomic Chair', quantity: 100, unitPrice: 200, perItemAwardDetails: [{ score: 98, rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Accepted', quoteItemId: 'QITEM-A2', proposedItemName: 'Herman Miller Aeron', unitPrice: 200 }] }
        ]},
        // Add 4 more for this scenario...
        { id: 'REQ-A2', status: 'PO_Created', totalPrice: 5500, title: 'A2: Marketing Event Kit', departmentId: 'DEPT-1', items: [
            { id: 'ITEM-A3', name: 'Portable Banner', quantity: 5, unitPrice: 300, perItemAwardDetails: [{ score: 92, rank: 1, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', status: 'Accepted', quoteItemId: 'QITEM-A3', proposedItemName: 'Retractable Banner', unitPrice: 300 }] },
            { id: 'ITEM-A4', name: 'HD Projector', quantity: 1, unitPrice: 4000, perItemAwardDetails: [{ score: 94, rank: 1, vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', status: 'Accepted', quoteItemId: 'QITEM-A4', proposedItemName: 'Samsung Freestyle', unitPrice: 4000 }] }
        ]},
        { id: 'REQ-A3', status: 'PO_Created', totalPrice: 3200, title: 'A3: Podcasting Studio Setup', departmentId: 'DEPT-1', items: [
            { id: 'ITEM-A5', name: 'USB Microphones', quantity: 4, unitPrice: 400, perItemAwardDetails: [{ score: 96, rank: 1, vendorId: 'VENDOR-004', vendorName: 'Logitech', status: 'Accepted', quoteItemId: 'QITEM-A5', proposedItemName: 'Blue Yeti X', unitPrice: 400 }] },
            { id: 'ITEM-A6', name: 'Acoustic Panels', quantity: 20, unitPrice: 80, perItemAwardDetails: [{ score: 91, rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Accepted', quoteItemId: 'QITEM-A6', proposedItemName: 'Auralex Panels', unitPrice: 80 }] }
        ]},
        { id: 'REQ-A4', status: 'PO_Created', totalPrice: 15500, title: 'A4: Network Infrastructure Upgrade', departmentId: 'DEPT-3', items: [
            { id: 'ITEM-A7', name: '48-Port PoE Switch', quantity: 1, unitPrice: 7500, perItemAwardDetails: [{ score: 93, rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Accepted', quoteItemId: 'QITEM-A7', proposedItemName: 'Dell PowerSwitch', unitPrice: 7500 }] },
            { id: 'ITEM-A8', name: 'Wi-Fi 6 Access Points', quantity: 5, unitPrice: 1600, perItemAwardDetails: [{ score: 95, rank: 1, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', status: 'Accepted', quoteItemId: 'QITEM-A8', proposedItemName: 'Aruba AP-535', unitPrice: 1600 }] }
        ]},
        { id: 'REQ-A5', status: 'PO_Created', totalPrice: 3000, title: 'A5: Office Kitchen Supplies', departmentId: 'DEPT-2', items: [
            { id: 'ITEM-A9', name: 'Espresso Machine', quantity: 1, unitPrice: 2000, perItemAwardDetails: [{ score: 97, rank: 1, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', status: 'Accepted', quoteItemId: 'QITEM-A9', proposedItemName: 'Breville Barista', unitPrice: 2000 }] },
            { id: 'ITEM-A10', name: 'Water Cooler', quantity: 1, unitPrice: 1000, perItemAwardDetails: [{ score: 90, rank: 1, vendorId: 'VENDOR-004', vendorName: 'Logitech', status: 'Accepted', quoteItemId: 'QITEM-A10', proposedItemName: 'Avalon Water Cooler', unitPrice: 1000 }] }
        ]},

        // === SCENARIO B: DECLINE & PROMOTE ===
        // Goal: Test the workflow where a winning vendor declines, and the PO promotes a standby.
        { id: 'REQ-B1', status: 'Awarded', totalPrice: 22800, title: 'B1: Security System Overhaul', departmentId: 'DEPT-2', items: [
            { id: 'ITEM-B1', name: 'IP Security Cameras', quantity: 20, unitPrice: 150, perItemAwardDetails: [
                { score: 91, rank: 1, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', status: 'Awarded', quoteItemId: 'QITEM-B1-1', proposedItemName: 'Generic Cam', unitPrice: 150 },
                { score: 90, rank: 2, vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', status: 'Standby', quoteItemId: 'QITEM-B1-2', proposedItemName: 'Samsung Cam', unitPrice: 140 }
            ]},
            { id: 'ITEM-B2', name: 'Network Video Recorder', quantity: 1, unitPrice: 2000, perItemAwardDetails: [{ score: 94, rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Awarded', quoteItemId: 'QITEM-B2', proposedItemName: 'Dell NVR', unitPrice: 2000 }] }
        ]},
        // Add 4 more for this scenario...
        { id: 'REQ-B2', status: 'Awarded', totalPrice: 1800, title: 'B2: Graphics Tablets for Design', departmentId: 'DEPT-1', items: [
            { id: 'ITEM-B3', name: 'Wacom Intuos Pro', quantity: 3, unitPrice: 600, perItemAwardDetails: [
                { score: 96, rank: 1, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', status: 'Awarded', quoteItemId: 'QITEM-B3-1', proposedItemName: 'Wacom Intuos Pro', unitPrice: 600 },
                { score: 92, rank: 2, vendorId: 'VENDOR-004', vendorName: 'Logitech', status: 'Standby', quoteItemId: 'QITEM-B3-2', proposedItemName: 'Logi Pen Tablet', unitPrice: 580 }
            ]}
        ]},
        { id: 'REQ-B3', status: 'Awarded', totalPrice: 5000, title: 'B3: Large Format Printer', departmentId: 'DEPT-1', items: [
            { id: 'ITEM-B4', name: '44-inch Plotter', quantity: 1, unitPrice: 5000, perItemAwardDetails: [
                { score: 93, rank: 1, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', status: 'Awarded', quoteItemId: 'QITEM-B4-1', proposedItemName: 'HP DesignJet Z9+', unitPrice: 5000 },
                { score: 91, rank: 2, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Standby', quoteItemId: 'QITEM-B4-2', proposedItemName: 'Canon imagePROGRAF', unitPrice: 4900 }
            ]}
        ]},
        { id: 'REQ-B4', status: 'Awarded', totalPrice: 7500, title: 'B4: Video Production Lights', departmentId: 'DEPT-1', items: [
            { id: 'ITEM-B5', name: 'LED Panel Lights', quantity: 3, unitPrice: 2500, perItemAwardDetails: [
                { score: 95, rank: 1, vendorId: 'VENDOR-004', vendorName: 'Logitech', status: 'Awarded', quoteItemId: 'QITEM-B5-1', proposedItemName: 'Aputure Amaran 300c', unitPrice: 2500 },
                { score: 90, rank: 2, vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', status: 'Standby', quoteItemId: 'QITEM-B5-2', proposedItemName: 'Neewer LED Panel Kit', unitPrice: 2400 }
            ]}
        ]},
        { id: 'REQ-B5', status: 'Awarded', totalPrice: 22000, title: 'B5: Color-Accurate Monitors', departmentId: 'DEPT-1', items: [
            { id: 'ITEM-B6', name: '32-inch 4K Monitor', quantity: 4, unitPrice: 5500, perItemAwardDetails: [
                { score: 97, rank: 1, vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', status: 'Awarded', quoteItemId: 'QITEM-B6-1', proposedItemName: 'BenQ PD3220U', unitPrice: 5500 },
                { score: 96, rank: 2, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Standby', quoteItemId: 'QITEM-B6-2', proposedItemName: 'Dell UltraSharp U3223QE', unitPrice: 5400 }
            ]}
        ]},
        
        // === SCENARIO C: STANDBY EXHAUSTION ===
        // Goal: Test the flow where all vendors decline, and the item fails to be awarded.
        { id: 'REQ-C1', status: 'Award_Declined', totalPrice: 10000, title: 'C1: Specialized LIDAR Sensor', departmentId: 'DEPT-3', items: [
            { id: 'ITEM-C1', name: 'Industrial LIDAR Unit', quantity: 1, unitPrice: 10000, perItemAwardDetails: [
                { score: 85, rank: 1, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', status: 'Failed_to_Award', quoteItemId: 'QITEM-C1-1', proposedItemName: 'Apple LIDAR', unitPrice: 10000 },
                { score: 82, rank: 2, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Declined', quoteItemId: 'QITEM-C1-2', proposedItemName: 'Dell LIDAR', unitPrice: 9800 },
                { score: 80, rank: 3, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', status: 'Standby', quoteItemId: 'QITEM-C1-3', proposedItemName: 'HP LIDAR', unitPrice: 9700 }
            ]}
        ]},
        // Add 4 more for this scenario...
        { id: 'REQ-C2', status: 'Award_Declined', totalPrice: 25000, title: 'C2: VR Headsets', departmentId: 'DEPT-1', items: [
            { id: 'ITEM-C2', name: 'High-End VR Headset', quantity: 5, unitPrice: 5000, perItemAwardDetails: [
                { score: 90, rank: 1, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', status: 'Failed_to_Award', quoteItemId: 'QITEM-C2-1', proposedItemName: 'HP Reverb G2', unitPrice: 5000 },
                { score: 88, rank: 2, vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', status: 'Declined', quoteItemId: 'QITEM-C2-2', proposedItemName: 'Samsung Odyssey+', unitPrice: 4800 },
                { score: 87, rank: 3, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Standby', quoteItemId: 'QITEM-C2-3', proposedItemName: 'Dell Visor', unitPrice: 4750 }
            ]}
        ]},
        { id: 'REQ-C3', status: 'Award_Declined', totalPrice: 3000, title: 'C3: Ergonomic Keyboards', departmentId: 'DEPT-2', items: [
            { id: 'ITEM-C3', name: 'Split Ergonomic Keyboard', quantity: 10, unitPrice: 300, perItemAwardDetails: [
                { score: 95, rank: 1, vendorId: 'VENDOR-004', vendorName: 'Logitech', status: 'Failed_to_Award', quoteItemId: 'QITEM-C3-1', proposedItemName: 'Kinesis Freestyle2', unitPrice: 300 },
                { score: 94, rank: 2, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Declined', quoteItemId: 'QITEM-C3-2', proposedItemName: 'Dell Ergonomic Keyboard', unitPrice: 290 },
                { score: 93, rank: 3, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', status: 'Standby', quoteItemId: 'QITEM-C3-3', proposedItemName: 'HP Ergonomic Keyboard', unitPrice: 280 }
            ]}
        ]},
        { id: 'REQ-C4', status: 'Award_Declined', totalPrice: 12000, title: 'C4: High-Speed NAS Storage', departmentId: 'DEPT-3', items: [
            { id: 'ITEM-C4', name: '8-Bay NAS Enclosure', quantity: 1, unitPrice: 12000, perItemAwardDetails: [
                { score: 89, rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Failed_to_Award', quoteItemId: 'QITEM-C4-1', proposedItemName: 'Synology DS1821+', unitPrice: 12000 },
                { score: 87, rank: 2, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', status: 'Declined', quoteItemId: 'QITEM-C4-2', proposedItemName: 'QNAP TVS-872XT', unitPrice: 11500 },
                { score: 85, rank: 3, vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', status: 'Standby', quoteItemId: 'QITEM-C4-3', proposedItemName: 'Asustor Lockerstor 8', unitPrice: 11000 }
            ]}
        ]},
        { id: 'REQ-C5', status: 'Award_Declined', totalPrice: 8000, title: 'C5: Professional Drones', departmentId: 'DEPT-1', items: [
            { id: 'ITEM-C5', name: '4K Camera Drone', quantity: 2, unitPrice: 4000, perItemAwardDetails: [
                { score: 92, rank: 1, vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', status: 'Failed_to_Award', quoteItemId: 'QITEM-C5-1', proposedItemName: 'DJI Mavic 3', unitPrice: 4000 },
                { score: 90, rank: 2, vendorId: 'VENDOR-004', vendorName: 'Logitech', status: 'Declined', quoteItemId: 'QITEM-C5-2', proposedItemName: 'Autel Evo Lite+', unitPrice: 3800 },
                { score: 88, rank: 3, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Standby', quoteItemId: 'QITEM-C5-3', proposedItemName: 'Skydio 2+', unitPrice: 3700 }
            ]}
        ]},

        // === SCENARIO D: PARTIAL PAYMENT ===
        // Goal: Ensure paying for one item's PO does not close the whole requisition.
        { id: 'REQ-D1', status: 'PO_Created', totalPrice: 13000, title: 'D1: Remote Work Kits', departmentId: 'DEPT-2', items: [
            { id: 'ITEM-D1', name: 'Noise-Cancelling Headphones', quantity: 10, unitPrice: 500, perItemAwardDetails: [{ score: 93, rank: 1, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', status: 'Accepted', quoteItemId: 'QITEM-D1', proposedItemName: 'Bose QC45', unitPrice: 500 }] },
            { id: 'ITEM-D2', name: 'External SSD', quantity: 10, unitPrice: 800, perItemAwardDetails: [{ score: 95, rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Awarded', quoteItemId: 'QITEM-D2', proposedItemName: 'Samsung T7 Shield', unitPrice: 800 }] }
        ]},
        // Add 4 more for this scenario...
        { id: 'REQ-D2', status: 'PO_Created', totalPrice: 30000, title: 'D2: IT Laptops & Docks', departmentId: 'DEPT-3', items: [
            { id: 'ITEM-D3', name: '15-inch Dell Laptop', quantity: 10, unitPrice: 2000, perItemAwardDetails: [{ score: 98, rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Accepted', quoteItemId: 'QITEM-D3', proposedItemName: 'Dell Latitude 5530', unitPrice: 2000 }] },
            { id: 'ITEM-D4', name: 'Thunderbolt Dock', quantity: 10, unitPrice: 1000, perItemAwardDetails: [{ score: 96, rank: 1, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', status: 'Awarded', quoteItemId: 'QITEM-D4', proposedItemName: 'HP Thunderbolt Dock G4', unitPrice: 1000 }] }
        ]},
        { id: 'REQ-D3', status: 'PO_Created', totalPrice: 2500, title: 'D3: Lobby Digital Signage', departmentId: 'DEPT-2', items: [
            { id: 'ITEM-D5', name: 'Signage Display Tablet', quantity: 1, unitPrice: 1000, perItemAwardDetails: [{ score: 90, rank: 1, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', status: 'Accepted', quoteItemId: 'QITEM-D5', proposedItemName: 'iPad 10.9', unitPrice: 1000 }] },
            { id: 'ITEM-D6', name: 'Wall Mount', quantity: 1, unitPrice: 1500, perItemAwardDetails: [{ score: 89, rank: 1, vendorId: 'VENDOR-004', vendorName: 'Logitech', status: 'Awarded', quoteItemId: 'QITEM-D6', proposedItemName: 'VESA Wall Mount', unitPrice: 1500 }] }
        ]},
        { id: 'REQ-D4', status: 'PO_Created', totalPrice: 11000, title: 'D4: Adobe Creative Cloud Licenses', departmentId: 'DEPT-1', items: [
            { id: 'ITEM-D7', name: 'Adobe CC All Apps', quantity: 20, unitPrice: 550, perItemAwardDetails: [{ score: 99, rank: 1, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', status: 'Accepted', quoteItemId: 'QITEM-D7', proposedItemName: 'Adobe CC License', unitPrice: 550 }] },
            { id: 'ITEM-D8', name: 'Adobe Stock Subscription', quantity: 1, unitPrice: 0, perItemAwardDetails: [{ score: 97, rank: 1, vendorId: 'VENDOR-004', vendorName: 'Logitech', status: 'Awarded', quoteItemId: 'QITEM-D8', proposedItemName: 'Adobe Stock', unitPrice: 0 }] }
        ]},
        { id: 'REQ-D5', status: 'PO_Created', totalPrice: 6000, title: 'D5: Bulk Printer Supplies', departmentId: 'DEPT-2', items: [
            { id: 'ITEM-D9', name: 'Laser Toner Cartridges', quantity: 20, unitPrice: 300, perItemAwardDetails: [{ score: 91, rank: 1, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', status: 'Accepted', quoteItemId: 'QITEM-D9', proposedItemName: 'HP 58A Toner', unitPrice: 300 }] },
            { id: 'ITEM-D10', name: 'Paper Reams (Case)', quantity: 5, unitPrice: 0, perItemAwardDetails: [{ score: 88, rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Awarded', quoteItemId: 'QITEM-D10', proposedItemName: 'Hammermill Paper', unitPrice: 0 }] }
        ]},

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
      id: `QUO-${req.id}-${vendorId}`,
      transactionId: req.id,
      requisitionId: req.id,
      vendorId: vendorId,
      vendorName: vendor.name,
      items: bid.items,
      totalPrice: bid.totalPrice,
      status: finalStatus,
      createdAt: new Date(),
      updatedAt: new Date(),
      deliveryDate: new Date(),
    });

    if (finalStatus === 'Accepted') {
        const poId = `PO-${req.id}-${vendorId}`;
        seedData.purchaseOrders.push({
            id: poId,
            transactionId: req.id,
            requisitionId: req.id,
            requisitionTitle: req.title,
            vendorId: vendor.id,
            totalAmount: bid.totalPrice,
            status: 'Delivered',
            createdAt: new Date(),
            items: bid.items.map(i => ({...i, id: `PO${i.id}`, totalPrice: i.quantity * i.unitPrice, receivedQuantity: i.quantity })),
        });
        
        // Specific logic for partial payment scenario
        if (req.id.startsWith('REQ-D')) {
           const invId = `INV-${poId}`;
           const isItemPaid = (item: any) => {
               return (req.id === 'REQ-D1' && item.requisitionItemId === 'ITEM-D1') ||
                      (req.id === 'REQ-D2' && item.requisitionItemId === 'ITEM-D3') ||
                      (req.id === 'REQ-D3' && item.requisitionItemId === 'ITEM-D5') ||
                      (req.id === 'REQ-D4' && item.requisitionItemId === 'ITEM-D7') ||
                      (req.id === 'REQ-D5' && item.requisitionItemId === 'ITEM-D9');
           };
           const hasPaidItem = bid.items.some(isItemPaid);

           seedData.invoices.push({
                id: invId,
                transactionId: req.id,
                purchaseOrderId: poId,
                vendorId: vendor.id,
                invoiceDate: new Date(),
                totalAmount: bid.totalPrice,
                status: hasPaidItem ? 'Paid' : 'Approved_for_Payment',
                paymentReference: hasPaidItem ? `PAY-${invId}` : undefined,
                items: bid.items.map(i => ({ ...i, id: `INV${i.id}`, totalPrice: i.quantity * i.unitPrice })),
           });

           seedData.goodsReceipts.push({
                id: `GRN-${poId}`,
                transactionId: req.id,
                purchaseOrderId: poId,
                receivedById: '4', // David (Receiving)
                receivedDate: new Date(),
                items: bid.items.map(i => ({ poItemId: `PO${i.id}`, quantityReceived: i.quantity, condition: 'Good' }))
           });
        }
    }
  });
});
