
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';
import { RequisitionStatus } from '@/lib/types';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const actor = await getActorFromToken(request);
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Basic authorization: for now, let's assume any authenticated user can trigger this.
    // In a real app, you'd check for a specific role like 'Procurement_Officer' or a system role.

    const requisitionId = params.id;
    const body = await request.json();
    const { status } = body as { status: RequisitionStatus };

    const validStatusesToSet: RequisitionStatus[] = ['Ready_for_Opening'];
    if (!validStatusesToSet.includes(status)) {
      return NextResponse.json({ error: 'Invalid or unsupported status for this endpoint.' }, { status: 400 });
    }
    
    const requisition = await prisma.purchaseRequisition.findUnique({
      where: { id: requisitionId },
    });

    if (!requisition) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
    }

    if (requisition.status !== 'Accepting_Quotes') {
        // To prevent race conditions or invalid state transitions, we only act if the status is as expected.
        return NextResponse.json({ message: 'Requisition not in a state to be updated.', currentStatus: requisition.status }, { status: 200 });
    }

    const updatedRequisition = await prisma.purchaseRequisition.update({
      where: { id: requisitionId },
      data: { status },
    });
    
    await prisma.auditLog.create({
        data: {
            user: { connect: { id: actor.id } },
            timestamp: new Date(),
            action: 'AUTO_UPDATE_STATUS',
            entity: 'Requisition',
            entityId: requisitionId,
            details: `Requisition status automatically updated from "Accepting_Quotes" to "${status.replace(/_/g, ' ')}" after deadline passed.`,
            transactionId: requisition.transactionId,
        }
    });

    return NextResponse.json(updatedRequisition);
  } catch (error) {
    console.error('Failed to update requisition status:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}

    