import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

console.log('[app-api] ollama-systemwide-requisitions route loaded with performance optimization');

/**
 * GET: Returns full detailed system-wide requisitions dataset.
 * Uses Materialized View for high performance, falls back to raw query if view is missing.
 */
export async function GET() {
    try {
        let requisitions: any[] = [];
        
        try {
            // Attempt to fetch from high-performance pre-computed view
            const viewData = await prisma.$queryRaw<any[]>`
                SELECT data FROM "RequisitionSystemWideSummary" ORDER BY (data->>'createdAt') DESC
            `;
            requisitions = viewData.map(row => row.data);
        } catch (e) {
            console.warn('[AI_API] Materialized view not found or accessible, falling back to standard query.', e);
            // FALLBACK: Standard joined query (Zero Regression)
            const rawData = await prisma.purchaseRequisition.findMany({
                include: {
                    requester: true,
                    department: true,
                    approver: true,
                    quotations: { include: { items: true, scores: true } },
                    items: true,
                    minutes: { include: { author: true, attendees: true, signatures: true } },
                    financialCommitteeMembers: true,
                    technicalCommitteeMembers: true,
                },
                orderBy: { createdAt: 'desc' },
            });
            requisitions = rawData;
        }

        return NextResponse.json({ requisitions });
    } catch (err) {
        console.error('ollama-systemwide-requisitions.GET error', err);
        return NextResponse.json({ error: 'Failed to fetch requisitions' }, { status: 500 });
    }
}

/**
 * POST: Accepts a simple user prompt and returns AI analysis.
 * Performance is optimized using the RequisitionSystemWideSummary materialized view.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const userPrompt = (body?.prompt || '').toString().trim();

        let requisitions: any[] = [];
        try {
            // Attempt high-performance fetch
            const viewData = await prisma.$queryRaw<any[]>`
                SELECT data FROM "RequisitionSystemWideSummary" ORDER BY (data->>'createdAt') DESC
            `;
            requisitions = viewData.map(row => row.data);
        } catch (e) {
            console.warn('[AI_API] Materialized view fetch failed in POST, falling back.', e);
            const rawData = await prisma.purchaseRequisition.findMany({
                include: {
                    requester: true,
                    department: true,
                    approver: true,
                    quotations: { include: { items: true, scores: true } },
                    items: true,
                    minutes: { include: { author: true, attendees: true, signatures: true } },
                    financialCommitteeMembers: true,
                    technicalCommitteeMembers: true,
                },
                orderBy: { createdAt: 'desc' },
            });
            requisitions = rawData;
        }

        const simpleIntro = `You are Ollama, an assistant for the procurement system. The user is a non-technical person. Explain simply and clearly.`;
        const userInstruction = userPrompt
            ? `User asked: "${userPrompt}".`
            : 'User has not provided a specific question — summarize the most important requisitions and actionable items.';

        const contextJson = JSON.stringify(requisitions, null, 2);
        const ollamaSystemWidePrompt = [
            simpleIntro,
            userInstruction,
            'IMPORTANT: Use ONLY the DATA section below to answer. Do NOT use external knowledge or make assumptions. If the data does not contain the information needed, say so clearly (e.g. "Information not available in provided data").',
            'DATA (JSON):',
            contextJson,
            '\nInstructions for the answer: Provide a human-friendly, plain-language response tailored to the user prompt above. Keep the answer factual and strictly based on the provided data. If appropriate, include clear suggested next steps. Avoid technical jargon; explain any abbreviations. Return a concise human-ready text.'
        ].join('\n\n');

        try {
            const model = (body?.model) || process.env.OLLAMA_MODEL || 'llama3';
            const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
            const res = await fetch(`${ollamaUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model, prompt: ollamaSystemWidePrompt })
            });

            if (!res.ok) {
                const txt = await res.text().catch(() => '');
                console.error('Ollama returned error:', txt);
                return NextResponse.json({ requisitions, prompt: ollamaSystemWidePrompt, metadata: { count: requisitions.length }, error: 'Ollama error', details: txt }, { status: 502 });
            }

            const raw = await res.text();
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

            assembled = assembled.trim();

            return NextResponse.json({ 
                requisitions, 
                prompt: ollamaSystemWidePrompt, 
                result: assembled, 
                metadata: { count: requisitions.length } 
            });
        } catch (err) {
            console.error('Failed to call Ollama for system-wide prompt:', err);
            return NextResponse.json({ 
                requisitions, 
                prompt: ollamaSystemWidePrompt, 
                metadata: { count: requisitions.length }, 
                error: 'Ollama call failed' 
            }, { status: 500 });
        }
    } catch (err) {
        console.error('ollama-systemwide-requisitions.POST error', err);
        return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
    }
}
