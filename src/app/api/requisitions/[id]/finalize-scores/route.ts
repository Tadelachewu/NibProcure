

'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { User, UserRole, PerItemAwardDetail, QuoteItem, Quotation, EvaluationCriteria } from '@/lib/types';
import { getNextApprovalStep } from '@/services/award-service';

function calculateItemScoreForVendor(
    quote: Quotation & { items: QuoteItem[], scores: any[] },
    reqItem: { id: string },
    evaluationCriteria: EvaluationCriteria
): { championBid: QuoteItem | null, championScore: number } {
    
    const proposalsForItem = quote.items.filter(item => item.requisitionItemId === reqItem.id);
    if (proposalsForItem.length === 0) {
        return { championBid: null, championScore: 0 };
    }

    let championBid: QuoteItem | null = null;
    let championScore = -1;

    for (const proposal of proposalsForItem) {
        let totalItemScore = 0;
        let scoreCount = 0;
        
        quote.scores?.forEach(scoreSet => {
            const itemScore = scoreSet.itemScores.find((is: any) => is.quoteItemId === proposal.id);
            if (itemScore) {
                totalItemScore += itemScore.finalScore;
                scoreCount++;
            }
        });

        const averageScore = scoreCount > 0 ? totalItemScore / scoreCount : 0;
        
        if (averageScore > championScore) {
            championScore = averageScore;
            championBid = proposal;
        }
    }

    return { championBid, championScore };
}


