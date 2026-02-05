
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';

export async function POST(request: Request, context: { params: any }) {
  const actor = await getActorFromToken(request);
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
  }

  const params = await context.params;
  const requisitionId = params?.id as string | undefined;
  if (!requisitionId || typeof requisitionId !== 'string') {
    console.error('POST /api/requisitions/[id]/submit-scores missing or invalid id', { method: request.method, url: (request as any).url, params });
    return NextResponse.json({ error: 'Missing or invalid id' }, { status: 400 });
  }
  try {
    if (!(actor.roles as string[]).some(r => r.includes('Committee'))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Prevent finalization if scoring/compliance deadline has passed
    const reqForCheck = await prisma.purchaseRequisition.findUnique({ where: { id: requisitionId } });
    if (!reqForCheck) {
      return NextResponse.json({ error: 'Requisition not found.' }, { status: 404 });
    }
    if (reqForCheck.scoringDeadline) {
      const now = new Date();
      const deadline = new Date(reqForCheck.scoringDeadline);
      if (now > deadline) {
        return NextResponse.json({ error: 'Scoring/compliance deadline has passed. You can no longer finalize checks.' }, { status: 403 });
      }
    }

    await prisma.committeeAssignment.upsert({
      where: {
        userId_requisitionId: {
          userId: actor.id,
          requisitionId: requisitionId,
        }
      },
      update: { scoresSubmitted: true },
      create: {
        userId: actor.id,
        requisitionId: requisitionId,
        scoresSubmitted: true,
      },
    });

    // Check if all assigned members have now submitted scores
    const requisition = await prisma.purchaseRequisition.findUnique({
      where: { id: requisitionId },
      include: { committeeAssignments: true, financialCommitteeMembers: true, technicalCommitteeMembers: true }
    });

    if (requisition) {
      const assignedMemberIds = new Set([
        ...(requisition.financialCommitteeMemberIds || []).map(m => m.id),
        ...(requisition.technicalCommitteeMemberIds || []).map(m => m.id)
      ]);

      if (assignedMemberIds.size > 0) { // Only change status if a committee was actually assigned
        const submittedMemberIds = new Set(requisition.committeeAssignments.filter(a => a.scoresSubmitted).map(a => a.userId));
        const allHaveScored = [...assignedMemberIds].every(id => submittedMemberIds.has(id));

        if (allHaveScored) {
          await prisma.purchaseRequisition.update({
            where: { id: requisitionId },
            data: { status: 'Scoring_Complete' }
          });
        }
      }
    }


    await prisma.auditLog.create({
      data: {
        transactionId: requisitionId,
        timestamp: new Date(),
        user: { connect: { id: actor.id } },
        action: 'SUBMIT_SCORES',
        entity: 'Requisition',
        entityId: requisitionId,
        details: `Finalized and submitted all scores for requisition.`,
      }
    });

    return NextResponse.json({ message: 'All scores have been successfully submitted.' });
  } catch (error) {
    console.error('Failed to submit final scores:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
