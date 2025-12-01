
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { DocumentRecord, User, Vendor, Minute } from '@/lib/types';

// Helper function to find user/vendor names efficiently
const createNameFinder = (users: User[], vendors: Vendor[]) => {
    const userMap = new Map(users.map(u => [u.id, u.name]));
    const vendorMap = new Map(vendors.map(v => [v.id, v.name]));
    return (id: string | null | undefined, type: 'user' | 'vendor') => {
        if (!id) return 'N/A';
        if (type === 'user') return userMap.get(id) || 'Unknown User';
        return vendorMap.get(id) || 'Unknown Vendor';
    }
}

export async function GET() {
    try {
        const [requisitions, quotations, purchaseOrders, goodsReceipts, invoices, contracts, auditLogs, users, vendors] = await Promise.all([
            prisma.purchaseRequisition.findMany({ include: { department: true, requester: true, minutes: { include: { author: true, attendees: true } } } }),
            prisma.quotation.findMany(),
            prisma.purchaseOrder.findMany({ include: { vendor: true } }),
            prisma.goodsReceiptNote.findMany({ include: { receivedBy: true } }),
            prisma.invoice.findMany(),
            prisma.contract.findMany({ include: { requisition: { select: { title: true }}, vendor: { select: { name: true }}}}),
            prisma.auditLog.findMany({ include: { user: { include: { roles: true } } }, orderBy: { timestamp: 'desc' } }),
            prisma.user.findMany(),
            prisma.vendor.findMany(),
        ]);

        const getName = createNameFinder(users as User[], vendors as Vendor[]);
        const allRecords: DocumentRecord[] = [];

        requisitions.forEach(r => {
            allRecords.push({
                id: r.id,
                type: 'Requisition',
                title: r.title,
                status: r.status.replace(/_/g, ' '),
                date: r.createdAt,
                amount: r.totalPrice,
                user: r.requester.name || 'N/A',
                transactionId: r.transactionId!,
                minutes: r.minutes as unknown as Minute[],
            });
        });

        quotations.forEach(q => {
            allRecords.push({
                id: q.id,
                type: 'Quotation',
                title: `Quote from ${q.vendorName}`,
                status: q.status.replace(/_/g, ' '),
                date: q.createdAt,
                amount: q.totalPrice,
                user: q.vendorName,
                transactionId: q.transactionId!
            });
        });

        purchaseOrders.forEach(po => {
            allRecords.push({
                id: po.id,
                type: 'Purchase Order',
                title: po.requisitionTitle,
                status: po.status.replace(/_/g, ' '),
                date: po.createdAt,
                amount: po.totalAmount,
                user: po.vendor.name,
                transactionId: po.transactionId!,
            });
        });

        goodsReceipts.forEach(grn => {
            allRecords.push({
                id: grn.id,
                type: 'Goods Receipt',
                title: `GRN for PO ${grn.purchaseOrderId}`,
                status: 'Completed',
                date: grn.receivedDate,
                amount: 0, // GRNs don't typically have an amount
                user: grn.receivedBy.name,
                transactionId: grn.transactionId!,
            });
        });

        invoices.forEach(inv => {
            allRecords.push({
                id: inv.id,
                type: 'Invoice',
                title: `Invoice for PO ${inv.purchaseOrderId}`,
                status: inv.status.replace(/_/g, ' '),
                date: inv.invoiceDate,
                amount: inv.totalAmount,
                user: getName(inv.vendorId, 'vendor'),
                transactionId: inv.transactionId!,
            });
        });

        contracts.forEach(c => {
             allRecords.push({
                id: c.id,
                type: 'Contract',
                title: `Contract for: ${c.requisition.title}`,
                status: c.status.replace(/_/g, ' '),
                date: c.createdAt,
                amount: 0,
                user: c.vendor.name,
                transactionId: c.requisitionId, // Use requisitionId as transactionId
            });
        });

        // Sort all records by date descending
        allRecords.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        // Group audit logs by transactionId for efficient lookup
        const auditLogMap = new Map<string, any[]>();
        auditLogs.forEach(log => {
            if (log.transactionId) {
                if (!auditLogMap.has(log.transactionId)) {
                    auditLogMap.set(log.transactionId, []);
                }
                const userRoles = log.user?.roles?.map(r => r.name.replace(/_/g, ' ')).join(', ') || 'System';
                auditLogMap.get(log.transactionId)?.push({
                    ...log,
                    role: userRoles,
                    user: log.user?.name || 'System'
                });
            }
        });

        // Add audit trails to each record using the transactionId
        const recordsWithAudit = allRecords.map(record => {
            const relatedLogs = auditLogMap.get(record.transactionId) || [];
            // The logs are already sorted by timestamp descending from the initial query
            return {
                ...record,
                auditTrail: relatedLogs,
            };
        });

        return NextResponse.json(recordsWithAudit);

    } catch (error) {
        console.error('Failed to fetch records:');
        return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
    }
}
