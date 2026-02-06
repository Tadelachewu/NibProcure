

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken, isActorAuthorizedForRequisition } from '@/lib/auth';


export async function POST(
  request: Request,
  context: { params: any }
) {
  const params = await context.params;
  console.log(`POST /api/requisitions/${params.id}/reset-award`);
  try {
    const requisitionId = params.id as string;
    const body = await request.json();
    console.log('Request body:', body);
    const toStatus = body?.toStatus as string | undefined;

    // Authenticate actor
    let actor;
    try {
      actor = await getActorFromToken(request);
    } catch (e) {
      console.warn('[RESET-AWARD] Authorization failed while extracting actor from token:', e);
      return NextResponse.json({ error: 'Unauthorized: missing or invalid token' }, { status: 401 });
    }

    // Ensure actor is allowed to perform RFQ actions on this requisition
    const allowed = await isActorAuthorizedForRequisition(actor, requisitionId);
    if (!allowed) {
      console.error(`[RESET-AWARD] User ${actor.id} is not authorized to reset award for requisition ${requisitionId}.`);
      return NextResponse.json({ error: 'Forbidden: you must be an assigned RFQ sender or in the configured RFQ sender list to perform this action.' }, { status: 403 });
    }

    const requisition = await prisma.purchaseRequisition.findUnique({ where: { id: requisitionId } });
    if (!requisition) {
      console.error('Requisition not found for ID:', requisitionId);
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
    }

    // Reset related quotations to 'Submitted' so vendors can re-submit if needed
    const updateQuotes = await prisma.quotation.updateMany({ where: { requisitionId }, data: { status: 'Submitted' } });
    console.log(`Reset ${updateQuotes.count} quotations to 'Submitted'.`);

    // Map incoming toStatus to canonical status values (fallback to PreApproved)
    let newReqStatus: string = 'PreApproved';
    if (toStatus === 'ready_for_rfq') newReqStatus = 'PreApproved';
    else if (toStatus === 'ready_to_award') newReqStatus = 'Scoring_Complete';

    const updatedReq = await prisma.purchaseRequisition.update({ where: { id: requisitionId }, data: { status: newReqStatus } });

    await prisma.auditLog.create({
      data: {
        timestamp: new Date(),
        user: { connect: { id: actor.id } },
        action: 'RESET_AWARD',
        entity: 'Requisition',
        entityId: requisitionId,
        details: `User ${actor.id} reset award status to ${newReqStatus}`,
        transactionId: requisitionId,
      }
    });

    return NextResponse.json({ message: 'Award reset successfully', requisition: updatedReq });
  } catch (error) {
    console.error('Failed to reset award:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
