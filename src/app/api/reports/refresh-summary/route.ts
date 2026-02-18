
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken, isAdmin } from '@/lib/auth';

/**
 * SQL definition for the Materialized View.
 * Aggregates the entire requisition lifecycle into a single JSONB blob per row.
 * This is the 'Enterprise Standard' for high-performance AI data retrieval.
 */
const VIEW_NAME = '"RequisitionSystemWideSummary"';
const INDEX_NAME = '"idx_requisition_summary_id"';

const VIEW_SQL = `
CREATE MATERIALIZED VIEW IF NOT EXISTS ${VIEW_NAME} AS
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
    'requester', (SELECT jsonb_build_object('name', u.name, 'email', u.email) FROM "User" u WHERE u.id = r."requesterId"),
    'department', (SELECT jsonb_build_object('name', d.name) FROM "Department" d WHERE d.id = r."departmentId"),
    'items', (
      SELECT jsonb_agg(jsonb_build_object('name', i.name, 'quantity', i.quantity, 'unitPrice', i."unitPrice"))
      FROM "RequisitionItem" i WHERE i."requisitionId" = r.id
    ),
    'quotations', (
      SELECT jsonb_agg(jsonb_build_object(
        'vendor', q."vendorName",
        'total', q."totalPrice",
        'status', q.status
      ))
      FROM "Quotation" q WHERE q."requisitionId" = r.id
    ),
    'audit_summary', (
      SELECT jsonb_agg(jsonb_build_object('action', a.action, 'details', a.details, 'ts', a.timestamp))
      FROM "AuditLog" a WHERE a."entityId" = r.id AND a.entity = 'Requisition'
    )
  ) as data
FROM "PurchaseRequisition" r;
`;

const INDEX_SQL = `CREATE UNIQUE INDEX IF NOT EXISTS ${INDEX_NAME} ON ${VIEW_NAME} (id);`;

export async function POST(request: Request) {
    try {
        const actor = await getActorFromToken(request);
        const roles = (actor.roles || []).map((r: any) => (typeof r === 'string' ? r : r.name));
        
        if (!roles.includes('Admin') && !roles.includes('Procurement_Officer')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // 1. Ensure view and unique index exist (Index is required for CONCURRENTLY)
        await prisma.$executeRawUnsafe(VIEW_SQL);
        await prisma.$executeRawUnsafe(INDEX_SQL);

        // 2. Refresh the view. 
        // We use CONCURRENTLY so the AI API remains readable during the refresh.
        await prisma.$executeRawUnsafe(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${VIEW_NAME}`);

        return NextResponse.json({ 
            success: true, 
            message: 'AI Knowledge Base synchronized successfully (Concurrent Refresh).' 
        });
    } catch (err: any) {
        console.error('Refresh summary error:', err);
        // Fallback to non-concurrent if the index isn't ready or first-run
        if (err?.message?.includes('concurrently')) {
             await prisma.$executeRawUnsafe(`REFRESH MATERIALIZED VIEW ${VIEW_NAME}`);
             return NextResponse.json({ success: true, message: 'Synchronized (Standard Refresh).' });
        }
        return NextResponse.json({ 
            error: 'Failed to sync AI data', 
            details: err?.message 
        }, { status: 500 });
    }
}
