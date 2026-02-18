
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';

/**
 * Enterprise analytics refresh endpoint.
 * 
 * DESIGN CONSTRAINTS:
 * 1. Does NOT define the view (separation of concerns: DB setup happens in seed/migration).
 * 2. Uses CONCURRENTLY to ensure ZERO DOWNTIME for AI analysis.
 * 3. Atomic transition between old and new state.
 */
export async function POST(request: Request) {
    try {
        const actor = await getActorFromToken(request);
        const roles = (actor.roles || []).map((r: any) => (typeof r === 'string' ? r : r.name));
        
        if (!roles.includes('Admin') && !roles.includes('Procurement_Officer')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const VIEW_NAME = '"RequisitionSystemWideSummary"';

        console.log(`[REFRESH_AI] Start concurrent refresh for ${VIEW_NAME}`);

        try {
            // Attempt concurrent refresh (requires unique index + previous population)
            await prisma.$executeRawUnsafe(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${VIEW_NAME}`);
        } catch (e) {
            console.warn('[REFRESH_AI] Concurrent refresh failed (likely first run). Falling back to standard refresh.');
            // Regular refresh for first population or if index is missing
            await prisma.$executeRawUnsafe(`REFRESH MATERIALIZED VIEW ${VIEW_NAME}`);
        }

        return NextResponse.json({ 
            success: true, 
            message: 'System analytical snapshot synchronized successfully.' 
        });
    } catch (err: any) {
        console.error('[REFRESH_VIEW] Final Failure:', err);
        return NextResponse.json({ 
            error: 'Failed to synchronize AI data', 
            details: err?.message || 'The database was unable to refresh the analytical snapshot.' 
        }, { status: 500 });
    }
}
