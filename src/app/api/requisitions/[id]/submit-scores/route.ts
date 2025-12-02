
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const requisitionId = params.id;
  try {
    const actor = await getActorFromToken(request);
    if (!actor) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    if (!(actor.roles as string[]).includes('Committee_Member')) {
        return NextResponse.json({ error: 'Unauthorized: Only committee members can submit scores.' }, { status: 403 });
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
            ...(requisition.financialCommitteeMembers || []).map(m => m.id),
            ...(requisition.technicalCommitteeMembers || []).map(m => m.id)
        ]);

        const submittedMemberIds = new Set(requisition.committeeAssignments.filter(a => a.scoresSubmitted).map(a => a.userId));
        const allHaveScored = [...assignedMemberIds].every(id => submittedMemberIds.has(id));

        if (allHaveScored) {
            await prisma.purchaseRequisition.update({
                where: { id: requisitionId },
                data: { status: 'Scoring_Complete' }
            });
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
    console.error('Failed to submit final scores:', error instanceof Error ? error.message : 'An unknown error occurred');
    return NextResponse.json({ error: 'An internal server error occurred' }, { status: 500 });
  }
}
