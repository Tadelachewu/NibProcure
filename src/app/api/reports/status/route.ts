"use server";

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken, isAdmin } from '@/lib/auth';

function toCsv(rows: string[][]) {
    return rows.map(r => r.map(cell => {
        if (cell == null) return '';
        const s = String(cell).replace(/"/g, '""');
        return `"${s}"`;
    }).join(',')).join('\n');
}

export async function GET(request: Request) {
    try {
        const actor = await getActorFromToken(request);
        // Only allow admins and procurement officers (procurement role check can be added if needed)
        const roleNames = (actor.roles || []).map((r: any) => (typeof r === 'string' ? r : r.name));
        if (!roleNames.includes('Procurement_Officer') && !isAdmin(actor)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const url = new URL(request.url);
        const startParam = url.searchParams.get('start');
        const endParam = url.searchParams.get('end');
        const format = url.searchParams.get('format') || 'json';

        const end = endParam ? new Date(endParam) : new Date();
        const start = startParam ? new Date(startParam) : new Date(Date.now() - 1000 * 60 * 60 * 24 * 30); // default 30 days

        const where: any = { createdAt: { gte: start, lte: end } };

        const total = await prisma.purchaseRequisition.count({ where });

        // Consider PreApproved as "approved" for reporting purposes as requested
        const approvedStatuses = ['PreApproved', 'PostApproved', 'Awarded', 'PO_Created', 'Fulfilled', 'Closed', 'Partially_Closed'];
        const rejectedStatuses = ['Award_Declined', 'Declined', 'Rejected', 'Failed'];

        const approved = await prisma.purchaseRequisition.count({ where: { ...where, status: { in: approvedStatuses } } });
        const rejected = await prisma.purchaseRequisition.count({ where: { ...where, OR: [{ status: { in: rejectedStatuses } }, { status: { contains: 'Declined' } }] } });

        // Pending overall (any in-progress states)
        const pending = await prisma.purchaseRequisition.count({ where: { ...where, OR: [{ status: { startsWith: 'Pending_' } }, { status: { in: ['Accepting_Quotes', 'Scoring_In_Progress', 'Scoring_Complete', 'Pending_Review', 'Pending_Procurement_Approval'] } }] } });

        // Split pending into two useful buckets:
        const beforePreapprovalStatuses = ['Pending_Approval', 'Pending_Director_Approval', 'Pending_Managerial_Approval', 'Pending_Committee_A_Recommendation', 'Pending_Committee_B_Review'];
        const afterPreapprovalBeforePostStatuses = ['Pending_Procurement_Approval', 'Accepting_Quotes', 'Scoring_In_Progress', 'Scoring_Complete', 'Pending_Review'];

        const pendingBeforePreapproval = await prisma.purchaseRequisition.count({ where: { ...where, status: { in: beforePreapprovalStatuses } } });
        const pendingAfterPreapproval = await prisma.purchaseRequisition.count({ where: { ...where, status: { in: afterPreapprovalBeforePostStatuses } } });

        // Completed requisitions (finalized)
        const completedStatuses = ['Fulfilled', 'Closed', 'Partially_Closed'];
        const completedCount = await prisma.purchaseRequisition.count({ where: { ...where, status: { in: completedStatuses } } });

        // Converted to PO: count of purchase orders created in the period
        const convertedToPO = await prisma.purchaseOrder.count({ where: { createdAt: { gte: start, lte: end } } });

        // Average approval time (days): find requisitions approved in period, find first APPROVAL audit and compute diff
        const approvedReqs = await prisma.purchaseRequisition.findMany({ where: { ...where, status: { in: approvedStatuses } }, select: { id: true, createdAt: true } });
        const approvedIds = approvedReqs.map(r => r.id);
        let avgApprovalDays: number | null = null;
        if (approvedIds.length > 0) {
            const approvalLogs = await prisma.auditLog.findMany({ where: { entity: 'Requisition', entityId: { in: approvedIds }, OR: [{ action: { contains: 'APPROV' } }, { action: 'PostApproved' }, { action: 'APPROVED' }] }, orderBy: { timestamp: 'asc' } });
            const firstByReq: Record<string, Date> = {};
            for (const log of approvalLogs) {
                if (!firstByReq[log.entityId]) firstByReq[log.entityId] = log.timestamp as Date;
            }
            const diffs: number[] = [];
            for (const r of approvedReqs) {
                const t = firstByReq[r.id];
                if (t && r.createdAt) {
                    diffs.push((t.getTime() - new Date(r.createdAt).getTime()) / (1000 * 60 * 60 * 24));
                }
            }
            if (diffs.length > 0) avgApprovalDays = diffs.reduce((a, b) => a + b, 0) / diffs.length;
        }

        // Average time to PO (days): for requisitions with purchaseOrders, compute diff from requisition.createdAt to earliest PO.createdAt
        const poRowsAll = await prisma.purchaseOrder.findMany({ where: { createdAt: { gte: start, lte: end } }, select: { requisitionId: true, createdAt: true } });
        const poRows = poRowsAll.filter(p => !!p.requisitionId);
        const earliestPoByReq: Record<string, Date> = {};
        for (const po of poRows) {
            const reqId = po.requisitionId as string;
            if (!earliestPoByReq[reqId]) earliestPoByReq[reqId] = po.createdAt as Date;
            else if ((po.createdAt as Date).getTime() < earliestPoByReq[reqId].getTime()) earliestPoByReq[reqId] = po.createdAt as Date;
        }
        const poDiffs: number[] = [];
        for (const req of await prisma.purchaseRequisition.findMany({ where: { id: { in: Object.keys(earliestPoByReq) } }, select: { id: true, createdAt: true } })) {
            const poDate = earliestPoByReq[req.id];
            if (poDate && req.createdAt) poDiffs.push((poDate.getTime() - new Date(req.createdAt).getTime()) / (1000 * 60 * 60 * 24));
        }
        const avgTimeToPODays = poDiffs.length ? poDiffs.reduce((a, b) => a + b, 0) / poDiffs.length : null;

        // Backlog: requisitions older than 30 days and not in final statuses
        const backlogThreshold = new Date(); backlogThreshold.setDate(backlogThreshold.getDate() - 30);
        const finalStatuses = [...approvedStatuses, ...rejectedStatuses];
        const backlogCount = await prisma.purchaseRequisition.count({ where: { createdAt: { lt: backlogThreshold }, NOT: { status: { in: finalStatuses } } } });

        // Top departments by requisition count in the period
        const groups = await prisma.purchaseRequisition.groupBy({ by: ['departmentId'], where, _count: { id: true }, orderBy: { _count: { id: 'desc' } }, take: 5 });
        const deptIds = groups.map(g => g.departmentId).filter(Boolean) as string[];
        const depts = await prisma.department.findMany({ where: { id: { in: deptIds } }, select: { id: true, name: true } });
        const topDepartments = groups.map(g => ({ departmentId: g.departmentId, departmentName: depts.find(d => d.id === g.departmentId)?.name || 'Unknown', count: g._count.id }));

        const result = {
            period: { start: start.toISOString(), end: end.toISOString() },
            totalRequisitions: total,
            approved,
            rejected,
            pending,
            pendingBeforePreapproval,
            pendingAfterPreapproval,
            completed: completedCount,
            convertedToPO,
            averageApprovalTimeDays: avgApprovalDays,
            averageTimeToPODays: avgTimeToPODays,
            backlogCount,
            topDepartments,
            generatedAt: new Date().toISOString()
        };

        if (format === 'csv') {
            const rows: string[][] = [
                ['metric', 'value'],
                ['period_start', result.period.start],
                ['period_end', result.period.end],
                ['totalRequisitions', String(result.totalRequisitions)],
                ['approved', String(result.approved)],
                ['rejected', String(result.rejected)],
                ['pending', String(result.pending)],
                ['pendingBeforePreapproval', String(result.pendingBeforePreapproval)],
                ['pendingAfterPreapproval', String(result.pendingAfterPreapproval)],
                ['completed', String(result.completed)],
                ['convertedToPO', String(result.convertedToPO)],
                ['averageApprovalTimeDays', result.averageApprovalTimeDays == null ? '' : String(result.averageApprovalTimeDays)],
                ['averageTimeToPODays', result.averageTimeToPODays == null ? '' : String(result.averageTimeToPODays)],
                ['backlogCount', String(result.backlogCount)],
            ];
            for (const td of result.topDepartments) rows.push([`topDept:${td.departmentName}`, String(td.count)]);
            return new NextResponse(toCsv(rows), { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="procurement-status.csv"' } });
        }

        return NextResponse.json(result);
    } catch (err) {
        console.error('Failed to compute status report', err);
        return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
}
