
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { User, UserRole, PerItemAwardDetail } from '@/lib/types';
import { getNextApprovalStep } from '@/services/award-service';

export async function POST(
  request: Request,
  { params }: { params: { id:string } }
) {
    const requisitionId = params.id;
    try {
        const body = await request.json();
        const { userId, awards, awardStrategy, awardResponseDeadline, totalAwardValue } = body;

        const user: User | null = await prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }
        
        const rfqSenderSetting = await prisma.setting.findUnique({ where: { key: 'rfqSenderSetting' } });
        let isAuthorized = false;
        const userRoleName = user.role.name as UserRole;

        if (userRoleName === 'Admin' || userRoleName === 'Committee') {
            isAuthorized = true;
        } else if (rfqSenderSetting?.value && typeof rfqSenderSetting.value === 'object' && 'type' in rfqSenderSetting.value) {
            const setting = rfqSenderSetting.value as { type: string, userId?: string };
            if (setting.type === 'specific') {
                isAuthorized = setting.userId === userId;
            } else { // 'all' case
                isAuthorized = userRoleName === 'Procurement_Officer';
            }
        }


        if (!isAuthorized) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }
        
        const result = await prisma.$transaction(async (tx) => {
            
            const allQuotes = await tx.quotation.findMany({ 
                where: { requisitionId: requisitionId },
                include: { items: true, scores: { include: { itemScores: { include: { scores: true } } } } },
            });

            if (allQuotes.length === 0) {
                throw new Error("No quotes found to process for this requisition.");
            }
            
            const { nextStatus, nextApproverId, auditDetails } = await getNextApprovalStep(tx, totalAwardValue);

            if (awardStrategy === 'all') {
                // This is the new "Best-of-Vendor" (champion bid) strategy
                const vendorScores: { [vendorId: string]: { totalScore: number, championBidsCount: number, vendorName: string, quoteId: string } } = {};

                allQuotes.forEach(quote => {
                    vendorScores[quote.vendorId] = { totalScore: 0, championBidsCount: 0, vendorName: quote.vendorName, quoteId: quote.id };
                });

                const requisitionItems = await tx.requisitionItem.findMany({ where: { requisitionId: requisitionId } });

                for (const reqItem of requisitionItems) {
                    for (const vendorId in vendorScores) {
                        const vendorQuote = allQuotes.find(q => q.vendorId === vendorId);
                        if (!vendorQuote) continue;

                        const proposalsForItem = vendorQuote.items.filter(i => i.requisitionItemId === reqItem.id);
                        if (proposalsForItem.length === 0) continue;
                        
                        let bestItemScore = -1;
                        proposalsForItem.forEach(proposal => {
                            let totalProposalScore = 0;
                            let scoreCount = 0;
                            vendorQuote.scores?.forEach(scoreSet => {
                                const itemScore = scoreSet.itemScores?.find(s => s.quoteItemId === proposal.id);
                                if (itemScore) {
                                    totalProposalScore += itemScore.finalScore;
                                    scoreCount++;
                                }
                            });
                            const averageProposalScore = scoreCount > 0 ? totalProposalScore / scoreCount : 0;
                            if (averageProposalScore > bestItemScore) {
                                bestItemScore = averageProposalScore;
                            }
                        });

                        if (bestItemScore !== -1) {
                            vendorScores[vendorId].totalScore += bestItemScore;
                            vendorScores[vendorId].championBidsCount++;
                        }
                    }
                }
                
                const vendorRankings = Object.entries(vendorScores)
                    .map(([vendorId, data]) => ({
                        vendorId,
                        ...data,
                        averageScore: data.championBidsCount > 0 ? data.totalScore / data.championBidsCount : 0,
                    }))
                    .sort((a, b) => b.averageScore - a.averageScore);
                
                for (let i = 0; i < vendorRankings.length; i++) {
                    const rankData = vendorRankings[i];
                    await tx.quotation.update({
                        where: { id: rankData.quoteId },
                        data: {
                            status: i === 0 ? 'Pending_Award' : (i <= 2 ? 'Standby' : 'Rejected'),
                            rank: (i + 1) as 1 | 2 | 3 | null,
                        }
                    });
                }
                

            } else if (awardStrategy === 'item') {
                // --- PER-ITEM AWARD LOGIC ---
                const reqItems = await tx.requisitionItem.findMany({ where: { requisitionId: requisitionId }});

                for (const reqItem of reqItems) {
                    let proposals: any[] = [];
                    for (const quote of allQuotes) {
                         const proposalsForItem = quote.items.filter(i => i.requisitionItemId === reqItem.id);
                         if (proposalsForItem.length > 0) {
                             proposalsForItem.forEach(proposal => {
                                 let totalItemScore = 0;
                                 let scoreCount = 0;
                                 quote.scores?.forEach(scoreSet => {
                                     const itemScore = scoreSet.itemScores?.find(s => s.quoteItemId === proposal.id);
                                     if (itemScore) {
                                         totalItemScore += itemScore.finalScore;
                                         scoreCount++;
                                     }
                                 });
                                 const averageScore = scoreCount > 0 ? totalItemScore / scoreCount : 0;
                                 proposals.push({
                                     vendorId: quote.vendorId,
                                     vendorName: quote.vendorName,
                                     quotationId: quote.id,
                                     quoteItemId: proposal.id,
                                     proposedItemName: proposal.name,
                                     unitPrice: proposal.unitPrice,
                                     score: averageScore 
                                 });
                             });
                         }
                    }

                    proposals.sort((a,b) => b.score - a.score);
                    
                    const rankedProposals = proposals.slice(0, 3).map((p, index) => ({
                        vendorId: p.vendorId,
                        vendorName: p.vendorName,
                        quotationId: p.quotationId,
                        quoteItemId: p.quoteItemId,
                        proposedItemName: p.proposedItemName,
                        unitPrice: p.unitPrice,
                        score: p.score,
                        rank: index + 1, 
                        status: (index === 0) ? 'Pending_Award' : 'Standby'
                    }));

                    await tx.requisitionItem.update({
                        where: { id: reqItem.id },
                        data: {
                            perItemAwardDetails: rankedProposals as any
                        }
                    });
                }
            }

            const requisition = await tx.purchaseRequisition.findUnique({ where: { id: requisitionId }});

            const updatedRequisition = await tx.purchaseRequisition.update({
                where: { id: requisitionId },
                data: {
                    status: nextStatus as any,
                    currentApproverId: nextApproverId,
                    awardResponseDeadline: awardResponseDeadline ? new Date(awardResponseDeadline) : undefined,
                    totalPrice: totalAwardValue,
                    rfqSettings: {
                        ...(requisition?.rfqSettings as any),
                        awardStrategy: awardStrategy,
                    }
                }
            });

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
