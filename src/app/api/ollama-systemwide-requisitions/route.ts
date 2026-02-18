
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * System-Wide AI Auditor API.
 * 
 * ARCHITECTURE:
 * 1. This API does NOT query normalized tables.
 * 2. It reads from the "RequisitionSystemWideSummary" Materialized View.
 * 3. This ensures O(1) fetch performance regardless of database complexity.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const userPrompt = (body?.prompt || '').toString().trim();

        // 1. ATOMIC DATA FETCH FROM ANALYTICAL SNAPSHOT
        let requisitions: any[] = [];
        try {
            const viewData = await prisma.$queryRaw<any[]>`
                SELECT data FROM "RequisitionSystemWideSummary"
            `;
            requisitions = viewData.map(row => row.data);
        } catch (e) {
            console.error('[AI_API] Error: Materialized view missing or unreadable.', e);
            return NextResponse.json({ 
                error: 'System Data Not Synchronized', 
                details: 'Please click "Sync AI Data" in the AI Assistant to initialize the analytical snapshot.' 
            }, { status: 503 });
        }

        if (requisitions.length === 0) {
            return NextResponse.json({ result: "The system snapshot is empty. Ensure requisitions exist and click 'Sync AI Data'." });
        }

        // 2. ENTERPRISE PROMPT ENGINEERING (Anti-Hallucination)
        const contextJson = JSON.stringify(requisitions);
        const systemInstruction = `
            You are the "Nib Procurement Intelligent Auditor". 
            You are analyzing a system-wide dataset of ${requisitions.length} procurement lifecycles.

            CORE OPERATING CONSTRAINTS:
            - FACTUALITY: Use ONLY data provided in the <DATASET> block.
            - TRANSPARENCY: If information is missing (e.g. no quotes for a specific ID), say "Information not available in system records".
            - NO ASSUMPTIONS: Do not guess future dates or statuses.
            - TONE: Professional, concise, and audit-focused.
            - FORMATTING: Use bullet points for lists and bold headers for sections.

            USER REQUEST: "${userPrompt || 'Provide a summary of high-value pending actions.'}"

            <DATASET>
            ${contextJson}
            </DATASET>
        `;

        // 3. CALL LLM ENGINE
        const model = body?.model || process.env.OLLAMA_MODEL || 'llama3';
        const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';

        const res = await fetch(`${ollamaUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, prompt: systemInstruction, stream: false })
        });

        if (!res.ok) {
            return NextResponse.json({ error: 'AI Analysis Engine is currently offline.' }, { status: 502 });
        }

        const data = await res.json();
        return NextResponse.json({ 
            result: data.response || data.result || "AI provided no answer.",
            metadata: { 
                count: requisitions.length,
                generatedAt: new Date().toISOString()
            }
        });

    } catch (err) {
        console.error('[AI_API] Global Failure:', err);
        return NextResponse.json({ error: 'Failed to process AI analysis.' }, { status: 500 });
    }
}

export async function GET() {
    try {
        const viewData = await prisma.$queryRaw<any[]>`SELECT data FROM "RequisitionSystemWideSummary"`;
        return NextResponse.json({ requisitions: viewData.map(r => r.data) });
    } catch (e) {
        return NextResponse.json({ requisitions: [], error: 'Materialized view not found.' });
    }
}
