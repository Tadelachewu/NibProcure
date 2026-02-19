
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Enterprise System-Wide AI Auditor API.
 * 
 * PERFORMANCE ARCHITECTURE:
 * 1. Query strictly targeting the pre-computed "RequisitionSystemWideSummary" Materialized View.
 * 2. Bypasses all joins and ORM overhead for million-scale feasibility.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const userPrompt = (body?.prompt || '').toString().trim();

        // 1. FAST SCAN FROM ANALYTICAL VIEW
        let requisitions: any[] = [];
        try {
            const viewData = await prisma.$queryRaw<any[]>`
                SELECT data FROM "RequisitionSystemWideSummary"
            `;
            requisitions = viewData.map(row => row.data);
        } catch (e) {
            console.error('[AI_API] Dependency Failure: Materialized view not ready.', e);
            return NextResponse.json({ 
                error: 'System Data Not Synchronized', 
                details: 'The pre-computed AI brain has not been initialized. Please click "Sync AI Data" in the AI Assistant.' 
            }, { status: 503 });
        }

        if (requisitions.length === 0) {
            return NextResponse.json({ result: "The system snapshot is empty. Ensure requisitions exist and click 'Sync AI Data'." });
        }

        // 2. HARDENED ENTERPRISE PROMPT (No Hallucination, No Markdown)
        const contextJson = JSON.stringify(requisitions);
        const systemInstruction = `
            You are the "Nib Procurement Intelligent Auditor". 
            You are performing a comprehensive analysis of ${requisitions.length} procurement records.

            STRICT FORMATTING RULES:
            1. NEVER use asterisks (*), hashtags (#), or backticks (\`) for formatting.
            2. Use ALL CAPS for main section headers.
            3. Use plain indentation or numeric lists (1., 2., 3.) for itemization.
            4. Ensure the output is "Ready Made" for a professional physical print-out.
            5. Do NOT include markdown code blocks or symbols.
            6. Provide a formal, executive tone.
            7. If data is missing for a section, reply: "Record not found in the current system snapshot."

            REPORT STRUCTURE:
            - SYSTEM-WIDE AUDIT SUMMARY
            - ANALYSIS DATE: ${new Date().toLocaleDateString()}
            - EXECUTIVE OVERVIEW
            - DEPARTMENTAL PERFORMANCE BREAKDOWN
            - REJECTION AND EXCEPTION TRENDS
            - CRITICAL PENDING ACTIONS
            - AUDITOR RECOMMENDATIONS

            USER REQUEST: "${userPrompt || 'Summarize critical pending actions across all departments.'}"

            <DATASET>
            ${contextJson}
            </DATASET>
        `;

        // 3. EXECUTE LLM ANALYSIS
        const model = body?.model || process.env.OLLAMA_MODEL || 'llama3';
        const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';

        const res = await fetch(`${ollamaUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, prompt: systemInstruction, stream: false })
        });

        if (!res.ok) {
            return NextResponse.json({ error: 'AI Engine Unavailable' }, { status: 502 });
        }

        const data = await res.json();
        const rawResult = data.response || data.result || "No analysis provided by AI.";
        
        // Final sanity sanitization to remove any lingering markdown artifacts
        const sanitized = rawResult.replace(/[*#`]/g, '').trim();

        return NextResponse.json({ 
            result: sanitized,
            metadata: { 
                count: requisitions.length,
                timestamp: new Date().toISOString()
            }
        });

    } catch (err) {
        console.error('[AI_API] Critical Error:', err);
        return NextResponse.json({ error: 'System-wide analysis failed.' }, { status: 500 });
    }
}

/**
 * Diagnostic endpoint for UI data preview.
 */
export async function GET() {
    try {
        const viewData = await prisma.$queryRaw<any[]>`SELECT data FROM "RequisitionSystemWideSummary"`;
        return NextResponse.json({ requisitions: viewData.map(r => r.data) });
    } catch (e) {
        return NextResponse.json({ requisitions: [], error: 'View not initialized.' });
    }
}
