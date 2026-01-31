"use server";

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken, isAdmin, isActorAuthorizedForRequisition } from '@/lib/auth';

function mapNextAction(status: string) {
    if (!status) return { message: 'Unknown', responsible: 'System' };
    if (status.startsWith('Pending_')) return { message: 'Awaiting committee/approver action', responsible: 'Approver / Committee' };
    if (status === 'Accepting_Quotes') return { message: 'Accepting quotations from vendors', responsible: 'RFQ Sender / Vendors' };
    if (status === 'Scoring_In_Progress') return { message: 'Committee scoring in progress', responsible: 'Committee Members' };
    if (status === 'Scoring_Complete') return { message: 'Scoring complete - awaiting award', responsible: 'Procurement Officer' };
    if (status === 'PostApproved' || status === 'Awarded') return { message: 'Awarding / PO creation', responsible: 'Procurement / Finance' };
    if (status === 'PO_Created' || status === 'Fulfilled') return { message: 'Order processing / receiving', responsible: 'Receiving / Vendor' };
    return { message: 'In progress', responsible: 'Procurement' };
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
    try {
        const actor = await getActorFromToken(request);

        const id = params.id;
        if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

        const requisition = await prisma.purchaseRequisition.findUnique({
            where: { id },
            include: {
                requester: { select: { id: true, name: true, email: true } },
                department: { select: { id: true, name: true } },
                committeeAssignments: { include: { user: { select: { id: true, name: true, email: true } } } },
                quotations: { select: { id: true, vendorName: true, vendorId: true, status: true, totalPrice: true, createdAt: true } },
                purchaseOrders: { select: { id: true, transactionId: true, totalAmount: true, status: true, createdAt: true } },
            }
        });

        if (!requisition) return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });

        // Authorization: allow admins, requester, or RFQ senders as designated
        const allowed = isAdmin(actor) || actor.id === requisition.requesterId || await isActorAuthorizedForRequisition(actor, id);
        if (!allowed) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

        const auditLogs = await prisma.auditLog.findMany({
            where: { entity: 'Requisition', entityId: id },
            include: { user: { select: { id: true, name: true } } },
            orderBy: { timestamp: 'asc' },
            take: 500,
        });

        const timeline = auditLogs.map(a => ({
            id: a.id,
            timestamp: a.timestamp,
            user: a.user ? { id: a.user.id, name: a.user.name } : null,
            action: a.action,
            details: a.details,
        }));

        const nextAction = mapNextAction(requisition.status);

        return NextResponse.json({
            requisition: {
                id: requisition.id,
                transactionId: requisition.transactionId,
                title: requisition.title,
                status: requisition.status,
                department: requisition.department?.name || null,
                requester: requisition.requester ? { id: requisition.requester.id, name: requisition.requester.name } : null,
                committeeName: requisition.committeeName,
                committeePurpose: requisition.committeePurpose,
                assignedRfqSenderIds: requisition.assignedRfqSenderIds,
                deadline: requisition.deadline,
                scoringDeadline: requisition.scoringDeadline,
                awardResponseDeadline: requisition.awardResponseDeadline,
                rfqSentAt: requisition.rfqSentAt,
                createdAt: requisition.createdAt,
                updatedAt: requisition.updatedAt,
            },
            committeeAssignments: requisition.committeeAssignments.map(c => ({ user: c.user })),
            quotations: requisition.quotations,
            purchaseOrders: requisition.purchaseOrders,
            timeline,
            nextAction,
        });
    } catch (err) {
        console.error('Failed to load requisition location', err);
        return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
}
