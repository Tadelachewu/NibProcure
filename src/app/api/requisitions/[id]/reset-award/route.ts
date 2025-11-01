
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

    // This action should only be possible when an award has been declined.
    if (requisition.status !== 'Award_Declined') {
        return NextResponse.json({ error: 'This action is not applicable for the current requisition status.'}, { status: 400 });
    }
    
    // --- START: SURGICAL RESET LOGIC ---

    // 1. Get all quotes for the requisition
    const allQuotesForReq = await prisma.quotation.findMany({ where: { requisitionId }});
    const quotesToReset = allQuotesForReq.filter(q => q.status !== 'Accepted');
    const quoteIdsToReset = quotesToReset.map(q => q.id);

    // 2. Find all scores associated with the quotes that need resetting.
    const scoreSetsToReset = await prisma.committeeScoreSet.findMany({ where: { quotationId: { in: quoteIdsToReset } } });
    const scoreSetIds = scoreSetsToReset.map(s => s.id);
    const itemScoresToReset = await prisma.itemScore.findMany({ where: { scoreSetId: { in: scoreSetIds } } });
    const itemScoreIds = itemScoresToReset.map(i => i.id);
    
    // 3. Delete the scores in the correct order (deepest first)
    if (itemScoreIds.length > 0) {
        await prisma.score.deleteMany({ where: { itemScoreId: { in: itemScoreIds } } });
    }
    if (scoreSetIds.length > 0) {
        await prisma.itemScore.deleteMany({ where: { scoreSetId: { in: scoreSetIds } } });
    }
    if (quoteIdsToReset.length > 0) {
        await prisma.committeeScoreSet.deleteMany({ where: { quotationId: { in: quoteIdsToReset } } });
    }

    // 4. Reset the status and scores of non-accepted quotes
    if (quoteIdsToReset.length > 0) {
        await prisma.quotation.updateMany({
            where: {
                id: { in: quoteIdsToReset }
            },
            data: {
                status: 'Submitted',
                rank: null,
                finalAverageScore: 0
            }
        });
    }

    // 5. Reset committee assignments for everyone on this requisition
    await prisma.committeeAssignment.updateMany({ 
        where: { requisitionId }, 
        data: { scoresSubmitted: false }
    });

    // 6. IMPORTANT: Update the requisition to be ready for RFQ again, but DO NOT clear awardedQuoteItemIds
    const updatedRequisition = await prisma.purchaseRequisition.update({
        where: { id: requisitionId },
        data: {
            status: 'PreApproved', // Set to PreApproved to allow a new RFQ to be sent
            deadline: null,
            scoringDeadline: null,
            awardResponseDeadline: null,
            // DO NOT clear awardedQuoteItemIds, this preserves the accepted part of the award
        }
    });

    // --- END: SURGICAL RESET LOGIC ---

    const auditDetails = `Award was reset for requisition ${requisitionId} due to a vendor declining. The RFQ process for unawarded items can now be restarted.`;
    
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
