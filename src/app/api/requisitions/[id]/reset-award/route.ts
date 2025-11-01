

'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { User } from '@/lib/types';


export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const requisitionId = params.id;
  try {
    const body = await request.json();
    const { userId } = body;
    
    const user: User | null = await prisma.user.findUnique({where: {id: userId}});
    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    const requisition = await prisma.purchaseRequisition.findUnique({ where: { id: requisitionId } });
    if (!requisition) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
    }

    // This action should only be possible when an award has been declined and there are no standbys
    if (requisition.status !== 'Award_Declined') {
        return NextResponse.json({ error: 'This action is not applicable for the current requisition status.'}, { status: 400 });
    }
    
    // Reset all quotes that were not 'Accepted' back to 'Submitted'
    // This allows them to be part of a new scoring round if desired.
    await prisma.quotation.updateMany({
        where: {
            requisitionId: requisitionId,
            NOT: {
                status: 'Accepted'
            }
        },
        data: {
            status: 'Submitted',
            rank: null,
            finalAverageScore: 0
        }
    });

    // Reset scores for all quotes on this requisition
    const quotesToReset = await prisma.quotation.findMany({ where: { requisitionId }});
    const quoteIds = quotesToReset.map(q => q.id);
    const scoreSets = await prisma.committeeScoreSet.findMany({ where: { quotationId: { in: quoteIds } } });
    const scoreSetIds = scoreSets.map(s => s.id);
    const itemScores = await prisma.itemScore.findMany({ where: { scoreSetId: { in: scoreSetIds } } });
    const itemScoreIds = itemScores.map(i => i.id);

    await prisma.score.deleteMany({ where: { itemScoreId: { in: itemScoreIds } } });
    await prisma.itemScore.deleteMany({ where: { scoreSetId: { in: scoreSetIds } } });
    await prisma.committeeScoreSet.deleteMany({ where: { quotationId: { in: quoteIds } } });
    await prisma.committeeAssignment.updateMany({ where: { requisitionId }, data: { scoresSubmitted: false }});

    // Update the requisition to be ready for RFQ again
    const updatedRequisition = await prisma.purchaseRequisition.update({
        where: { id: requisitionId },
        data: {
            status: 'PreApproved', // Ready for RFQ
            deadline: null,
            scoringDeadline: null,
            awardResponseDeadline: null,
            awardedQuoteItemIds: [],
        }
    });

    const auditDetails = `Award was reset for requisition ${requisitionId} due to a vendor declining with no available standby. The RFQ process for declined items can now be restarted.`;
    
    await prisma.auditLog.create({
        data: {
            transactionId: requisition.transactionId,
            user: { connect: { id: user.id } },
            timestamp: new Date(),
            action: 'RESET_AWARD',
            entity: 'Requisition',
            entityId: requisitionId,
            details: auditDetails,
        }
    });

    return NextResponse.json({ message: 'Award reset successfully. You can now re-issue the RFQ for the unawarded items.', requisition: updatedRequisition });
  } catch (error) {
    console.error('Failed to reset award:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
