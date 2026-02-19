
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';

type GenerateRequest = {
    type: 'report' | 'minutes' | 'summary' | 'advice';
    requisitionId: string;
    model?: string;
    max_tokens?: number;
    prompt?: string;
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
    
    const baseConstraints = `
STRICT FORMATTING RULES:
1. NEVER use asterisks (*), hashtags (#), or backticks (\`) for formatting.
2. Use ALL CAPS for main section headers.
3. Use plain indentation or numeric lists (1., 2., 3.) for itemization.
4. Ensure the output is "Ready Made" for a professional physical print-out.
5. Do NOT include markdown code blocks or symbols.
6. Provide a formal, executive tone.
7. If data is missing for a section, simply omit the section or state "Not recorded".
`;

    if (type === 'minutes') {
        return `You are a formal committee secretary. Write meeting minutes for requisition ${context.id}.
${baseConstraints}
STRUCTURE:
- MEETING MINUTES: [REQUISITION TITLE]
- REFERENCE ID: [ID]
- DATE RECORDED: [CURRENT DATE]
- SUMMARY OF PROCURMENT ACTION
- DECISIONS AND RESOLUTIONS
- JUSTIFICATION FOR SELECTION
- ACTION ITEMS AND NEXT STEPS

Context:
${ctxJson}

${override ? `Additional User Request: ${override}` : ''}`;
    }

    if (type === 'report') {
        return `You are a Senior Procurement Auditor. Generate a formal Audit Lifecycle Report for requisition ${context.id}.
${baseConstraints}
STRUCTURE:
- AUDIT LIFECYCLE REPORT
- REQUISITION: [TITLE]
- EXECUTIVE SUMMARY
- LIFECYCLE CHRONOLOGY (List from Created to Current Status)
- VENDOR EVALUATION SUMMARY
- COMPLIANCE AND RISK ASSESSMENT
- AUDITOR RECOMMENDATIONS

Context:
${ctxJson}

${override ? `Additional User Request: ${override}` : ''}`;
    }

    if (type === 'summary') {
        return `Generate a concise Procurement Summary for requisition ${context.id}.
${baseConstraints}
STRUCTURE:
- PROCUREMENT SUMMARY
- ITEM OVERVIEW
- CURRENT STATUS AND APPROVAL STAGE
- REMAINING REQUIREMENTS

Context:
${ctxJson}

${override ? `Additional User Request: ${override}` : ''}`;
    }

    return `Provide expert Procurement Decision Advice for requisition ${context.id}.
${baseConstraints}
Identify risks, pros/cons, and identify if any standard policies seem challenged based on the history.

Context:
${ctxJson}

${override ? `Additional User Request: ${override}` : ''}`;
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
            body: JSON.stringify({ model, prompt, stream: false })
        });

        if (!res.ok) {
            const text = await res.text();
            return NextResponse.json({ error: 'Ollama error', details: text }, { status: 502 });
        }

        const data = await res.json();
        const rawResult = data.response || data.result || "";
        
        // Final sanity sanitization to remove any lingering markdown artifacts
        const sanitized = rawResult.replace(/[*#`]/g, '').trim();

        return NextResponse.json({ result: sanitized });
    } catch (err: any) {
        console.error('AI generate error:', err);
        return NextResponse.json({ error: 'Internal error', details: err.message || String(err) }, { status: 500 });
    }
}
