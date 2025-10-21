
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
            status: 'Approved',
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
            status: 'Pending Approval',
            urgency: 'Low',
            createdAt: new Date('2023-10-02T14:00:00Z'),
            updatedAt: new Date('2023-10-02T14:00:00Z'),
            quotations: [],
        },
        {
            id: `REQ-1672704000`,
            requesterId: '3',
            title: 'Software License Renewals',
            department: 'IT',
            departmentId: 'DEPT-3',
            items: [
              { id: 'ITEM-5', name: 'Project Management Tool (Annual)', quantity: 20, unitPrice: 240, description: '' },
            ],
            totalPrice: 4800,
            justification: 'Annual renewal for critical project management software.',
            status: 'PO Created',
            urgency: 'Medium',
            purchaseOrderId: 'PO-SEED-001',
            createdAt: new Date('2023-09-15T09:20:00Z'),
            updatedAt: new Date('2023-09-25T16:00:00Z'),
            quotations: [],
        },
    ],

    auditLogs: [
        {
            id: 'log-001',
            timestamp: new Date('2023-10-26T10:00:00Z'),
            user: 'Alice',
            role: 'Requester',
            action: 'CREATE',
            entity: 'Requisition',
            entityId: 'REQ-1672531200',
            details: 'Created new requisition for "New Laptops for Design Team"',
        },
        {
            id: 'log-002',
            timestamp: new Date('2023-10-26T10:05:00Z'),
            user: 'System',
            role: 'Admin',
            action: 'POLICY_CHECK',
            entity: 'Requisition',
            entityId: 'REQ-1672531200',
            details: 'Automated policy check passed',
        },
        {
            id: 'log-003',
            timestamp: new Date('2023-10-26T11:30:00Z'),
            user: 'Bob',
            role: 'Approver',
            action: 'APPROVE',
            entity: 'Requisition',
            entityId: 'REQ-1672531200',
            details: 'Approved requisition. Comment: "Urgent need, proceed."',
        },
    ],

    quotations: [
        {
            id: 'QUO-001',
            requisitionId: 'REQ-1672531200',
            vendorId: 'VENDOR-001',
            vendorName: 'Apple Inc.',
            items: [
                { requisitionItemId: 'ITEM-1', name: 'MacBook Pro 16-inch', quantity: 5, unitPrice: 2450, leadTimeDays: 14 },
                { requisitionItemId: 'ITEM-2', name: '4K Monitor', quantity: 5, unitPrice: 780, leadTimeDays: 10 }
            ],
            totalPrice: 16150,
            deliveryDate: new Date('2023-11-15T00:00:00Z'),
            createdAt: new Date('2023-10-06T10:00:00Z'),
            status: 'Submitted',
            notes: 'Bulk discount applied. Warranty included.'
        },
        {
            id: 'QUO-002',
            requisitionId: 'REQ-1672531200',
            vendorId: 'VENDOR-002',
            vendorName: 'Dell Technologies',
            items: [
                 { requisitionItemId: 'ITEM-1', name: 'MacBook Pro 16-inch', quantity: 5, unitPrice: 2550, leadTimeDays: 20 },
                 { requisitionItemId: 'ITEM-2', name: '4K Monitor', quantity: 5, unitPrice: 750, leadTimeDays: 5 }
            ],
            totalPrice: 16500,
            deliveryDate: new Date('2023-11-20T00:00:00Z'),
            createdAt: new Date('2023-10-07T14:30:00Z'),
            status: 'Submitted',
            notes: 'Can ship monitors immediately. Laptops will have a longer lead time.'
        }
    ],
    purchaseOrders: [
        {
            id: 'PO-SEED-001',
            requisitionId: 'REQ-1672704000',
            requisitionTitle: 'Software License Renewals',
            vendor: {
                id: 'VENDOR-002',
                userId: '7',
                name: 'Dell Technologies',
                contactPerson: 'Michael Dell',
                email: 'tade2024bdulin@gmail.com',
                phone: '1-877-275-3355',
                address: '1 Dell Way, Round Rock, TX 78682',
                kycStatus: 'Verified',
            },
            items: [
                { id: 'PO-ITEM-1', name: 'Project Management Tool (Annual)', requisitionItemId: 'ITEM-5', quantity: 20, unitPrice: 235, totalPrice: 4700, receivedQuantity: 20 }
            ],
            totalAmount: 4700,
            status: 'Delivered',
            createdAt: new Date('2023-09-25T16:00:00Z')
        }
    ],
    goodsReceipts: [],
    invoices: [],
    users: [
        { id: '1', name: 'Alice', email: 'alice@example.com', password: 'password123', role: 'Requester', departmentId: 'DEPT-1', department: 'Design', approvalLimit: 0 },
        { id: '2', name: 'Bob', email: 'bob@example.com', password: 'password123', role: 'Approver', departmentId: 'DEPT-2', department: 'Operations', approvalLimit: 10000, managerId: '12' },
        { id: '3', name: 'Charlie', email: 'charlie@example.com', password: 'password123', role: 'Procurement_Officer', departmentId: 'DEPT-2', department: 'Operations', approvalLimit: 0, managerId: '15' },
        { id: '4', name: 'David', email: 'david@example.com', password: 'password123', role: 'Receiving', departmentId: 'DEPT-2', department: 'Operations', approvalLimit: 0 },
        { id: '5', name: 'Eve', email: 'eve@example.com', password: 'password123', role: 'Finance', departmentId: 'DEPT-5', department: 'Finance', approvalLimit: 0 },
        { id: '6', name: 'Apple Inc.', email: 'tade2024bdugit@gmail.com', password: 'password123', role: 'Vendor', vendorId: 'VENDOR-001', approvalLimit: 0 },
        { id: '7', name: 'Dell Technologies', email: 'tade2024bdulin@gmail.com', password: 'password123', role: 'Vendor', vendorId: 'VENDOR-002', approvalLimit: 0 },
        { id: '8', name: 'Office Depot', email: 'vendor@officedepot.com', password: 'password123', role: 'Vendor', vendorId: 'VENDOR-003', approvalLimit: 0 },
        { id: '9', name: 'Fiona', email: 'fiona@example.com', password: 'password123', role: 'Committee_Member', departmentId: 'DEPT-1', department: 'Design', approvalLimit: 0 },
        { id: '10', name: 'George', email: 'george@example.com', password: 'password123', role: 'Committee_Member', departmentId: 'DEPT-3', department: 'IT', approvalLimit: 0 },
        { id: '11', name: 'Hannah', email: 'hannah@example.com', password: 'password123', role: 'Committee', departmentId: 'DEPT-2', department: 'Operations', approvalLimit: 0 },
        { id: '12', name: 'Diana', email: 'diana@example.com', password: 'password123', role: 'Admin', departmentId: 'DEPT-2', department: 'Operations', approvalLimit: 10000000 },
        { id: '13', name: 'Irene', email: 'irene@example.com', password: 'password123', role: 'Committee_A_Member', departmentId: 'DEPT-5', department: 'Finance', approvalLimit: 0 },
        { id: '14', name: 'Jack', email: 'jack@example.com', password: 'password123', role: 'Committee_B_Member', departmentId: 'DEPT-4', department: 'Marketing', approvalLimit: 0 },
        { id: '15', name: 'Procurement Manager', email: 'manager.proc@example.com', password: 'password123', role: 'Manager_Procurement_Division', departmentId: 'DEPT-2', department: 'Operations', approvalLimit: 200000 },
        { id: '16', name: 'Supply Chain Director', email: 'director.supply@example.com', password: 'password123', role: 'Director_Supply_Chain_and_Property_Management', departmentId: 'DEPT-2', department: 'Operations', approvalLimit: 1000000 },
        { id: '17', name: 'VP of Resources', email: 'vp.resources@example.com', password: 'password123', role: 'VP_Resources_and_Facilities', departmentId: 'DEPT-2', department: 'Operations', approvalLimit: 5000000 },
        { id: '18', name: 'President', email: 'president@example.com', password: 'password123', role: 'President', departmentId: 'DEPT-2', department: 'Operations', approvalLimit: 100000000 },
    ],
    departments: [
        { id: 'DEPT-1', name: 'Design', description: 'Handles all creative and design tasks.', headId: '1' },
        { id: 'DEPT-2', name: 'Operations', description: 'Manages day-to-day business operations.', headId: '12' },
        { id: 'DEPT-3', name: 'IT', description: 'Manages all technology and infrastructure.', headId: '3' },
        { id: 'DEPT-4', name: 'Marketing', description: 'Responsible for marketing and sales.', headId: null },
        { id: 'DEPT-5', name: 'Finance', description: 'Handles all financial matters.', headId: '5' },
        { id: 'DEPT-6', name: 'Human Resources', description: 'Manages employee relations and hiring.', headId: null },
    ]
};
