
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken, isAdmin } from '@/lib/auth';

/**
 * Enterprise analytical snapshot logic.
 * Aggregates highly normalized data into a flattened JSONB schema for AI and Reporting.
 */
const VIEW_NAME = '"RequisitionSystemWideSummary"';
const INDEX_NAME = '"idx_requisition_summary_id"';

const REFRESH_SQL = `
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
    'item_count', (SELECT count(*) FROM "RequisitionItem" i WHERE i."requisitionId" = r.id),
    'items', (
      SELECT jsonb_agg(jsonb_build_object('name', i.name, 'quantity', i.quantity, 'unitPrice', i."unitPrice"))
      FROM "RequisitionItem" i WHERE i."requisitionId" = r.id
    ),
    'quotations', (
      SELECT jsonb_agg(jsonb_build_object(
        'vendor', q."vendorName",
        'total', q."totalPrice",
        'status', q.status,
        'submittedAt', q."createdAt"
      ))
      FROM "Quotation" q WHERE q."requisitionId" = r.id
    ),
    'last_audit_action', (
      SELECT action FROM "AuditLog" a 
      WHERE a."entityId" = r.id AND a.entity = 'Requisition' 
      ORDER BY a.timestamp DESC LIMIT 1
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

        // 1. Bootstrap view and indices
        await prisma.$executeRawUnsafe(REFRESH_SQL);
        await prisma.$executeRawUnsafe(INDEX_SQL);

        // 2. Perform concurrent refresh (Zero downtime for AI reads)
        try {
            await prisma.$executeRawUnsafe(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${VIEW_NAME}`);
        } catch (e) {
            // Concurrent refresh fails if it's the very first populate
            await prisma.$executeRawUnsafe(`REFRESH MATERIALIZED VIEW ${VIEW_NAME}`);
        }

        return NextResponse.json({ 
            success: true, 
            message: 'System analytical snapshot synchronized successfully.' 
        });
    } catch (err: any) {
        console.error('[REFRESH_VIEW] Failed:', err);
        return NextResponse.json({ 
            error: 'Failed to synchronize AI data', 
            details: err?.message 
        }, { status: 500 });
    }
}
