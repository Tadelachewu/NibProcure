
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
        console.log(`[FINALIZE-SCORES] Award Value: ${totalAwardValue}, Strategy: ${awardStrategy}`);

        const user: User | null = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || (user.role !== 'Procurement_Officer' && user.role !== 'Admin' && user.role !== 'Committee')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }
        
        const result = await prisma.$transaction(async (tx) => {
            
            const allQuotes = await tx.quotation.findMany({ 
                where: { requisitionId: requisitionId },
                include: { items: true, scores: { include: { itemScores: true } } },
                orderBy: { finalAverageScore: 'desc' } 
            });

            if (allQuotes.length === 0) {
                throw new Error("No quotes found to process for this requisition.");
            }
            
            const { nextStatus, nextApproverId, auditDetails } = await getNextApprovalStep(tx, totalAwardValue);

            // --- STRATEGY: AWARD TO SINGLE BEST VENDOR ---
            if (awardStrategy === 'all') {
                const awardedVendorIds = Object.keys(awards);
                const winnerQuote = allQuotes.find(q => q.vendorId === awardedVendorIds[0]);

                if (!winnerQuote) {
                    throw new Error("Winning vendor's quote could not be found.");
                }

                await tx.quotation.update({
                    where: { id: winnerQuote.id },
                    data: { status: 'Pending_Award', rank: 1 }
                });

                const otherQuotes = allQuotes.filter(q => q.id !== winnerQuote.id && q.status !== 'Declined');
                for (let i = 0; i < otherQuotes.length; i++) {
                    const status = (i < 2) ? 'Standby' : 'Rejected';
                    const rank = (i < 2) ? (i + 2) as 2 | 3 : null;
                    await tx.quotation.update({ where: { id: otherQuotes[i].id }, data: { status, rank } });
                }

            // --- STRATEGY: AWARD BY BEST ITEM ---
            } else if (awardStrategy === 'item') {
                const reqItems = await tx.requisitionItem.findMany({ where: { requisitionId: requisitionId }});

                await tx.standbyAssignment.deleteMany({
                    where: { requisitionId: requisitionId },
                });

                for (const reqItem of reqItems) {
                    let proposals: { quoteId: string; quoteItemId: string; vendorId: string; averageScore: number; }[] = [];
                    for (const quote of allQuotes) {
                         const proposalsForItem = quote.items.filter(i => i.requisitionItemId === reqItem.id);
                         if (proposalsForItem.length > 0) {
                             proposalsForItem.forEach(proposal => {
                                 let totalScore = 0;
                                 let scoreCount = 0;
                                 quote.scores?.forEach(scoreSet => {
                                     const score = scoreSet.itemScores?.find(s => s.quoteItemId === proposal.id);
                                     if (score) {
                                         totalScore += score.finalScore;
                                         scoreCount++;
                                     }
                                 });
                                 proposals.push({
                                     quoteId: quote.id,
                                     quoteItemId: proposal.id,
                                     vendorId: quote.vendorId,
                                     averageScore: scoreCount > 0 ? totalScore / scoreCount : 0
                                 });
                             });
                         }
                    }

                    proposals.sort((a,b) => b.averageScore - a.averageScore);
                    
                    const standbys = proposals.slice(1, 3);
                    for (let i = 0; i < standbys.length; i++) {
                        await tx.standbyAssignment.create({
                            data: {
                                requisitionId: requisitionId,
                                requisitionItemId: reqItem.id,
                                quotationId: standbys[i].quoteId,
                                rank: i + 2,
                            }
                        });
                    }
                }
                
                const winningVendorIds = new Set(Object.keys(awards));
                const winningQuoteIds = new Set(allQuotes.filter(q => winningVendorIds.has(q.vendorId)).map(q => q.id));

                if (winningQuoteIds.size > 0) {
                    await tx.quotation.updateMany({
                        where: { id: { in: Array.from(winningQuoteIds) as string[] } },
                        data: { status: 'Partially_Awarded' }
                    });
                }
                
                const standbyQuoteIds = new Set(
                  (await tx.standbyAssignment.findMany({ where: { requisitionId } })).map(sa => sa.quotationId)
                );

                if (standbyQuoteIds.size > 0) {
                    await tx.quotation.updateMany({
                        where: {
                            requisitionId: requisitionId,
                            id: { 
                                in: Array.from(standbyQuoteIds) as string[],
                                notIn: Array.from(winningQuoteIds) as string[],
                            },
                        },
                        data: { status: 'Standby' }
                    });
                }
                
                // Set non-winning and non-standby quotes to Submitted. Do not reject them yet.
                await tx.quotation.updateMany({
                    where: {
                        requisitionId: requisitionId,
                        id: {
                            notIn: [...Array.from(winningQuoteIds), ...Array.from(standbyQuoteIds)]
                        }
                    },
                    data: { status: 'Submitted' }
                });
            }

            const awardedItemIds = Object.values(awards).flatMap((a: any) => a.items.map((i: any) => i.quoteItemId));
            
            const updatedRequisition = await tx.purchaseRequisition.update({
                where: { id: requisitionId },
                data: {
                    status: nextStatus as any,
                    currentApproverId: nextApproverId,
                    awardedQuoteItemIds: awardedItemIds,
                    awardResponseDeadline: awardResponseDeadline ? new Date(awardResponseDeadline) : undefined,
                    totalPrice: totalAwardValue,
                    rfqSettings: {
                        ...(requisition?.rfqSettings as any),
                        awardStrategy: awardStrategy,
                    }
                }
            });
            console.log(`[FINALIZE-SCORES] Requisition ${requisitionId} updated. New status: ${updatedRequisition.status}, Approver: ${updatedRequisition.currentApproverId}`);

            await tx.auditLog.create({
                data: {
                    user: { connect: { id: userId } },
                    timestamp: new Date(),
                    action: 'FINALIZE_AWARD',
                    entity: 'Requisition',
                    entityId: requisitionId,
                    details: auditDetails,
                    transactionId: requisitionId,
                }
            });
            
            return updatedRequisition;
        }, {
            maxWait: 10000,
            timeout: 20000,
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
