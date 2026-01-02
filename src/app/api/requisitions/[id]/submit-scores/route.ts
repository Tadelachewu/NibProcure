
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const requisitionId = params.id;
  try {
    // Authenticate via JWT (do not trust userId from request body)
    let actor;
    try {
      actor = await getActorFromToken(request);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const actorRoleNames = (actor.roles || []).map((r: any) => (typeof r === 'string' ? r : r?.name)).filter(Boolean);
    const isCommitteeActor = actorRoleNames.includes('Committee_Member') || actorRoleNames.some((r: string) => r.includes('Committee'));
    if (!isCommitteeActor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const existing = await prisma.committeeAssignment.findUnique({
      where: {
        userId_requisitionId: {
          userId: actor.id,
          requisitionId,
        },
      },
      select: { scoresSubmitted: true },
    });

    if (existing?.scoresSubmitted) {
      return NextResponse.json({ error: 'Scores already submitted.' }, { status: 409 });
    }

    // Ensure the actor is actually assigned to this requisition's committee
    const reqForAssignment = await prisma.purchaseRequisition.findUnique({
      where: { id: requisitionId },
      select: { financialCommitteeMemberIds: true, technicalCommitteeMemberIds: true },
    });

    if (!reqForAssignment) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
    }

    const assignedIds = new Set([
      ...(reqForAssignment.financialCommitteeMemberIds || []),
      ...(reqForAssignment.technicalCommitteeMemberIds || []),
    ]);

    if (!assignedIds.has(actor.id)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
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
    console.error('Failed to submit final scores:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}

