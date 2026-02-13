import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';

// Returns a comprehensive, structured requisition lifecycle payload suitable
// for sending to Ollama (or other AI services).
export async function GET(request: Request, context: { params: any }) {
    try {
        const params = await context.params;
        const id = params?.id as string | undefined;
        if (!id || typeof id !== 'string') {
            return NextResponse.json({ error: 'Missing or invalid id' }, { status: 400 });
        }

        // Optional: detect caller to respect visibility rules (keep simple for AI use)
        let caller = null;
        try {
            const actor = await getActorFromToken(request as any);
            if (actor) caller = actor;
        } catch (e) {
            // ignore - unauthenticated allowed for internal AI calls
        }

        const requisition = await prisma.purchaseRequisition.findUnique({
            where: { id },
            include: {
                items: true,
                customQuestions: true,
                evaluationCriteria: { include: { financialCriteria: true, technicalCriteria: true } },
                financialCommitteeMembers: true,
                technicalCommitteeMembers: true,
                requester: true,
                department: true,
                quotations: { include: { items: true, scores: true, vendor: true } },
                purchaseOrders: { include: { vendor: true, invoices: true, receipts: true, items: true } },
                minutes: { include: { author: true, attendees: true } },
            }
        });

        if (!requisition) return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });

        // Fetch audit trail entries related to this requisition (ordered by time)
        const auditTrail = await prisma.auditLog.findMany({
            where: { entity: 'Requisition', entityId: id },
            orderBy: { timestamp: 'asc' }
        });

        // Assemble a structured payload optimized for AI consumption
        const payload = {
            id: requisition.id,
            reference: requisition.title || null,
            description: requisition.description || null,
            requester: {
                id: requisition.requester?.id || null,
                name: requisition.requester?.name || null,
                email: requisition.requester?.email || null,
            },
            department: requisition.department?.name || null,
            status: requisition.status,
            createdAt: requisition.createdAt,
            updatedAt: requisition.updatedAt,
            totalPrice: requisition.totalPrice,
            items: (requisition.items || []).map((it: any) => ({ id: it.id, name: it.name, description: it.description, quantity: it.quantity, unitPrice: it.unitPrice })),
            customQuestions: requisition.customQuestions || [],
            evaluationCriteria: requisition.evaluationCriteria || [],
            rfqSettings: requisition.rfqSettings || null,

            quotations: (requisition.quotations || []).map((q: any) => ({
                id: q.id,
                vendorId: q.vendorId,
                vendorName: q.vendorName || q.vendor?.name || null,
                totalPrice: q.totalPrice,
                status: q.status,
                items: q.items || [],
                scores: q.scores || [],
            })),

            purchaseOrders: (requisition.purchaseOrders || []).map((po: any) => ({
                id: po.id,
                vendorId: po.vendorId,
                vendorName: po.vendor?.name || null,
                status: po.status,
                total: po.total,
                createdAt: po.createdAt,
                invoices: po.invoices || [],
                receipts: po.receipts || [],
            })),

            minutes: (requisition.minutes || []).map((m: any) => ({
                id: m.id,
                author: m.author?.name || null,
                summary: m.summary || m.notes || null,
                documentUrl: m.documentUrl || null,
                attendees: (m.attendees || []).map((a: any) => ({ id: a.id, name: a.name })),
                createdAt: m.createdAt,
            })),

            auditTrail: (auditTrail || []).map(a => ({
                id: a.id,
                timestamp: a.timestamp,
                user: a.user,
                role: a.role,
                action: a.action,
                details: a.details,
            })),

            // Committee member lists (ids and names)
            financialCommitteeMembers: (requisition.financialCommitteeMembers || []).map((m: any) => ({ id: m.id, name: m.name, email: m.email })),
            technicalCommitteeMembers: (requisition.technicalCommitteeMembers || []).map((m: any) => ({ id: m.id, name: m.name, email: m.email })),
        };

        // Apply lightweight visibility filtering for vendor callers: mask other vendors' private docs
        try {
            const vendorId = (caller as any)?.vendorId;
            if (vendorId) {
                payload.purchaseOrders = (payload.purchaseOrders || []).map((po: any) => ({ ...po, invoices: po.vendorId === vendorId ? po.invoices : [] }));
                payload.quotations = (payload.quotations || []).map((q: any) => ({ ...q, items: q.vendorId === vendorId ? q.items : [], scores: q.vendorId === vendorId ? q.scores : [] }));
            }
        } catch (e) {
            // ignore
        }

        return NextResponse.json(payload);
    } catch (err: any) {
        console.error('Failed to build ollama requisition payload:', err);
        return NextResponse.json({ error: 'Internal error', details: err?.message || String(err) }, { status: 500 });
    }
}
