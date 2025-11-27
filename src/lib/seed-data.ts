
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
      // SCENARIO HP (Happy Path): Multi-vendor, multi-item, full lifecycle
      { id: 'REQ-HP-1', status: 'Closed', totalPrice: 3200, title: 'HP-1: Office Upgrade', departmentId: 'DEPT-2', items: [
          { id: 'ITEM-HP-1A', name: 'Ergonomic Keyboard', quantity: 10, unitPrice: 120, perItemAwardDetails: [{ score: 95, rank: 1, vendorId: 'VENDOR-004', vendorName: 'Logitech', status: 'Accepted', quoteItemId: 'QITEM-HP1-A', proposedItemName: 'Logitech Wave', unitPrice: 120 }] },
          { id: 'ITEM-HP-1B', name: '4K Webcam', quantity: 10, unitPrice: 200, perItemAwardDetails: [{ score: 98, rank: 1, vendorId: 'VENDOR-004', vendorName: 'Logitech', status: 'Accepted', quoteItemId: 'QITEM-HP1-B', proposedItemName: 'Logitech Brio', unitPrice: 200 }] }
      ]},
      { id: 'REQ-HP-2', status: 'PO_Created', totalPrice: 25500, title: 'HP-2: Conference Room AV', departmentId: 'DEPT-3', items: [
          { id: 'ITEM-HP-2A', name: '75-inch TV', quantity: 1, unitPrice: 1500, perItemAwardDetails: [{ score: 94, rank: 1, vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', status: 'Accepted', quoteItemId: 'QITEM-HP2-A', proposedItemName: 'Samsung QN90A', unitPrice: 1500 }] },
          { id: 'ITEM-HP-2B', name: 'Soundbar', quantity: 1, unitPrice: 500, perItemAwardDetails: [{ score: 92, rank: 1, vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', status: 'Accepted', quoteItemId: 'QITEM-HP2-B', proposedItemName: 'Samsung HW-Q800A', unitPrice: 500 }] }
      ]},
      { id: 'REQ-HP-3', status: 'Awarded', totalPrice: 32000, title: 'HP-3: Design Team Laptops', departmentId: 'DEPT-1', items: [
          { id: 'ITEM-HP-3A', name: '14-inch Laptop', quantity: 5, unitPrice: 2400, perItemAwardDetails: [{ score: 99, rank: 1, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', status: 'Awarded', quoteItemId: 'QITEM-HP3-A', proposedItemName: 'MacBook Pro 14', unitPrice: 2400 }] },
          { id: 'ITEM-HP-3B', name: '16-inch Laptop', quantity: 5, unitPrice: 4000, perItemAwardDetails: [{ score: 97, rank: 1, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', status: 'Awarded', quoteItemId: 'QITEM-HP3-B', proposedItemName: 'MacBook Pro 16', unitPrice: 4000 }] }
      ]},
      { id: 'REQ-HP-4', status: 'Scoring_Complete', totalPrice: 15000, title: 'HP-4: Server Rack Components', departmentId: 'DEPT-3', items: [
          { id: 'ITEM-HP-4A', name: '24-Port Switch', quantity: 2, unitPrice: 500 },
          { id: 'ITEM-HP-4B', name: 'UPS Backup', quantity: 1, unitPrice: 1000 }
      ]},
      { id: 'REQ-HP-5', status: 'PreApproved', totalPrice: 5000, title: 'HP-5: New Office Furniture', departmentId: 'DEPT-2', items: [
          { id: 'ITEM-HP-5A', name: 'Standing Desks', quantity: 5, unitPrice: 600 },
          { id: 'ITEM-HP-5B', name: 'Office Chairs', quantity: 5, unitPrice: 400 }
      ]},

      // SCENARIO DP (Decline & Promote): One vendor declines, standby is promoted
      { id: 'REQ-DP-1', status: 'Award_Declined', totalPrice: 22800, title: 'DP-1: Security Upgrade', departmentId: 'DEPT-2', items: [
          { id: 'ITEM-DP-1A', name: 'IP Cameras', quantity: 20, unitPrice: 150, perItemAwardDetails: [{ score: 91, rank: 1, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', status: 'Declined', quoteItemId: 'QITEM-DP1-A1', proposedItemName: 'Generic Cam', unitPrice: 150 }, { score: 90, rank: 2, vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', status: 'Standby', quoteItemId: 'QITEM-DP1-A2', proposedItemName: 'Samsung Cam', unitPrice: 140 }] },
          { id: 'ITEM-DP-1B', name: 'NVR System', quantity: 1, unitPrice: 2000, perItemAwardDetails: [{ score: 94, rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Accepted', quoteItemId: 'QITEM-DP1-B', proposedItemName: 'Dell NVR', unitPrice: 2000 }] }
      ]},
      { id: 'REQ-DP-2', status: 'Awarded', totalPrice: 1800, title: 'DP-2: Graphic Tablets', departmentId: 'DEPT-1', items: [
          { id: 'ITEM-DP-2A', name: 'Wacom Intuos Pro', quantity: 3, unitPrice: 600, perItemAwardDetails: [{ score: 96, rank: 1, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', status: 'Awarded', quoteItemId: 'QITEM-DP2-A1', proposedItemName: 'Wacom Intuos Pro', unitPrice: 600 }, { score: 92, rank: 2, vendorId: 'VENDOR-004', vendorName: 'Logitech', status: 'Standby', quoteItemId: 'QITEM-DP2-A2', proposedItemName: 'Logi Pen Tablet', unitPrice: 580 }] }
      ]},
      { id: 'REQ-DP-3', status: 'Awarded', totalPrice: 5000, title: 'DP-3: Department Printer', departmentId: 'DEPT-5', items: [
          { id: 'ITEM-DP-3A', name: 'Color Laser Printer', quantity: 1, unitPrice: 5000, perItemAwardDetails: [{ score: 93, rank: 1, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', status: 'Awarded', quoteItemId: 'QITEM-DP3-A1', proposedItemName: 'HP Color LaserJet', unitPrice: 5000 }, { score: 91, rank: 2, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Standby', quoteItemId: 'QITEM-DP3-A2', proposedItemName: 'Dell Color Laser', unitPrice: 4900 }] }
      ]},
      { id: 'REQ-DP-4', status: 'Awarded', totalPrice: 7500, title: 'DP-4: Podcast Equipment', departmentId: 'DEPT-1', items: [
          { id: 'ITEM-DP-4A', name: 'USB Microphones', quantity: 5, unitPrice: 300, perItemAwardDetails: [{ score: 95, rank: 1, vendorId: 'VENDOR-004', vendorName: 'Logitech', status: 'Awarded', quoteItemId: 'QITEM-DP4-A1', proposedItemName: 'Blue Yeti', unitPrice: 300 }, { score: 90, rank: 2, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', status: 'Standby', quoteItemId: 'QITEM-DP4-A2', proposedItemName: 'Apogee Mic', unitPrice: 320 }] },
          { id: 'ITEM-DP-4B', name: 'Audio Interface', quantity: 1, unitPrice: 6000, perItemAwardDetails: [{ score: 94, rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Awarded', quoteItemId: 'QITEM-DP4-B', proposedItemName: 'Focusrite Scarlett', unitPrice: 6000 }] }
      ]},
      { id: 'REQ-DP-5', status: 'Awarded', totalPrice: 22000, title: 'DP-5: Video Editing Monitors', departmentId: 'DEPT-1', items: [
          { id: 'ITEM-DP-5A', name: '32-inch 4K Monitor', quantity: 4, unitPrice: 5500, perItemAwardDetails: [{ score: 97, rank: 1, vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', status: 'Awarded', quoteItemId: 'QITEM-DP5-A1', proposedItemName: 'Samsung ViewFinity S9', unitPrice: 5500 }, { score: 96, rank: 2, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Standby', quoteItemId: 'QITEM-DP5-A2', proposedItemName: 'Dell UltraSharp 32', unitPrice: 5400 }] }
      ]},

      // SCENARIO SE (Standby Exhaustion): All vendors decline, item fails
      { id: 'REQ-SE-1', status: 'Award_Declined', totalPrice: 10000, title: 'SE-1: Specialized Sensor', departmentId: 'DEPT-3', items: [
          { id: 'ITEM-SE-1A', name: 'LIDAR Sensor', quantity: 1, unitPrice: 10000, perItemAwardDetails: [{ score: 85, rank: 1, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', status: 'Declined', quoteItemId: 'QITEM-SE1-A1', proposedItemName: 'Apple LIDAR', unitPrice: 10000 }, { score: 82, rank: 2, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Declined', quoteItemId: 'QITEM-SE1-A2', proposedItemName: 'Dell LIDAR', unitPrice: 9800 }, { score: 80, rank: 3, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', status: 'Declined', quoteItemId: 'QITEM-SE1-A3', proposedItemName: 'HP LIDAR', unitPrice: 9700 }] }
      ]},
      { id: 'REQ-SE-2', status: 'Award_Declined', totalPrice: 25000, title: 'SE-2: VR Development Kits', departmentId: 'DEPT-1', items: [
          { id: 'ITEM-SE-2A', name: 'VR Headset', quantity: 5, unitPrice: 5000, perItemAwardDetails: [{ score: 90, rank: 1, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', status: 'Declined', quoteItemId: 'QITEM-SE2-A1', proposedItemName: 'HP Reverb G2', unitPrice: 5000 }, { score: 88, rank: 2, vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', status: 'Standby', quoteItemId: 'QITEM-SE2-A2', proposedItemName: 'Samsung Odyssey+', unitPrice: 4800 }] }
      ]},
      { id: 'REQ-SE-3', status: 'Award_Declined', totalPrice: 3000, title: 'SE-3: Ergonomic Mice', departmentId: 'DEPT-2', items: [
          { id: 'ITEM-SE-3A', name: 'Vertical Mouse', quantity: 10, unitPrice: 300, perItemAwardDetails: [{ score: 95, rank: 1, vendorId: 'VENDOR-004', vendorName: 'Logitech', status: 'Declined', quoteItemId: 'QITEM-SE3-A1', proposedItemName: 'Logitech MX Vertical', unitPrice: 300 }, { score: 94, rank: 2, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Declined', quoteItemId: 'QITEM-SE3-A2', proposedItemName: 'Dell Vertical Mouse', unitPrice: 290 }] }
      ]},
      { id: 'REQ-SE-4', status: 'Award_Declined', totalPrice: 12000, title: 'SE-4: 10Gb Network Cards', departmentId: 'DEPT-3', items: [
          { id: 'ITEM-SE-4A', name: 'PCIe 10Gb NIC', quantity: 10, unitPrice: 1200, perItemAwardDetails: [{ score: 89, rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Declined', quoteItemId: 'QITEM-SE4-A1', proposedItemName: 'Intel X520-DA2', unitPrice: 1200 }, { score: 87, rank: 2, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', status: 'Standby', quoteItemId: 'QITEM-SE4-A2', proposedItemName: 'Broadcom 57810S', unitPrice: 1150 }] }
      ]},
      { id: 'REQ-SE-5', status: 'PO_Created', totalPrice: 24000, title: 'SE-5: Mixed Success', departmentId: 'DEPT-3', items: [
          { id: 'ITEM-SE-5A', name: 'Rackmount Server', quantity: 1, unitPrice: 20000, perItemAwardDetails: [{ score: 96, rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Accepted', quoteItemId: 'QITEM-SE5-A', proposedItemName: 'Dell PowerEdge R750', unitPrice: 20000 }] },
          { id: 'ITEM-SE-5B', name: 'KVM Switch', quantity: 1, unitPrice: 4000, perItemAwardDetails: [{ score: 91, rank: 1, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', status: 'Failed_to_Award', quoteItemId: 'QITEM-SE5-B1', proposedItemName: 'HP KVM Switch', unitPrice: 4000 }, { score: 90, rank: 2, vendorId: 'VENDOR-004', vendorName: 'Logitech', status: 'Failed_to_Award', quoteItemId: 'QITEM-SE5-B2', proposedItemName: 'Logi KVM', unitPrice: 3900 }] }
      ]},

      // SCENARIO PP (Partial Payment): One item is paid, other tracks continue
      { id: 'REQ-PP-1', status: 'PO_Created', totalPrice: 13000, title: 'PP-1: Remote Work Kits', departmentId: 'DEPT-2', items: [
          { id: 'ITEM-PP-1A', name: 'Noise-Cancelling Headphones', quantity: 10, unitPrice: 500, perItemAwardDetails: [{ score: 93, rank: 1, vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', status: 'Accepted', quoteItemId: 'QITEM-PP1-A', proposedItemName: 'Bose QC45', unitPrice: 500 }] }, // This one is PAID
          { id: 'ITEM-PP-1B', name: 'External SSD', quantity: 10, unitPrice: 800, perItemAwardDetails: [{ score: 95, rank: 1, vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', status: 'Awarded', quoteItemId: 'QITEM-PP1-B', proposedItemName: 'Samsung T7 Shield', unitPrice: 800 }] } // This one is NOT yet accepted
      ]},
      { id: 'REQ-PP-2', status: 'PO_Created', totalPrice: 30000, title: 'PP-2: IT Support Laptops', departmentId: 'DEPT-3', items: [
          { id: 'ITEM-PP-2A', name: '15-inch Dell Laptop', quantity: 10, unitPrice: 2000, perItemAwardDetails: [{ score: 98, rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Accepted', quoteItemId: 'QITEM-PP2-A', proposedItemName: 'Dell Latitude 5530', unitPrice: 2000 }] }, // PAID
          { id: 'ITEM-PP-2B', name: 'Docking Station', quantity: 10, unitPrice: 1000, perItemAwardDetails: [{ score: 96, rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Awarded', quoteItemId: 'QITEM-PP2-B', proposedItemName: 'Dell Dock WD22TB4', unitPrice: 1000 }] } // NOT accepted
      ]},
      { id: 'REQ-PP-3', status: 'PO_Created', totalPrice: 2500, title: 'PP-3: Welcome Desk Supplies', departmentId: 'DEPT-2', items: [
          { id: 'ITEM-PP-3A', name: 'Guest Sign-in Tablet', quantity: 1, unitPrice: 1000, perItemAwardDetails: [{ score: 90, rank: 1, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', status: 'Accepted', quoteItemId: 'QITEM-PP3-A', proposedItemName: 'iPad 10.2', unitPrice: 1000 }] }, // PAID
          { id: 'ITEM-PP-3B', name: 'Reception Intercom', quantity: 1, unitPrice: 1500, perItemAwardDetails: [{ score: 89, rank: 1, vendorId: 'VENDOR-004', vendorName: 'Logitech', status: 'Accepted', quoteItemId: 'QITEM-PP3-B', proposedItemName: 'Logitech Zone Wireless', unitPrice: 1500 }] } // NOT paid
      ]},
      { id: 'REQ-PP-4', status: 'PO_Created', totalPrice: 11000, title: 'PP-4: Software Licenses', departmentId: 'DEPT-3', items: [
          { id: 'ITEM-PP-4A', name: 'Microsoft 365 E5', quantity: 20, unitPrice: 550, perItemAwardDetails: [{ score: 99, rank: 1, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', status: 'Accepted', quoteItemId: 'QITEM-PP4-A', proposedItemName: 'M365 E5 License', unitPrice: 550 }] }, // PAID
      ]},
      { id: 'REQ-PP-5', status: 'PO_Created', totalPrice: 6000, title: 'PP-5: Printer Maintenance Kits', departmentId: 'DEPT-2', items: [
          { id: 'ITEM-PP-5A', name: 'Toner Cartridges', quantity: 20, unitPrice: 300, perItemAwardDetails: [{ score: 91, rank: 1, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', status: 'Accepted', quoteItemId: 'QITEM-PP5-A', proposedItemName: 'HP 58A Toner', unitPrice: 300 }] }, // NOT paid
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
    bid.items.push({
      id: detail.quoteItemId,
      requisitionItemId: req.items.find(i => (i.perItemAwardDetails || []).some(d => d.quoteItemId === detail.quoteItemId))!.id,
      name: detail.proposedItemName,
      quantity: req.items.find(i => (i.perItemAwardDetails || []).some(d => d.quoteItemId === detail.quoteItemId))!.quantity,
      unitPrice: detail.unitPrice,
      leadTimeDays: 14,
    });
    bid.totalPrice += bid.items[bid.items.length-1].quantity * bid.items[bid.items.length-1].unitPrice;
  });

  Array.from(vendorBids.entries()).forEach(([vendorId, bid]) => {
    const vendor = seedData.vendors.find(v => v.id === vendorId)!;
    const allStatuses = itemDetails.filter(d => d.vendorId === vendorId).map(d => d.status);
    let finalStatus: Quotation['status'] = 'Submitted';
    if (allStatuses.includes('Accepted')) finalStatus = 'Accepted';
    else if (allStatuses.includes('Awarded')) finalStatus = 'Awarded';
    else if (allStatuses.includes('Declined')) finalStatus = 'Declined';
    else if (allStatuses.includes('Standby')) finalStatus = 'Standby';
    else if (allStatuses.includes('Failed_to_Award')) finalStatus = 'Failed';

    seedData.quotations.push({
      id: `QUO-${req.id}-${vendorId}`,
      transactionId: req.transactionId,
      requisitionId: req.id,
      vendorId: vendorId,
      vendorName: vendor.name,
      items: bid.items,
      totalPrice: bid.totalPrice,
      status: finalStatus,
      createdAt: now,
      updatedAt: now,
      deliveryDate: now,
    });

    if (finalStatus === 'Accepted') {
        const poId = `PO-${req.id}-${vendorId}`;
        seedData.purchaseOrders.push({
            id: poId,
            transactionId: req.transactionId,
            requisitionId: req.id,
            requisitionTitle: req.title,
            vendorId: vendor.id,
            totalAmount: bid.totalPrice,
            status: 'Delivered',
            createdAt: now,
            items: bid.items.map(i => ({...i, id: `PO${i.id}`, totalPrice: i.quantity * i.unitPrice, receivedQuantity: i.quantity })),
        });

        const isPaid = (req.id === 'REQ-PP-1' && i.requisitionItemId === 'ITEM-PP-1A') ||
                       (req.id === 'REQ-PP-2' && i.requisitionItemId === 'ITEM-PP-2A') ||
                       (req.id === 'REQ-PP-3' && i.requisitionItemId === 'ITEM-PP-3A') ||
                       (req.id === 'REQ-PP-4' && i.requisitionItemId === 'ITEM-PP-4A');

        if (req.id.startsWith('REQ-PP')) { // Only create invoices for the partial payment scenario initially
           const invId = `INV-${poId}`;
           seedData.invoices.push({
                id: invId,
                transactionId: req.transactionId,
                purchaseOrderId: poId,
                vendorId: vendor.id,
                invoiceDate: now,
                totalAmount: bid.totalPrice,
                status: isPaid ? 'Paid' : 'Approved_for_Payment',
                paymentReference: isPaid ? `PAY-${invId}` : undefined,
                items: bid.items.map(i => ({ ...i, id: `INV${i.id}`, totalPrice: i.quantity * i.unitPrice })),
           });

           seedData.goodsReceipts.push({
                id: `GRN-${poId}`,
                transactionId: req.transactionId,
                purchaseOrderId: poId,
                receivedById: '4', // David (Receiving)
                receivedDate: now,
                items: bid.items.map(i => ({ poItemId: `PO${i.id}`, quantityReceived: i.quantity, condition: 'Good' }))
           });
        }
    }
  });
});
