import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';

type GenerateRequest = {
    type: 'report' | 'minutes' | 'advice';
    requisitionId: string;
    model?: string;
    max_tokens?: number;
    prompt?: string;
    filename?: string;
}

async function fetchRequisitionContext(id: string) {
    return prisma.purchaseRequisition.findUnique({
        where: { id },
        include: {
            items: true,
            requester: true,
            department: true,
            quotations: { include: { items: true } },
            purchaseOrders: { select: { id: true, vendor: { select: { name: true } } } },
            minutes: { include: { author: true, attendees: true } },
        }
    });
}

function buildPrompt(type: string, context: any, override?: string) {
    const ctxJson = JSON.stringify(context, null, 2);
    if (override) return override;

    if (type === 'minutes') {
        return `You are an assistant that writes formal procurement minutes from structured requisition context.\n\nRequisition Context:\n${ctxJson}\n\nProduce concise minutes with: Requisition Reference, Purpose, Summary of Actions, Decisions Made, Justifications, Outstanding Items/Next Steps, Date and Status Summary.`;
    }
    if (type === 'report') {
        return `You are an assistant that generates an audit-ready procurement report.\n\nRequisition Context:\n${ctxJson}\n\nProduce a professional report summarizing key metrics, timelines, approvals, vendors, risks, and recommendations. Include a short executive summary followed by structured sections.`;
    }
    return `You are an assistant that provides decision analysis.\n\nRequisition Context:\n${ctxJson}\n\nBased on the facts above, identify why decisions in the approval history may have been taken, list pros/cons, and highlight risks. Clearly separate facts from advisory opinion.`;
}

export async function POST(request: Request) {
    try {
        const actor = await getActorFromToken(request);
        if (!actor) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json() as GenerateRequest;
        if (!body || !body.requisitionId || !body.type) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const requisition = await fetchRequisitionContext(body.requisitionId);
        if (!requisition) return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });

        const structured = {
            id: requisition.id,
            reference: requisition.title,
            requester: { id: requisition.requester?.id || null, name: requisition.requester?.name || null },
            department: requisition.department?.name || null,
            status: requisition.status,
            createdAt: requisition.createdAt,
            totalPrice: requisition.totalPrice,
            items: requisition.items?.map((it: any) => ({ name: it.name, quantity: it.quantity, unitPrice: it.unitPrice, description: it.description })) || [],
            quotations: requisition.quotations?.map((q: any) => ({ vendorName: q.vendorName, totalPrice: q.totalPrice, status: q.status })) || [],
            purchaseOrders: requisition.purchaseOrders || [],
            minutes: requisition.minutes?.map((m: any) => ({ author: m.author?.name || null, summary: m.summary || m.notes || null, createdAt: m.createdAt })) || [],
        };

        const prompt = buildPrompt(body.type, structured, body.prompt);
        const model = body.model || process.env.OLLAMA_MODEL || 'llama3';
        const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';

        const res = await fetch(`${ollamaUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, prompt })
        });

        if (!res.ok) {
            const text = await res.text();
            return NextResponse.json({ error: 'Ollama error', details: text }, { status: 502 });
        }

        const raw = await res.text();
        // Assemble possible NDJSON
        const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        let assembled = '';
        if (lines.length > 1) {
            for (const line of lines) {
                try {
                    const obj = JSON.parse(line);
                    if (typeof obj.response === 'string') assembled += obj.response;
                    else if (typeof obj.result === 'string') assembled += obj.result;
                } catch (e) {
                    assembled += line + '\n';
                }
            }
        } else {
            try {
                const parsed = JSON.parse(raw);
                if (typeof parsed.response === 'string') assembled = parsed.response;
                else if (typeof parsed.result === 'string') assembled = parsed.result;
                else if (Array.isArray(parsed.choices)) assembled = parsed.choices.map((c: any) => c.text || c.message?.content || '').join('');
                else assembled = raw;
            } catch (e) {
                assembled = raw;
            }
        }

        const filename = body.filename || `requisition-${body.requisitionId}-${body.type}.html`;

        // Build printable HTML wrapper
        // Sanitize generated text: remove problematic special chars that affect printing or parsing
        const sanitize = (s: string) => {
            if (!s) return '';
            // remove common special characters like *, +, [, ], {, }, <, >, `, |, \\
            const stripped = s.replace(/[\*\+\[\]\{\}\<\>\`\|\\]/g, '');
            // normalize newlines and collapse multiple spaces
            return stripped.replace(/\r\n|\r/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/ {2,}/g, ' ');
        };

        const safeContent = sanitize(assembled || '');
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>${filename}</title><style>body{font-family:Arial,Helvetica,sans-serif;line-height:1.4;padding:24px;color:#111}pre{white-space:pre-wrap;word-wrap:break-word;font-family:inherit}</style></head><body><h1>Requisition AI ${body.type}</h1><h2>Reference: ${structured.reference || ''}</h2><pre>${safeContent}</pre></body></html>`;

        return new NextResponse(html, {
            status: 200,
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}"`,
            }
        });
    } catch (err: any) {
        console.error('AI download error:', err);
        return NextResponse.json({ error: 'Internal error', details: err.message || String(err) }, { status: 500 });
    }
}