export async function POST(
  request: Request,
  { params }: { params: { id:string } }
) {
    const requisitionId = params.id;
    console.log(`[FINALIZE-SCORES] Received request for requisition: ${requisitionId}`);
    try {
        const body = await request.json();
        const { userId, awards, awardStrategy, awardResponseDeadline, minuteDocumentUrl, minuteJustification } = body;
        console.log(`[FINALIZE-SCORES] Action by User ID: ${userId}, Strategy: ${awardStrategy}`);

        if (!minuteDocumentUrl) {
            return NextResponse.json({ error: "The official minute document is required to proceed." }, { status: 400 });
        }

        const user = await prisma.user.findUnique({ where: { id: userId }, include: { roles: true } });
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const rfqSenderSetting = await prisma.setting.findUnique({ where: { key: 'rfqSenderSetting' } });
        let isAuthorized = false;
        const userRoles = (user.roles as any[]).map(r => r.name) as UserRole[];

        if (userRoles.includes('Admin')) {
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
            console.error(`[FINALIZE-SCORES] User ${userId} is not authorized.`);
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        console.log('[FINALIZE-SCORES] Starting transaction...');
        const result = await prisma.$transaction(async (tx) => {

            const requisition = await tx.purchaseRequisition.findUnique({
                where: { id: requisitionId },
                include: {
                    items: true,
                    evaluationCriteria: { include: { financialCriteria: true, technicalCriteria: true } },
                    quotations: { include: { scores: { include: { itemScores: true } }, items: true } }
                }
            });
            if (!requisition || !requisition.evaluationCriteria) {
                throw new Error("Requisition or its evaluation criteria not found.");
            }

            const allQuotes = requisition.quotations;

            if (allQuotes.length === 0) {
                throw new Error("No quotes found to process for this requisition.");
            }
            
            // --- SERVER-SIDE VALUE CALCULATION ---
            let totalAwardValue = 0;
            if (awardStrategy === 'all') {
                const winningVendorId = Object.keys(awards)[0];
                const winnerQuote = allQuotes.find(q => q.vendorId === winningVendorId);

                if (winnerQuote && requisition.evaluationCriteria) {
                    totalAwardValue = requisition.items.reduce((sum, reqItem) => {
                        const { championBid } = calculateItemScoreForVendor(winnerQuote, reqItem, requisition.evaluationCriteria!);
                        if (championBid) {
                            return sum + (championBid.unitPrice * championBid.quantity);
                        }
                        return sum;
                    }, 0);
                }

            } else if (awardStrategy === 'item') {
                const winningQuoteItemIds = Object.values(awards).map((award: any) => award.rankedBids[0].quoteItemId);
                
                const winningQuoteItems = await tx.quoteItem.findMany({
                    where: { id: { in: winningQuoteItemIds } },
                    include: { requisitionItem: true }
                });

                totalAwardValue = winningQuoteItems.reduce((sum, item) => {
                    return sum + (item.unitPrice * (item.requisitionItem?.quantity || 0));
                }, 0);
            }
            // --- END CALCULATION ---
            

            const dynamicAwardValue = totalAwardValue;

            if (awardStrategy === 'all') {
                console.log('[FINALIZE-SCORES] Calculating for "Award All to Single Vendor" strategy.');
                const winningVendorId = Object.keys(awards)[0];
                const winningQuote = allQuotes.find(q => q.vendorId === winningVendorId);

                if (!winningQuote) throw new Error("Winning vendor's quote not found.");

                const otherQuotes = allQuotes.filter(q => q.vendorId !== winningVendorId);

                await tx.quotation.update({ where: { id: winningQuote.id }, data: { status: 'Pending_Award', rank: 1 } });

                const sortedOthers = otherQuotes.sort((a,b) => (b.finalAverageScore || 0) - (a.finalAverageScore || 0));

                for (let i = 0; i < sortedOthers.length; i++) {
                    const quote = sortedOthers[i];
                    const rank = i < 2 ? (i + 2) as 2 | 3 : null;
                    await tx.quotation.update({
                        where: { id: quote.id },
                        data: {
                            status: i < 2 ? 'Standby' : 'Rejected',
                            rank: rank
                        }
                    });
                }
                const championBids = requisition.items.map(reqItem => {
                   const { championBid } = calculateItemScoreForVendor(winningQuote, reqItem, requisition.evaluationCriteria!);
                   return championBid;
                }).filter(Boolean) as QuoteItem[];

                const itemIdsToAward = championBids.map(i => i.id);
                await tx.purchaseRequisition.update({
                    where: { id: requisitionId },
                    data: { awardedQuoteItemIds: itemIdsToAward }
                });

            } else if (awardStrategy === 'item') {
                console.log('[FINALIZE-SCORES] Calculating for "Best Offer (Per Item)" strategy.');

                const allItemsWithAwards = requisition.items.map(item => {
                    const bids = awards[item.id]?.rankedBids;
                    if (!bids || bids.length === 0) {
                        return { ...item, perItemAwardDetails: [] };
                    }
                    const perItemAwardDetails = bids.slice(0, 3).map((bid: any, index: number) => ({
                        rank: index + 1,
                        vendorId: bid.vendorId,
                        vendorName: bid.vendorName,
                        quotationId: bid.quotationId,
                        quoteItemId: bid.quoteItemId,
                        proposedItemName: bid.proposedItemName,
                        unitPrice: bid.unitPrice,
                        score: bid.score,
                        status: (index === 0) ? 'Pending_Award' : 'Standby'
                    }));
                    return { ...item, perItemAwardDetails };
                });

                for (const item of allItemsWithAwards) {
                    await tx.requisitionItem.update({
                        where: { id: item.id },
                        data: { perItemAwardDetails: (item.perItemAwardDetails as any) || [] }
                    });
                }
            }

            console.log('[FINALIZE-SCORES] Getting next approval step...');
            const { nextStatus, nextApproverId, auditDetails } = await getNextApprovalStep(tx, { ...requisition, totalPrice: dynamicAwardValue }, user);
            console.log(`[FINALIZE-SCORES] Next Step: Status=${nextStatus}, ApproverID=${nextApproverId}`);

            const updatedRequisition = await tx.purchaseRequisition.update({
                where: { id: requisitionId },
                data: {
                    status: nextStatus as any,
                    currentApproverId: nextApproverId,
                    awardResponseDeadline: awardResponseDeadline ? new Date(awardResponseDeadline) : undefined,
                    totalPrice: dynamicAwardValue,
                    rfqSettings: {
                        ...(requisition?.rfqSettings as any),
                        awardStrategy: awardStrategy,
                    }
                }
            });

            await tx.minute.create({
                data: {
                    requisition: { connect: { id: requisitionId } },
                    author: { connect: { id: userId } },
                    decision: 'APPROVED',
                    decisionBody: 'Award Finalization',
                    justification: minuteJustification || 'Official minute document for award finalization.',
                    type: 'uploaded_document',
                    documentUrl: minuteDocumentUrl,
                }
            });

            console.log(`[FINALIZE-SCORES] Updated requisition ${requisitionId} status to ${nextStatus}.`);

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
            console.log('[FINALIZE-SCORES] Audit log created.');

            return updatedRequisition;
        }, {
            maxWait: 15000,
            timeout: 30000,
        });

        console.log('[FINALIZE-SCORES] Transaction complete. Sending response.');
        return NextResponse.json({ message: 'Award process finalized and routed for review.', requisition: result });

    } catch (error) {
        console.error("[FINALIZE-SCORES] Failed to finalize scores and award:", error);
        if (error instanceof Error) {
            return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
        }
        return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
    }
}
