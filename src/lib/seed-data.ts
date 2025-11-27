
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
        // --- SCENARIO A: HAPPY PATH (Multi-Vendor Win) - Tests that both tracks must complete ---
        { id: 'REQ-SCENARIO-A', status: 'PO_Created', title: 'A: High-End Workstations', departmentId: 'DEPT-1', totalPrice: 320000, items: [
            { id: 'ITEM-A1', name: 'Mac Studio', unitPrice: 2500, quantity: 100, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', score: 95, status: 'Accepted', quoteItemId: 'QITEM-A1', unitPrice: 2500, proposedItemName: 'Mac Studio' }] },
            { id: 'ITEM-A2', name: 'Ergonomic Chairs', unitPrice: 700, quantity: 100, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', score: 92, status: 'Accepted', quoteItemId: 'QITEM-A2', unitPrice: 700, proposedItemName: 'ErgoChair Pro' }] }
        ]},
        // ... (4 more similar requisitions for Scenario A)
        { id: 'REQ-SCENARIO-A2', status: 'PO_Created', title: 'A2: Marketing Display Booth', departmentId: 'DEPT-1', totalPrice: 5500, items: [
            { id: 'ITEM-A2-1', name: 'Large Banner', unitPrice: 1500, quantity: 1, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', score: 90, status: 'Accepted', quoteItemId: 'QITEM-A2-1', unitPrice: 1500, proposedItemName: 'Vinyl Banner' }] },
            { id: 'ITEM-A2-2', name: 'LED TV Screen', unitPrice: 4000, quantity: 1, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', score: 94, status: 'Accepted', quoteItemId: 'QITEM-A2-2', unitPrice: 4000, proposedItemName: 'Samsung Crystal UHD' }] }
        ]},
        { id: 'REQ-SCENARIO-A3', status: 'PO_Created', title: 'A3: New Hire Onboarding Kits', departmentId: 'DEPT-2', totalPrice: 2200, items: [
            { id: 'ITEM-A3-1', name: 'Laptop Bag', unitPrice: 120, quantity: 10, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', score: 88, status: 'Accepted', quoteItemId: 'QITEM-A3-1', unitPrice: 120, proposedItemName: 'Dell Pro Backpack' }] },
            { id: 'ITEM-A3-2', name: 'Wireless Mouse', unitPrice: 100, quantity: 10, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-004', vendorName: 'Logitech', score: 91, status: 'Accepted', quoteItemId: 'QITEM-A3-2', unitPrice: 100, proposedItemName: 'Logitech MX Master 3S' }] }
        ]},
        { id: 'REQ-SCENARIO-A4', status: 'Awarded', title: 'A4: AV System for Boardroom', departmentId: 'DEPT-3', totalPrice: 8000, items: [
            { id: 'ITEM-A4-1', name: '4K Projector', unitPrice: 5000, quantity: 1, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', score: 93, status: 'Awarded', quoteItemId: 'QITEM-A4-1', unitPrice: 5000, proposedItemName: 'The Premiere 4K Projector' }] },
            { id: 'ITEM-A4-2', name: 'Conference Speakerphone', unitPrice: 3000, quantity: 1, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-004', vendorName: 'Logitech', score: 90, status: 'Awarded', quoteItemId: 'QITEM-A4-2', unitPrice: 3000, proposedItemName: 'Logitech Rally Bar' }] }
        ]},
        { id: 'REQ-SCENARIO-A5', status: 'PO_Created', title: 'A5: R&D Lab Equipment', departmentId: 'DEPT-3', totalPrice: 20000, items: [
            { id: 'ITEM-A5-1', name: 'Oscilloscope', unitPrice: 15000, quantity: 1, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', score: 89, status: 'Accepted', quoteItemId: 'QITEM-A5-1', unitPrice: 15000, proposedItemName: 'Keysight InfiniiVision' }] },
            { id: 'ITEM-A5-2', name: 'Soldering Station', unitPrice: 5000, quantity: 1, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', score: 85, status: 'Accepted', quoteItemId: 'QITEM-A5-2', unitPrice: 5000, proposedItemName: 'Weller WE1010NA' }] }
        ]},


        // --- SCENARIO B: DECLINE & PROMOTE - Tests that standby promotion for one item does not affect others ---
        { id: 'REQ-SCENARIO-B', status: 'Awarded', title: 'B: Security Infrastructure', departmentId: 'DEPT-2', totalPrice: 23000, items: [
            { id: 'ITEM-B1', name: 'Security Cameras', unitPrice: 500, quantity: 10, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', score: 90, status: 'Awarded', quoteItemId: 'QITEM-B1-V1', unitPrice: 500, proposedItemName: 'Eve Outdoor Cam' }, { rank: 2, vendorId: 'VENDOR-004', vendorName: 'Logitech', score: 88, status: 'Standby', quoteItemId: 'QITEM-B1-V2', unitPrice: 480, proposedItemName: 'Logi Circle View' }] },
            { id: 'ITEM-B2', name: 'Network Switches', unitPrice: 1800, quantity: 10, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', score: 92, status: 'Awarded', quoteItemId: 'QITEM-B2', unitPrice: 1800, proposedItemName: 'Dell PowerSwitch' }] }
        ]},
        // ... (4 more similar requisitions for Scenario B)
        { id: 'REQ-SCENARIO-B2', status: 'Awarded', title: 'B2: Mobile Workstations', departmentId: 'DEPT-1', totalPrice: 15000, items: [
            { id: 'ITEM-B2-1', name: '16-inch Laptop', unitPrice: 3000, quantity: 5, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', score: 96, status: 'Awarded', quoteItemId: 'QITEM-B2-1-V1', unitPrice: 3000, proposedItemName: 'MacBook Pro 16' }] },
            { id: 'ITEM-B2-2', name: 'Portable Monitor', unitPrice: 400, quantity: 5, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', score: 91, status: 'Awarded', quoteItemId: 'QITEM-B2-2-V1', unitPrice: 400, proposedItemName: 'Samsung M8 Smart Monitor' }, { rank: 2, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', score: 89, status: 'Standby', quoteItemId: 'QITEM-B2-2-V2', unitPrice: 380, proposedItemName: 'Dell UltraSharp Portable' }] }
        ]},
        { id: 'REQ-SCENARIO-B3', status: 'Awarded', title: 'B3: Content Creator Setup', departmentId: 'DEPT-1', totalPrice: 4500, items: [
            { id: 'ITEM-B3-1', name: 'Microphone', unitPrice: 500, quantity: 3, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-004', vendorName: 'Logitech', score: 94, status: 'Awarded', quoteItemId: 'QITEM-B3-1-V1', unitPrice: 500, proposedItemName: 'Blue Yeti X' }, { rank: 2, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', score: 92, status: 'Standby', quoteItemId: 'QITEM-B3-1-V2', unitPrice: 520, proposedItemName: 'Apogee HypeMiC' }] },
            { id: 'ITEM-B3-2', name: 'Lighting Kit', unitPrice: 1000, quantity: 3, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', score: 88, status: 'Awarded', quoteItemId: 'QITEM-B3-2', unitPrice: 1000, proposedItemName: 'Elgato Key Light' }] }
        ]},
        { id: 'REQ-SCENARIO-B4', status: 'Awarded', title: 'B4: Data Center Cooling', departmentId: 'DEPT-3', totalPrice: 25000, items: [
            { id: 'ITEM-B4-1', name: 'In-Row Cooling Unit', unitPrice: 25000, quantity: 1, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', score: 91, status: 'Awarded', quoteItemId: 'QITEM-B4-1-V1', unitPrice: 25000, proposedItemName: 'APC InRow DX' }, { rank: 2, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', score: 90, status: 'Standby', quoteItemId: 'QITEM-B4-1-V2', unitPrice: 24500, proposedItemName: 'HPE Rack-mountable cooler' }] },
        ]},
        { id: 'REQ-SCENARIO-B5', status: 'Awarded', title: 'B5: Executive Office Refresh', departmentId: 'DEPT-2', totalPrice: 7000, items: [
            { id: 'ITEM-B5-1', name: 'Leather Office Chair', unitPrice: 1500, quantity: 2, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', score: 93, status: 'Awarded', quoteItemId: 'QITEM-B5-1', unitPrice: 1500, proposedItemName: 'Herman Miller Eames' }] },
            { id: 'ITEM-B5-2', name: 'Ultrawide Monitor', unitPrice: 2000, quantity: 2, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', score: 95, status: 'Awarded', quoteItemId: 'QITEM-B5-2-V1', unitPrice: 2000, proposedItemName: 'Samsung Odyssey G9' }, { rank: 2, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', score: 94, status: 'Standby', quoteItemId: 'QITEM-B5-2-V2', unitPrice: 1950, proposedItemName: 'Dell UltraSharp 49' }] }
        ]},


        // --- SCENARIO C: EXHAUSTION & RESTART - Tests that an item can fail fully and be restarted ---
        { id: 'REQ-SCENARIO-C', status: 'Award_Declined', title: 'C: Specialized Lab Gear', departmentId: 'DEPT-3', totalPrice: 14000, items: [
            { id: 'ITEM-C1', name: 'Spectrum Analyzer', unitPrice: 14000, quantity: 1, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', score: 85, status: 'Failed_to_Award' }, { rank: 2, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', score: 82, status: 'Failed_to_Award' }, { rank: 3, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', score: 80, status: 'Declined' }] }
        ]},
        // ... (4 more similar requisitions for Scenario C)
        { id: 'REQ-SCENARIO-C2', status: 'Award_Declined', title: 'C2: Custom Drone Project', departmentId: 'DEPT-3', totalPrice: 50000, items: [
            { id: 'ITEM-C2-1', name: 'High-Torque Motors', unitPrice: 500, quantity: 100, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', score: 88, status: 'Declined' }] }
        ]},
        { id: 'REQ-SCENARIO-C3', status: 'Award_Declined', title: 'C3: Large Format Printer', departmentId: 'DEPT-1', totalPrice: 8000, items: [
            { id: 'ITEM-C3-1', name: '44-inch Plotter', unitPrice: 8000, quantity: 1, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', score: 93, status: 'Failed_to_Award' }, { rank: 2, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', score: 90, status: 'Declined' }] }
        ]},
        { id: 'REQ-SCENARIO-C4', status: 'PO_Created', title: 'C4: Mixed Success', departmentId: 'DEPT-1', totalPrice: 4500, items: [
            { id: 'ITEM-C4-1', name: 'Wacom Tablet', unitPrice: 3000, quantity: 1, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-004', vendorName: 'Logitech', score: 95, status: 'Accepted', quoteItemId: 'QITEM-C4-1', unitPrice: 3000, proposedItemName: 'Wacom Cintiq Pro' }] },
            { id: 'ITEM-C4-2', name: '3D Mouse', unitPrice: 1500, quantity: 1, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-004', vendorName: 'Logitech', score: 92, status: 'Failed_to_Award' }] }
        ]},
        { id: 'REQ-SCENARIO-C5', status: 'Award_Declined', title: 'C5: Industrial Shredder', departmentId: 'DEPT-2', totalPrice: 6000, items: [
            { id: 'ITEM-C5-1', name: 'Cross-Cut Shredder', unitPrice: 6000, quantity: 1, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', score: 85, status: 'Declined' }] }
        ]},


        // --- SCENARIO D: PARTIAL PAYMENT - Tests that one track completing doesn't close the whole req ---
        { id: 'REQ-SCENARIO-D', status: 'PO_Created', title: 'D: Office Tech Refresh', departmentId: 'DEPT-2', totalPrice: 16000, items: [
            { id: 'ITEM-D1', name: 'Docking Stations', unitPrice: 400, quantity: 20, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', score: 93, status: 'Accepted', quoteItemId: 'QITEM-D1', unitPrice: 400, proposedItemName: 'Dell WD19S Dock' }] }, // This track will be PAID
            { id: 'ITEM-D2', name: '4K Monitors', unitPrice: 800, quantity: 10, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', score: 95, status: 'Awarded', quoteItemId: 'QITEM-D2', unitPrice: 800, proposedItemName: 'Samsung ViewFinity S8' }] } // This track is still PENDING vendor response
        ]},
        // ... (4 more similar requisitions for Scenario D)
        { id: 'REQ-SCENARIO-D2', status: 'PO_Created', title: 'D2: Server & Client Software', departmentId: 'DEPT-3', totalPrice: 30000, items: [
            { id: 'ITEM-D2-1', name: 'Adobe Creative Cloud', unitPrice: 600, quantity: 25, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', score: 99, status: 'Accepted', quoteItemId: 'QITEM-D2-1', unitPrice: 600, proposedItemName: 'Adobe CC Team License' }] }, // PAID
            { id: 'ITEM-D2-2', name: 'Windows Server License', unitPrice: 15000, quantity: 1, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', score: 98, status: 'Awarded', quoteItemId: 'QITEM-D2-2', unitPrice: 15000, proposedItemName: 'Windows Server 2022' }] } // PENDING
        ]},
        { id: 'REQ-SCENARIO-D3', status: 'PO_Created', title: 'D3: Office Kitchen Appliances', departmentId: 'DEPT-2', totalPrice: 3500, items: [
            { id: 'ITEM-D3-1', name: 'Coffee Machine', unitPrice: 2000, quantity: 1, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', score: 85, status: 'Accepted', quoteItemId: 'QITEM-D3-1', unitPrice: 2000, proposedItemName: 'Jura E8' }] }, // PAID
            { id: 'ITEM-D3-2', name: 'Microwave Oven', unitPrice: 1500, quantity: 1, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', score: 88, status: 'Accepted', quoteItemId: 'QITEM-D3-2', unitPrice: 1500, proposedItemName: 'Samsung Smart Oven' }] } // NOT PAID YET
        ]},
        { id: 'REQ-SCENARIO-D4', status: 'PO_Created', title: 'D4: Networking Gear', departmentId: 'DEPT-3', totalPrice: 8000, items: [
            { id: 'ITEM-D4-1', name: 'Access Points', unitPrice: 500, quantity: 10, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', score: 91, status: 'Accepted', quoteItemId: 'QITEM-D4-1', unitPrice: 500, proposedItemName: 'Ubiquiti U6-Pro' }] }, // PAID
            { id: 'ITEM-D4-2', name: 'PoE Switch', unitPrice: 3000, quantity: 1, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-003', vendorName: 'HP Inc.', score: 90, status: 'Awarded', quoteItemId: 'QITEM-D4-2', unitPrice: 3000, proposedItemName: 'Aruba 2930F' }] } // PENDING
        ]},
        { id: 'REQ-SCENARIO-D5', status: 'Awarded', title: 'D5: Training Subscriptions', departmentId: 'DEPT-1', totalPrice: 12000, items: [
            { id: 'ITEM-D5-1', name: 'Pluralsight Licenses', unitPrice: 400, quantity: 20, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', score: 94, status: 'Awarded', quoteItemId: 'QITEM-D5-1', unitPrice: 400, proposedItemName: 'Pluralsight Premium' }] },
            { id: 'ITEM-D5-2', name: 'Figma Licenses', unitPrice: 200, quantity: 20, perItemAwardDetails: [{ rank: 1, vendorId: 'VENDOR-004', vendorName: 'Logitech', score: 92, status: 'Awarded', quoteItemId: 'QITEM-D5-2', unitPrice: 200, proposedItemName: 'Figma Organization Plan' }] }
        ]},

    ].map(r => ({ ...r, requesterId: '1', justification: r.title, urgency: 'Medium', createdAt: new Date(), updatedAt: new Date(), rfqSettings: { awardStrategy: 'item' }})) as unknown as PurchaseRequisition[],

    quotations: [
        // SCENARIO A Quotes
        { id: 'QUO-A1', requisitionId: 'REQ-SCENARIO-A', vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', status: 'Accepted', totalPrice: 250000, createdAt: new Date(), deliveryDate: new Date(), items: [{ id: 'QITEM-A1', requisitionItemId: 'ITEM-A1', name: 'Mac Studio', quantity: 100, unitPrice: 2500, leadTimeDays: 14 }] },
        { id: 'QUO-A2', requisitionId: 'REQ-SCENARIO-A', vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Accepted', totalPrice: 70000, createdAt: new Date(), deliveryDate: new Date(), items: [{ id: 'QITEM-A2', requisitionItemId: 'ITEM-A2', name: 'ErgoChair Pro', quantity: 100, unitPrice: 700, leadTimeDays: 10 }] },
        // SCENARIO B Quotes
        { id: 'QUO-B1', requisitionId: 'REQ-SCENARIO-B', vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', status: 'Awarded', totalPrice: 5000, createdAt: new Date(), deliveryDate: new Date(), items: [{ id: 'QITEM-B1-V1', requisitionItemId: 'ITEM-B1', name: 'Eve Outdoor Cam', quantity: 10, unitPrice: 500, leadTimeDays: 12 }] },
        { id: 'QUO-B2', requisitionId: 'REQ-SCENARIO-B', vendorId: 'VENDOR-004', vendorName: 'Logitech', status: 'Standby', totalPrice: 4800, createdAt: new Date(), deliveryDate: new Date(), items: [{ id: 'QITEM-B1-V2', requisitionItemId: 'ITEM-B1', name: 'Logi Circle View', quantity: 10, unitPrice: 480, leadTimeDays: 15 }] },
        { id: 'QUO-B3', requisitionId: 'REQ-SCENARIO-B', vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Awarded', totalPrice: 18000, createdAt: new Date(), deliveryDate: new Date(), items: [{ id: 'QITEM-B2', requisitionItemId: 'ITEM-B2', name: 'Dell PowerSwitch', quantity: 10, unitPrice: 1800, leadTimeDays: 7 }] },
        // SCENARIO C Quotes
        { id: 'QUO-C1', requisitionId: 'REQ-SCENARIO-C', vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', status: 'Failed_to_Award', totalPrice: 8000, createdAt: new Date(), deliveryDate: new Date(), items: [{ id: 'QITEM-C1', requisitionItemId: 'ITEM-C1', name: 'Fancy 3D Printer', quantity: 1, unitPrice: 8000, leadTimeDays: 30 }] },
        { id: 'QUO-C2', requisitionId: 'REQ-SCENARIO-C', vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Failed_to_Award', totalPrice: 7800, createdAt: new Date(), deliveryDate: new Date(), items: [{ id: 'QITEM-C2', requisitionItemId: 'ITEM-C1', name: 'Dell 3D Printer', quantity: 1, unitPrice: 7800, leadTimeDays: 25 }] },
        { id: 'QUO-C3', requisitionId: 'REQ-SCENARIO-C', vendorId: 'VENDOR-003', vendorName: 'HP Inc.', status: 'Declined', totalPrice: 7500, createdAt: new Date(), deliveryDate: new Date(), items: [{ id: 'QITEM-C3', requisitionItemId: 'ITEM-C1', name: 'HP 3D Printer', quantity: 1, unitPrice: 7500, leadTimeDays: 20 }] },
        // SCENARIO D Quotes
        { id: 'QUO-D1', requisitionId: 'REQ-SCENARIO-D', vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Accepted', totalPrice: 8000, createdAt: new Date(), deliveryDate: new Date(), items: [{ id: 'QITEM-D1', requisitionItemId: 'ITEM-D1', name: 'Dell WD19S Dock', quantity: 20, unitPrice: 400, leadTimeDays: 5 }] },
        { id: 'QUO-D2', requisitionId: 'REQ-SCENARIO-D', vendorId: 'VENDOR-005', vendorName: 'Samsung Electronics', status: 'Awarded', totalPrice: 8000, createdAt: new Date(), deliveryDate: new Date(), items: [{ id: 'QITEM-D2', requisitionItemId: 'ITEM-D2', name: 'Samsung ViewFinity S8', quantity: 10, unitPrice: 800, leadTimeDays: 14 }] },
    ],

    purchaseOrders: [
        { id: 'PO-SCENARIO-D1', requisitionId: 'REQ-SCENARIO-D', vendorId: 'VENDOR-002', requisitionTitle: 'D: Office Tech Refresh', totalAmount: 8000, status: 'Delivered', createdAt: new Date(), items: [{ id: 'POITEM-D1', requisitionItemId: 'ITEM-D1', name: 'Dell WD19S Dock', quantity: 20, unitPrice: 400, totalPrice: 8000, receivedQuantity: 20 }] },
    ],

    invoices: [
        { id: 'INV-SCENARIO-D1', purchaseOrderId: 'PO-SCENARIO-D1', vendorId: 'VENDOR-002', invoiceDate: new Date(), totalAmount: 8000, status: 'Paid', paymentReference: 'PAY-SCENARIO-D', items: [{ id: 'INVITEM-D1', name: 'Dell WD19S Dock', quantity: 20, unitPrice: 400, totalPrice: 8000 }] },
    ],

    goodsReceipts: [
        { id: 'GRN-SCENARIO-D1', purchaseOrderId: 'PO-SCENARIO-D1', receivedById: '4', receivedDate: new Date(), items: [{ poItemId: 'POITEM-D1', quantityReceived: 20, condition: 'Good' }] },
    ],

    auditLogs: [],
};
