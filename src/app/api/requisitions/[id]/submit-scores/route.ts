
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const requisitionId = params.id;
  try {
    const body = await request.json();
    const { userId } = body;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.role !== 'Committee_Member') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    await prisma.committeeAssignment.upsert({
      where: {
        userId_requisitionId: {
          userId: userId,
          requisitionId: requisitionId,
        }
      },
      update: { scoresSubmitted: true },
      create: {
        userId: userId,
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
            ...requisition.financialCommitteeMemberIds.map(m => m.id),
            ...requisition.technicalCommitteeMemberIds.map(m => m.id)
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
            user: { connect: { id: user.id } },
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
