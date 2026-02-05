

import { NextResponse } from 'next/server';
import { auditLogs, quotations, requisitions } from '@/lib/data-store';
import { users } from '@/lib/auth-store';
import { QuotationStatus } from '@/lib/types';

type StatusUpdate = {
  quoteId: string;
  status: QuotationStatus;
  rank?: 1 | 2 | 3;
}

export async function PATCH(request: Request, context: { params: any }) {
  const params = await context.params;
  console.log(`PATCH /api/quotations/status for requisition ${params?.id}`);
  try {
    const requisitionId = params?.id as string | undefined;
    if (!requisitionId || typeof requisitionId !== 'string') {
      console.error('PATCH /app/api/quotations/[id]/status missing or invalid id', { method: request.method, url: (request as any).url, params });
      return NextResponse.json({ error: 'Missing or invalid id' }, { status: 400 });
    }
    const body = await request.json();
    console.log('Request body:', body);
    const { updates, userId } = body as { updates: StatusUpdate[], userId: string };

    const user = users.find(u => u.id === userId);
    if (!user) {
      console.error('User not found for ID:', userId);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const requisition = requisitions.find(r => r.id === requisitionId);
    if (!requisition) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
    }

    let auditDetails = `Updated quote statuses for requisition ${requisitionId}: `;
    const updatedQuoteIds = new Set(updates.map(u => u.quoteId));

    // Update quotes based on the provided updates array
    updates.forEach(update => {
      const quote = quotations.find(q => q.id === update.quoteId);
      if (quote) {
        quote.status = update.status;
        quote.rank = update.rank;
        auditDetails += `Set ${quote.id} to ${quote.status} (Rank: ${quote.rank || 'N/A'}). `;
      }
    });

    // Reject all other quotes for this requisition that weren't in the update list
    quotations.forEach(q => {
      if (q.requisitionId === requisitionId && !updatedQuoteIds.has(q.id)) {
        q.status = 'Rejected';
        q.rank = undefined;
        auditDetails += `Rejected quote ${q.id}. `;
      }
    });

    // Update requisition status if an award was made
    if (updates.some(u => u.status === 'Awarded')) {
      requisition.status = 'RFQ In Progress';
      requisition.updatedAt = new Date();
    }

    const auditLogEntry = {
      id: `log-${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
      user: user.name,
      role: user.role,
      action: 'UPDATE_QUOTES_STATUS',
      entity: 'Requisition',
      entityId: requisitionId,
      details: auditDetails,
    };
    auditLogs.unshift(auditLogEntry);
    console.log('Added audit log:', auditLogEntry);

    return NextResponse.json(quotations.filter(q => q.requisitionId === requisitionId));
  } catch (error) {
    console.error('Failed to update quotation statuses:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
