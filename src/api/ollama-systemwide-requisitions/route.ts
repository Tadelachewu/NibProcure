
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Legacy path fallback - Synchronized with App Router implementation
 * to ensure consistency across all calling methods.
 */
export async function GET() {
    try {
        const viewData = await prisma.$queryRaw<any[]>`SELECT data FROM "RequisitionSystemWideSummary"`;
        return NextResponse.json({ requisitions: viewData.map(r => r.data) });
    } catch (err) {
        return NextResponse.json({ error: 'Materialized view not ready.' }, { status: 503 });
    }
}

export async function POST(request: Request) {
    // Redirect logic to main app route implementation
    const appRoute = await import('../../app/api/ollama-systemwide-requisitions/route');
    return appRoute.POST(request);
}
