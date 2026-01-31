"use server";

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken, isAdmin } from '@/lib/auth';

function severityFromScore(score: number) {
    if (score >= 75) return 'High';
    if (score >= 40) return 'Medium';
    return 'Low';
}

function toCsv(rows: string[][]) {
    return rows.map(r => r.map(cell => {
        if (cell == null) return '';
        const s = String(cell).replace(/"/g, '""');
        return `"${s}"`;
    }).join(',')).join('\n');
}

async function computeVendorDependencyRisk(start: Date, end: Date) {
    // compute per-department vendor spend share for basic dependency detection
    const poRows = await prisma.purchaseOrder.findMany({ where: { createdAt: { gte: start, lte: end } }, select: { vendorId: true, requisition: { select: { departmentId: true } }, totalAmount: true } });
    const deptVendorSpend: Record<string, Record<string, number>> = {};
    for (const p of poRows) {
        const dept = p.requisition?.departmentId || 'unknown';
        deptVendorSpend[dept] = deptVendorSpend[dept] || {};
        deptVendorSpend[dept][p.vendorId] = (deptVendorSpend[dept][p.vendorId] || 0) + (p.totalAmount || 0);
    }
    return deptVendorSpend;
}

export async function GET(request: Request) {
    try {
        const actor = await getActorFromToken(request);
        if (!isAdmin(actor) && !(actor.roles || []).includes('Procurement_Officer')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const url = new URL(request.url);
        const startParam = url.searchParams.get('start');
        const endParam = url.searchParams.get('end');
        const format = url.searchParams.get('format') || 'json';

        const end = endParam ? new Date(endParam) : new Date();
        const start = startParam ? new Date(startParam) : new Date(Date.now() - 1000 * 60 * 60 * 24 * 90); // default 90 days

        // Fetch requisitions in period
        const requisitions = await prisma.purchaseRequisition.findMany({
            where: { createdAt: { gte: start, lte: end } },
            include: {
                requester: { select: { id: true, name: true } },
                department: { select: { id: true, name: true } },
                quotations: { select: { vendorId: true, vendorName: true } },
                purchaseOrders: { select: { id: true, vendorId: true, totalAmount: true, status: true, createdAt: true } }
            }
        });

        // Precompute vendor dependency map
        const deptVendorSpend = await computeVendorDependencyRisk(new Date(Date.now() - 1000 * 60 * 60 * 24 * 365), end); // 12 months

        const exceptions: any[] = [];

        for (const r of requisitions) {
            const issues: any[] = [];

            // Policy / approval threshold violation: rudimentary check - if approver is same as requester
            if (r.approverId && r.approverId === r.requesterId) {
                issues.push({ type: 'ConflictOfInterest', desc: 'Approver is same as requester', weight: 30 });
            }

            // Single-source / non-competitive: only one allowed vendor or only one quotation
            if (Array.isArray(r.allowedVendorIds) && r.allowedVendorIds.length === 1) {
                issues.push({ type: 'SingleSource', desc: 'Allowed vendor list contains single vendor', weight: 25 });
            }
            if (Array.isArray(r.quotations) && r.quotations.length <= 1) {
                issues.push({ type: 'NonCompetitive', desc: 'One or zero quotations received', weight: 20 });
            }

            // SLA breaches / process delays: scoringDeadline / awardResponseDeadline passed while in RFQ states
            const now = new Date();
            if (r.scoringDeadline && new Date(r.scoringDeadline) < now && r.status?.includes('Scoring')) {
                issues.push({ type: 'ScoringDeadlineMissed', desc: 'Scoring deadline missed', weight: 20 });
            }
            if (r.awardResponseDeadline && new Date(r.awardResponseDeadline) < now && r.status === 'Accepting_Quotes') {
                issues.push({ type: 'AwardResponseMissed', desc: 'Award response deadline passed', weight: 20 });
            }

            // Budget overruns: totalPrice greater than cpoAmount if cpoAmount present
            if (r.cpoAmount != null && r.totalPrice != null && r.totalPrice > r.cpoAmount) {
                issues.push({ type: 'BudgetOverrun', desc: 'Requisition total exceeds CPO amount', weight: 30 });
            }

            // Vendor dependency: if department spend heavily concentrated to a vendor present in this requisition's POs
            const poVendors = (r.purchaseOrders || []).map(p => p.vendorId).filter(Boolean);
            for (const vId of poVendors) {
                const deptId = r.departmentId || 'unknown';
                const vendorSpend = deptVendorSpend[deptId]?.[vId] || 0;
                const totalDeptSpend = Object.values(deptVendorSpend[deptId] || {}).reduce((a, b) => a + b, 0) || 0;
                const share = totalDeptSpend ? (vendorSpend / totalDeptSpend) : 0;
                if (share > 0.5) {
                    issues.push({ type: 'VendorDependency', desc: `Vendor accounts for ${(share * 100).toFixed(1)}% of dept spend`, weight: 30 });
                }
            }

            // Fraud indicator: suspicious quick approvals (approved within 1 hour of creation)
            const firstPo = r.purchaseOrders && r.purchaseOrders.length ? r.purchaseOrders[0] : null;
            if (firstPo && r.createdAt) {
                const diffMs = new Date(firstPo.createdAt).getTime() - new Date(r.createdAt).getTime();
                if (diffMs >= 0 && diffMs < 1000 * 60 * 60) {
                    issues.push({ type: 'RapidPO', desc: 'PO created within 1 hour of requisition', weight: 25 });
                }
            }

            if (issues.length === 0) continue;

            // risk score is normalized to 0-100 from issue weights
            const rawScore = issues.reduce((s, it) => s + (it.weight || 0), 0);
            const score = Math.min(100, rawScore);
            const severity = severityFromScore(score);

            // Check stored status in Setting
            const key = `exception:Requisition:${r.id}`;
            const setting = await prisma.setting.findUnique({ where: { key } }).catch(() => null);
            const persisted = setting ? setting.value : null;

            // fetch audit timeline for the requisition
            const timeline = await prisma.auditLog.findMany({ where: { entity: 'Requisition', entityId: r.id }, include: { user: { select: { id: true, name: true } } }, orderBy: { timestamp: 'asc' }, take: 500 });

            exceptions.push({
                id: `${r.id}`,
                entity: 'Requisition',
                referenceId: r.id,
                transactionId: r.transactionId,
                title: r.title,
                department: r.department?.name || null,
                requester: r.requester?.name || null,
                issues,
                riskScore: score,
                severity,
                status: persisted?.status || 'open',
                justification: persisted?.justification || null,
                timeline: timeline.map(t => ({ id: t.id, timestamp: t.timestamp, action: t.action, user: t.user?.name, details: t.details })),
            });
        }

        // sort by riskScore desc
        exceptions.sort((a, b) => b.riskScore - a.riskScore);

        if (format === 'csv') {
            const rows: string[][] = [['entity', 'referenceId', 'transactionId', 'title', 'department', 'requester', 'severity', 'riskScore', 'status', 'issues']];
            for (const e of exceptions) {
                rows.push([e.entity, e.referenceId, e.transactionId || '', e.title || '', e.department || '', e.requester || '', e.severity, String(e.riskScore), e.status, e.issues.map((i: any) => i.type).join('|')]);
            }
            return new NextResponse(toCsv(rows), { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="exceptions.csv"' } });
        }

        return NextResponse.json({ period: { start: start.toISOString(), end: end.toISOString() }, exceptions });
    } catch (err) {
        console.error('Failed to compute exceptions', err);
        return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const actor = await getActorFromToken(request);
        const body = await request.json();
        const { entity, referenceId, status, justification } = body;
        if (!entity || !referenceId || !status) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

        const key = `exception:${entity}:${referenceId}`;
        const value = { status, justification, updatedBy: actor.id, updatedAt: new Date().toISOString() };
        await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });

        // create audit log entry
        await prisma.auditLog.create({ data: { userId: actor.id, action: 'EXCEPTION_STATUS_UPDATED', entity, entityId: referenceId, details: JSON.stringify(value) } });

        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error('Failed to update exception status', err);
        return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
}
