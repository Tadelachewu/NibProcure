'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken, isAdmin } from '@/lib/auth';

/**
 * SQL definition for the Materialized View.
 * Aggregates all relevant AI context data into a single pre-computed structure.
 */
const VIEW_SQL = `
CREATE MATERIALIZED VIEW IF NOT EXISTS "RequisitionSystemWideSummary" AS
SELECT
  r.id,
  jsonb_build_object(
    'id', r.id,
    'transactionId', r."transactionId",
    'title', r.title,
    'status', r.status,
    'urgency', r.urgency,
    'totalPrice', r."totalPrice",
    'createdAt', r."createdAt",
    'updatedAt', r."updatedAt",
    'justification', r.justification,
    'requester', (SELECT jsonb_build_object('id', u.id, 'name', u.name, 'email', u.email) FROM "User" u WHERE u.id = r."requesterId"),
    'department', (SELECT jsonb_build_object('id', d.id, 'name', d.name) FROM "Department" d WHERE d.id = r."departmentId"),
    'approver', (SELECT jsonb_build_object('id', u.id, 'name', u.name) FROM "User" u WHERE u.id = r."approverId"),
    'items', (
      SELECT jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'quantity', i.quantity, 'unitPrice', i."unitPrice", 'description', i.description))
      FROM "RequisitionItem" i WHERE i."requisitionId" = r.id
    ),
    'quotations', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', q.id,
        'vendorName', q."vendorName",
        'totalPrice', q."totalPrice",
        'status', q.status,
        'items', (SELECT jsonb_agg(jsonb_build_object('name', qi.name, 'quantity', qi.quantity, 'unitPrice', qi."unitPrice")) FROM "QuoteItem" qi WHERE qi."quotationId" = q.id)
      ))
      FROM "Quotation" q WHERE q."requisitionId" = r.id
    ),
    'minutes', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id,
        'decision', m.decision,
        'decisionBody', m."decisionBody",
        'justification', m.justification,
        'createdAt', m."createdAt"
      ))
      FROM "Minute" m WHERE m."requisitionId" = r.id
    )
  ) as data
FROM "PurchaseRequisition" r;
`;

const INDEX_SQL = `CREATE UNIQUE INDEX IF NOT EXISTS "idx_requisition_summary_id" ON "RequisitionSystemWideSummary" (id);`;

export async function POST(request: Request) {
    try {
        const actor = await getActorFromToken(request);
        if (!isAdmin(actor)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // Check if the materialized view exists in the PostgreSQL catalog
        const viewExists = await prisma.$queryRaw<any[]>`
            SELECT 1 FROM pg_matviews WHERE matviewname = 'RequisitionSystemWideSummary'
        `;

        if (viewExists.length > 0) {
            // Concurrent refresh isn't possible without a unique index, 
            // but we use standard refresh for simplicity here.
            await prisma.$executeRawUnsafe(`REFRESH MATERIALIZED VIEW "RequisitionSystemWideSummary"`);
        } else {
            // Create the view if it's the first time running
            await prisma.$executeRawUnsafe(VIEW_SQL);
            await prisma.$executeRawUnsafe(INDEX_SQL);
        }

        return NextResponse.json({ 
            success: true, 
            message: 'Materialized view updated successfully. AI analysis data is now synchronized.' 
        });
    } catch (err: any) {
        console.error('Refresh summary error:', err);
        return NextResponse.json({ 
            error: 'Failed to refresh summary data', 
            details: err?.message 
        }, { status: 500 });
    }
}
