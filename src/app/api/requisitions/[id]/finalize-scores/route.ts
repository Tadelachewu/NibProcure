
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { User, UserRole, PerItemAwardDetail, QuoteItem } from '@/lib/types';
import { getNextApprovalStep } from '@/services/award-service';

export async function POST(
  request: Request,
  { params }: { params: { id:string } }
) {
    const requisitionId = params.id;
    try {
        const body = await request.json();
        const { userId, awards, awardStrategy, awardResponseDeadline, totalAwardValue } = body;

        const user: User | null = await prisma.user.findUnique({ where: { id: userId }, include: { roles: true } });
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }
        
        const rfqSenderSetting = await prisma.setting.findUnique({ where: { key: 'rfqSenderSetting' } });
        let isAuthorized = false;
        const userRoles = (user.roles as any[]).map(r => r.name) as UserRole[];

        if (userRoles.includes('Admin') || userRoles.includes('Committee')) {
            isAuthorized = true;
        } else if (rfqSenderSetting?.value && typeof rfqSenderSetting.value === 'object' && 'type' in rfqSenderSetting.value) {
            const setting = rfqSenderSetting.value as { type: string, userId?: string };
            if (setting.type === 'specific') {
                isAuthorized = setting.userId === userId;
            } else { // 'all' case
                isAuthorized = userRoles.includes('Procurement_Officer');
            }
        }


        if (!isAuthorized) {
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
                include: { items: true, scores: { include: { itemScores: {include: {scores: true}} } } },
            });

            if (allQuotes.length === 0) {
                throw new Error("No quotes found to process for this requisition.");
            }
            
            let finalAwardValue = 0;
            let finalAwardedItemIds: string[] = [];

            if (awardStrategy === 'all') {
                const vendorScores: { [vendorId: string]: { totalScore: number; count: number; championBids: QuoteItem[] } } = {};

                for (const quote of allQuotes) {
                    vendorScores[quote.vendorId] = { totalScore: 0, count: 0, championBids: [] };
                    
                    for (const reqItem of requisition.items) {
                        const proposalsForItem = quote.items.filter(i => i.requisitionItemId === reqItem.id);
                        if (proposalsForItem.length === 0) continue;

                        let bestProposalScore = -1;
                        let championBid: QuoteItem | null = null;
                        
                        for (const proposal of proposalsForItem) {
                            let currentProposalScore = 0;
                            let scorerCount = 0;
                            for (const scoreSet of quote.scores) {
                                const itemScore = scoreSet.itemScores.find(is => is.quoteItemId === proposal.id);
                                if (itemScore) {
                                    currentProposalScore += itemScore.finalScore;
                                    scorerCount++;
                                }
                            }
                            const avgScore = scorerCount > 0 ? currentProposalScore / scorerCount : 0;
                            if (avgScore > bestProposalScore) {
                                bestProposalScore = avgScore;
                                championBid = proposal;
                            }
                        }
                        
                        if (championBid) {
                            vendorScores[quote.vendorId].totalScore += bestProposalScore;
                            vendorScores[quote.vendorId].count++;
                            vendorScores[quote.vendorId].championBids.push(championBid);
                        }
                    }
                }

                const rankedVendors = Object.entries(vendorScores)
                    .map(([vendorId, data]) => ({
                        vendorId,
                        avgScore: data.count > 0 ? data.totalScore / data.count : 0,
                        championBids: data.championBids
                    }))
                    .sort((a, b) => b.avgScore - a.avgScore);

                if (rankedVendors.length === 0) throw new Error("Could not determine a winning vendor.");

                const winner = rankedVendors[0];
                const winningQuote = allQuotes.find(q => q.vendorId === winner.vendorId);
                if (!winningQuote) throw new Error("Winning quote not found in database.");

                finalAwardValue = winner.championBids.reduce((acc, item) => acc + (item.unitPrice * item.quantity), 0);
                finalAwardedItemIds = winner.championBids.map(item => item.id);
                
                await tx.quotation.update({ where: { id: winningQuote.id }, data: { status: 'Pending_Award', rank: 1 } });
                
                const otherQuotes = rankedVendors.slice(1);
                for (let i = 0; i < otherQuotes.length; i++) {
                    const quoteData = otherQuotes[i];
                    const quoteToUpdate = allQuotes.find(q => q.vendorId === quoteData.vendorId);
                    if (quoteToUpdate) {
                        await tx.quotation.update({
                            where: { id: quoteToUpdate.id },
                            data: {
                                status: i < 2 ? 'Standby' : 'Rejected',
                                rank: i < 2 ? (i + 2) as 2 | 3 : null,
                            }
                        });
                    }
                }

            } else if (awardStrategy === 'item') {
                const reqItems = await tx.requisitionItem.findMany({ where: { requisitionId: requisitionId }});
                finalAwardValue = totalAwardValue;

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

            const { nextStatus, nextApproverId, auditDetails } = await getNextApprovalStep(tx, { ...requisition, totalPrice: finalAwardValue }, user);

            const updatedRequisition = await tx.purchaseRequisition.update({
                where: { id: requisitionId },
                data: {
                    status: nextStatus as any,
                    currentApproverId: nextApproverId,
                    awardResponseDeadline: awardResponseDeadline ? new Date(awardResponseDeadline) : undefined,
                    totalPrice: finalAwardValue,
                    awardedQuoteItemIds: finalAwardedItemIds,
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
