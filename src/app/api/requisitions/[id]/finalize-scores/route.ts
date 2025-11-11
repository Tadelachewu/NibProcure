

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
    console.log(`--- FINALIZE-SCORES START for REQ: ${requisitionId} ---`);
    try {
        const body = await request.json();
        const { userId, awards, awardStrategy, awardResponseDeadline, totalAwardValue } = body;
        console.log(`[FINALIZE-SCORES] Award Value: ${totalAwardValue}, Strategy: ${awardStrategy}`);

        const user: User | null = await prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }
        
        const rfqSenderSetting = await prisma.setting.findUnique({ where: { key: 'rfqSenderSetting' } });
        let isAuthorized = false;
        const userRoleName = user.role.name as UserRole;

        if (userRoleName === 'Admin' || userRoleName === 'Committee') {
            isAuthorized = true;
        } else if (rfqSenderSetting?.value?.type === 'specific') {
            isAuthorized = (rfqSenderSetting.value as any).userId === userId;
        } else {
            isAuthorized = userRoleName === 'Procurement_Officer';
        }

        if (!isAuthorized) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }
        
        const result = await prisma.$transaction(async (tx) => {
            
            const allQuotes = await tx.quotation.findMany({ 
                where: { requisitionId: requisitionId },
                include: { items: true, scores: { include: { itemScores: { include: { scores: true } } } } },
                orderBy: { finalAverageScore: 'desc' } 
            });

            if (allQuotes.length === 0) {
                throw new Error("No quotes found to process for this requisition.");
            }
            
            const { nextStatus, nextApproverId, auditDetails } = await getNextApprovalStep(tx, totalAwardValue);

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

            } else if (awardStrategy === 'item') {
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
                                     averageScore: averageScore 
                                 });
                             });
                         }
                    }

                    proposals.sort((a,b) => b.averageScore - a.averageScore);
                    
                    const rankedProposals = proposals.slice(0, 3).map((p, index) => {
                        const { averageScore, ...rest } = p; // Remove temporary property
                        let status: PerItemAwardDetail['status'] = (index === 0) ? 'Pending_Award' : 'Standby';
                        return { ...rest, rank: index + 1, status };
                    });

                    await tx.requisitionItem.update({
                        where: { id: reqItem.id },
                        data: {
                            perItemAwardDetails: rankedProposals as any
                        }
                    });
                }
            }

            const awardedItemIds = awardStrategy === 'all'
                ? Object.values(awards).flatMap((a: any) => a.items.map((i: any) => i.quoteItemId))
                : []; // For per-item, this is now stored on the item itself.
            
            const requisition = await tx.purchaseRequisition.findUnique({ where: { id: requisitionId }});

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
