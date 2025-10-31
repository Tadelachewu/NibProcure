
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
    try {
        const body = await request.json();
        const { userId, awards, awardStrategy, awardResponseDeadline, totalAwardValue } = body;

        const user: User | null = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || (user.role !== 'Procurement_Officer' && user.role !== 'Admin' && user.role !== 'Committee')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }
        
        const result = await prisma.$transaction(async (tx) => {
            
            const { nextStatus, nextApproverId, auditDetails } = await getNextApprovalStep(tx, totalAwardValue);

            // 1. Clear any previous awards for this requisition to ensure a clean state
            await tx.awardedItem.deleteMany({ where: { requisitionId: requisitionId } });

            // 2. Create new AwardedItem entries for each winning item
            const winningQuoteIds = new Set<string>();
            for (const vendorId in awards) {
                const award = awards[vendorId];
                if (!award.quoteId) {
                    throw new Error(`quoteId is missing for award to vendor ${vendorId}.`);
                }
                winningQuoteIds.add(award.quoteId);

                for (const item of award.items) {
                    if (!item.quoteItemId) {
                        throw new Error(`quoteItemId is missing for awarded item. This should not happen.`);
                    }
                    await tx.awardedItem.create({
                        data: {
                            status: 'PendingAcceptance',
                            requisition: { connect: { id: requisitionId } },
                            requisitionItem: { connect: { id: item.requisitionItemId } },
                            vendor: { connect: { id: vendorId } },
                            quotation: { connect: { id: award.quoteId } }
                        }
                    });
                }
            }

            // 3. Set winning quotes to 'Pending_Award', rank others as standby, and reject the rest
            const allQuotesForReq = await tx.quotation.findMany({
                where: { 
                    requisitionId: requisitionId,
                    status: { notIn: ['Declined', 'Failed'] } // Don't consider already declined quotes
                },
                orderBy: { finalAverageScore: 'desc' },
            });

            let rankCounter = 1;
            const quotesToUpdate = [];

            for (const quote of allQuotesForReq) {
                if (winningQuoteIds.has(quote.id)) {
                    quotesToUpdate.push({
                        where: { id: quote.id },
                        data: { status: 'Pending_Award', rank: 1 }
                    });
                } else if (rankCounter <= 2) { // Ranks 2 and 3 are standby
                    rankCounter++;
                    quotesToUpdate.push({
                        where: { id: quote.id },
                        data: { status: 'Standby', rank: rankCounter }
                    });
                } else { // All others are rejected
                    quotesToUpdate.push({
                        where: { id: quote.id },
                        data: { status: 'Rejected', rank: null }
                    });
                }
            }

            for (const update of quotesToUpdate) {
                await tx.quotation.update(update);
            }
            
            // 4. Update the main requisition with the new status and approval routing
            const updatedRequisition = await tx.purchaseRequisition.update({
                where: { id: requisitionId },
                data: {
                    status: nextStatus as any,
                    currentApproverId: nextApproverId,
                    awardResponseDeadline: awardResponseDeadline ? new Date(awardResponseDeadline) : undefined,
                    totalPrice: totalAwardValue
                }
            });
            
            // 5. Create the audit log
            await tx.auditLog.create({
                data: {
                    user: { connect: { id: userId } },
                    action: 'FINALIZE_AWARD',
                    entity: 'Requisition',
                    entityId: requisitionId,
                    details: auditDetails,
                    transactionId: requisitionId,
                    timestamp: new Date(),
                }
            });
            
            return updatedRequisition;
        }, {
            maxWait: 15000,
            timeout: 30000,
        });
        
        return NextResponse.json({ message: 'Award process finalized and routed for review.', requisition: result });

    } catch (error) {
        console.error("[FINALIZE-SCORES] Failed to finalize scores and award:", error);
        if (error instanceof Error) {
            return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
        }
        return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
    }
}
