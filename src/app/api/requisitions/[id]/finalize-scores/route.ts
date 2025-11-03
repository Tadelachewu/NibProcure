
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { User, UserRole } from '@/lib/types';
import { getNextApprovalStep } from '@/services/award-service';

export async function POST(
  request: Request,
  { params }: { params: { id:string } }
) {
    const requisitionId = params.id;
    console.log(`--- FINALIZE-SCORES START for REQ: ${requisitionId} ---`);
    try {
        const body = await request.json();
        const { userId, awards, awardStrategy, awardResponseDeadline, totalAwardValue } = body;
        console.log(`[FINALIZE-SCORES] Award Value: ${totalAwardValue}`);

        const user: User | null = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || (user.role !== 'Procurement_Officer' && user.role !== 'Admin' && user.role !== 'Committee')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }
        
        const result = await prisma.$transaction(async (tx) => {
            
            const requisition = await tx.purchaseRequisition.findUnique({
                where: { id: requisitionId },
                include: { items: true }
            });
            if (!requisition) {
                throw new Error("Requisition not found.");
            }

            const allQuotes = await tx.quotation.findMany({ 
                where: { requisitionId: requisitionId }, 
                include: { items: true, scores: { include: { itemScores: true } } }
            });

            if (allQuotes.length === 0) {
                throw new Error("No quotes found to process for this requisition.");
            }
            
            // --- START: New Per-Item Ranking Logic ---

            // Step 1: Rank every proposal for every item
            for (const reqItem of requisition.items) {
                const proposalsForItem = allQuotes.flatMap(q => 
                    q.items.filter(qi => qi.requisitionItemId === reqItem.id).map(qi => ({
                        quoteItemId: qi.id,
                        vendorId: q.vendorId,
                        finalItemScore: qi.itemScores.reduce((sum, score) => sum + score.finalScore, 0) / (qi.itemScores.length || 1)
                    }))
                );

                proposalsForItem.sort((a, b) => b.finalItemScore - a.finalItemScore);
                
                for (let i = 0; i < proposalsForItem.length; i++) {
                    const rank = i + 1;
                    if (rank <= 3) { // We only care about ranks 1, 2, 3
                        await tx.quoteItem.update({
                            where: { id: proposalsForItem[i].quoteItemId },
                            data: { rank: rank }
                        });
                    }
                }
            }

            // Step 2: Set quote statuses based on their items' ranks
            const awardedQuoteItemIds = Object.values(awards).flatMap((a: any) => a.items.map((i: any) => i.quoteItemId));

            for (const quote of allQuotes) {
                const hasWinningItem = quote.items.some(qi => awardedQuoteItemIds.includes(qi.id));
                
                if (hasWinningItem) {
                     await tx.quotation.update({
                        where: { id: quote.id },
                        data: {
                            status: 'Pending_Award',
                        }
                    });
                } else {
                     await tx.quotation.update({
                        where: { id: quote.id },
                        data: {
                            status: 'Rejected', // If not a winner for any item, they are rejected outright
                        }
                    });
                }
            }
            // --- END: New Per-Item Ranking Logic ---
            
            const { nextStatus, nextApproverId, auditDetails } = await getNextApprovalStep(tx, totalAwardValue);
            
            const updatedRequisition = await tx.purchaseRequisition.update({
                where: { id: requisitionId },
                data: {
                    status: nextStatus as any,
                    currentApproverId: nextApproverId,
                    awardedQuoteItemIds: awardedQuoteItemIds,
                    awardResponseDeadline: awardResponseDeadline ? new Date(awardResponseDeadline) : undefined,
                    totalPrice: totalAwardValue
                }
            });
            console.log(`[FINALIZE-SCORES] Requisition ${requisitionId} updated. New status: ${updatedRequisition.status}, Approver: ${updatedRequisition.currentApproverId}`);

            await tx.auditLog.create({
                data: {
                    user: { connect: { id: userId } },
                    action: 'FINALIZE_AWARD',
                    entity: 'Requisition',
                    entityId: requisitionId,
                    details: auditDetails,
                    transactionId: requisitionId,
                }
            });
            
            return updatedRequisition;
        }, {
            maxWait: 15000, // Increased wait time
            timeout: 30000, // Increased timeout
        });
        
        console.log(`--- FINALIZE-SCORES END for REQ: ${requisitionId} ---`);
        return NextResponse.json({ message: 'Award process finalized and routed for review.', requisition: result });

    } catch (error) {
        console.error("[FINALIZE-SCORES] Failed to finalize scores and award:", error);
        if (error instanceof Error) {
            return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
        }
        return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
    }
}
