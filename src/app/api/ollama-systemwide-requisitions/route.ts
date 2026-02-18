
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * System-Wide AI Analyzer API.
 * EXCLUSIVELY uses the Materialized View for O(1) fetch performance.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const userPrompt = (body?.prompt || '').toString().trim();

        // 1. FETCH DATA FROM MATERIALIZED VIEW (Enterprise Scalability)
        let requisitions: any[] = [];
        try {
            const viewData = await prisma.$queryRaw<any[]>`
                SELECT data FROM "RequisitionSystemWideSummary"
            `;
            requisitions = viewData.map(row => row.data);
        } catch (e) {
            console.error('[AI_API] Fatal Error: Materialized view missing. Please Sync AI Data first.', e);
            return NextResponse.json({ error: 'System Data Not Synchronized. Please click "Sync AI Data" in the AI Assistant.' }, { status: 503 });
        }

        if (requisitions.length === 0) {
            return NextResponse.json({ result: "No data available in the system yet. Once requisitions are created and synced, I can analyze them." });
        }

        // 2. DETERMINISTIC PROMPT ENGINEERING (Anti-Hallucination)
        const contextJson = JSON.stringify(requisitions);
        const systemInstruction = `
            You are the "Nib Procurement Intelligent Auditor". 
            You are analyzing a dataset of ${requisitions.length} procurement records.

            STRICT CONSTRAINTS:
            1. Use ONLY the data provided in the <DATASET> block below.
            2. If a specific detail (like a price or vendor name) is not in the data, state: "Information not available in records".
            3. Do NOT make assumptions about future statuses or vendor intentions.
            4. Provide concise, professional summaries. 
            5. Use bullet points for lists of requisitions or issues.

            USER REQUEST: "${userPrompt}"

            <DATASET>
            ${contextJson}
            </DATASET>
        `;

        // 3. CALL OLLAMA
        const model = body?.model || process.env.OLLAMA_MODEL || 'llama3';
        const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';

        const res = await fetch(`${ollamaUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, prompt: systemInstruction, stream: false })
        });

        if (!res.ok) {
            return NextResponse.json({ error: 'AI Engine Offline' }, { status: 502 });
        }

        const data = await res.json();
        return NextResponse.json({ 
            result: data.response || data.result || "AI provided no answer.",
            metadata: { count: requisitions.length }
        });

    } catch (err) {
        console.error('AI_API error', err);
        return NextResponse.json({ error: 'Analysis Failed' }, { status: 500 });
    }
}

export async function GET() {
    // Standard GET returns the raw context for the UI preview
    try {
        const viewData = await prisma.$queryRaw<any[]>`SELECT data FROM "RequisitionSystemWideSummary"`;
        return NextResponse.json({ requisitions: viewData.map(r => r.data) });
    } catch (e) {
        return NextResponse.json({ requisitions: [], message: 'Materialized view not found.' });
    }
}
