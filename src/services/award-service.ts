

'use server';

import { Prisma, PrismaClient } from '@prisma/client';
import { User, UserRole, PerItemAwardDetail, QuoteItem } from '@/lib/types';

const roleToStatusMap: Record<string, string> = {
    'Committee_B_Member': 'Pending_Committee_B_Review',
    'Committee_A_Member': 'Pending_Committee_A_Recommendation',
    'Manager_Procurement_Division': 'Pending_Managerial_Approval',
    'Director_Supply_Chain_and_Property_Management': 'Pending_Director_Approval',
    'VP_Resources_and_Facilities': 'Pending_VP_Approval',
    'President': 'Pending_President_Approval'
};


/**
 * Finds the correct initial status and approver for a given value tier.
 * @param tx - Prisma transaction client.
 * @param totalAwardValue - The value of the award.
 * @returns An object with the next status and approver ID.
 */
export async function getNextApprovalStep(tx: Prisma.TransactionClient, totalAwardValue: number) {
    const approvalMatrix = await tx.approvalThreshold.findMany({
      include: {
        steps: {
          include: {
            role: { 
              select: {
                name: true
              }
            }
          },
          orderBy: { order: 'asc' }
        }
      },
      orderBy: { min: 'asc' }
    });

    const relevantTier = approvalMatrix.find(tier => 
        totalAwardValue >= tier.min && (tier.max === null || totalAwardValue <= tier.max)
    );

    if (!relevantTier) {
        throw new Error(`No approval tier found for an award value of ${totalAwardValue.toLocaleString()} ETB.`);
    }

    if (relevantTier.steps.length === 0) {
        return { 
            nextStatus: 'PostApproved', 
            nextApproverId: null, 
            auditDetails: `Award value ${totalAwardValue.toLocaleString()} ETB falls into "${relevantTier.name}" tier, which has no approval steps. Approved for vendor notification.`
        };
    }

    const firstStep = relevantTier.steps[0];
    
    const nextStatus = roleToStatusMap[firstStep.role.name];
    if (!nextStatus) {
      throw new Error(`Could not find a valid pending status for the role: ${firstStep.role.name}`);
    }

    let nextApproverId: string | null = null;
    
    if (!firstStep.role.name.includes('Committee')) {
        const approverUser = await tx.user.findFirst({ where: { role: { name: firstStep.role.name } }});
        if (!approverUser) {
            throw new Error(`Could not find a user for the role: ${firstStep.role.name.replace(/_/g, ' ')}`);
        }
        nextApproverId = approverUser.id;
    }

    return { 
        nextStatus, 
        nextApproverId,
        auditDetails: `Award value ${totalAwardValue.toLocaleString()} ETB falls into "${relevantTier.name}" tier. Routing to ${firstStep.role.name.replace(/_/g, ' ')} for approval.`
    };
}

/**
 * Performs a "deep clean" of a requisition, deleting all quotes, scores,
 * and resetting committee assignments to prepare for a fresh RFQ process.
 * @param tx - Prisma transaction client.
 * @param requisitionId - The ID of the requisition to clean.
 */
async function deepCleanRequisition(tx: Prisma.TransactionClient, requisitionId: string) {
    const quotationsToDelete = await tx.quotation.findMany({
        where: { requisitionId },
        include: { scores: { include: { itemScores: { include: { scores: true } } } } }
    });

    const scoreSetIds = quotationsToDelete.flatMap(q => q.scores.map(s => s.id));
    const itemScoreIds = quotationsToDelete.flatMap(q => q.scores.flatMap(s => s.itemScores.map(i => i.id)));

    if (itemScoreIds.length > 0) {
        await tx.score.deleteMany({ where: { itemScoreId: { in: itemScoreIds } } });
    }
    if (scoreSetIds.length > 0) {
        await tx.itemScore.deleteMany({ where: { scoreSetId: { in: scoreSetIds } } });
    }
    if (scoreSetIds.length > 0) {
        await tx.committeeScoreSet.deleteMany({ where: { id: { in: scoreSetIds } } });
    }
    await tx.quotation.deleteMany({ where: { requisitionId } });
    
    await tx.committeeAssignment.deleteMany({ where: { requisitionId }});
    await tx.standbyAssignment.deleteMany({ where: { requisitionId } });
    
    // Also clear per-item award details from items
    await tx.requisitionItem.updateMany({
        where: { requisitionId: requisitionId },
        data: { perItemAwardDetails: Prisma.JsonNull }
    });

    await tx.purchaseRequisition.update({
        where: { id: requisitionId },
        data: {
            status: 'PreApproved',
            currentApproverId: null,
            deadline: null,
            scoringDeadline: null,
            awardResponseDeadline: null,
            awardedQuoteItemIds: [],
            committeeName: null,
            committeePurpose: null,
            financialCommitteeMembers: { set: [] },
            technicalCommitteeMembers: { set: [] },
        }
    });
}


/**
 * Handles the logic when a vendor rejects an award. It updates the quote and requisition status,
 * setting the stage for a manual promotion of a standby vendor.
 * @param tx - Prisma transaction client.
 * @param quote - The quote that was rejected.
 * @param requisition - The associated requisition.
 * @param actor - The user performing the action.
 * @param declinedItemIds - The specific requisition item IDs that were declined (for per-item awards).
 * @returns A message indicating the result of the operation.
 */
export async function handleAwardRejection(
    tx: Prisma.TransactionClient, 
    quote: any, 
    requisition: any,
    actor: any,
    declinedItemIds: string[] = []
) {
    const awardStrategy = (requisition.rfqSettings as any)?.awardStrategy;
    
    if (awardStrategy === 'item') {
        let itemsUpdated = 0;
        for (const itemId of declinedItemIds) {
            const reqItem = await tx.requisitionItem.findUnique({ where: { id: itemId }});
            if (!reqItem || !reqItem.perItemAwardDetails) continue;

            const awardDetails = reqItem.perItemAwardDetails as PerItemAwardDetail[];
            let hasBeenUpdated = false;
            
            const updatedDetails = awardDetails.map(d => {
                if (d.vendorId === quote.vendorId && d.status === 'Awarded') {
                    hasBeenUpdated = true;
                    return { ...d, status: 'Declined' as const };
                }
                return d;
            });
            
            if (hasBeenUpdated) {
                await tx.requisitionItem.update({
                    where: { id: reqItem.id },
                    data: { perItemAwardDetails: updatedDetails as any }
                });
                itemsUpdated++;
            }
        }
        
        if (itemsUpdated > 0) {
            await tx.purchaseRequisition.update({ where: { id: requisition.id }, data: { status: 'Award_Declined' } });
            await tx.auditLog.create({ 
                data: { 
                    timestamp: new Date(), 
                    user: { connect: { id: actor.id } }, 
                    action: 'DECLINE_AWARD', 
                    entity: 'Requisition', 
                    entityId: requisition.id, 
                    details: `Vendor ${quote.vendorName} declined the award for ${itemsUpdated} item(s). Manual promotion of standby is now possible.`, 
                    transactionId: requisition.transactionId 
                } 
            });
            return { message: 'Per-item award has been declined. A standby vendor can now be manually promoted.' };
        }
        
        throw new Error("No awarded items found for this vendor to decline.");

    } else { // Single Vendor Strategy
        await tx.quotation.update({ where: { id: quote.id }, data: { status: 'Declined' } });
        
        await tx.auditLog.create({ 
            data: { 
                timestamp: new Date(), 
                user: { connect: { id: actor.id } }, 
                action: 'DECLINE_AWARD', 
                entity: 'Quotation', 
                entityId: quote.id, 
                details: `Vendor declined award.`, 
                transactionId: requisition.transactionId 
            } 
        });

        const hasStandby = await tx.quotation.count({
            where: { requisitionId: requisition.id, status: 'Standby' }
        });

        if (hasStandby > 0) {
            await tx.purchaseRequisition.update({
                where: { id: requisition.id },
                data: { status: 'Award_Declined' }
            });
            return { message: 'Award declined. A standby vendor is available for promotion.' };
        } else {
             await tx.auditLog.create({ 
                data: { 
                    timestamp: new Date(), 
                    action: 'AUTO_RESET_RFQ', 
                    entity: 'Requisition', 
                    entityId: requisition.id, 
                    details: 'Award was declined and no standby vendors were available. The RFQ process has been automatically reset.', 
                    transactionId: requisition.transactionId 
                } 
            });
            await deepCleanRequisition(tx, requisition.id);
            return { message: 'Award declined. No standby vendors available. Requisition has been automatically reset for a new RFQ process.' };
        }
    }
}


/**
 * Promotes the next standby vendor(s) and starts their approval workflow.
 * This function handles both single-vendor and per-item award strategies.
 * @param tx - Prisma transaction client.
 * @param requisitionId - The ID of the requisition.
 * @param actor - The user performing the action.
 * @returns A message indicating the result of the operation.
 */
export async function promoteStandbyVendor(tx: Prisma.TransactionClient, requisitionId: string, actor: any) {
    const requisition = await tx.purchaseRequisition.findUnique({
        where: { id: requisitionId },
        include: { items: true, quotations: { include: { scores: { include: { itemScores: true } }, items: true } } }
    });

    if (!requisition) {
        throw new Error('Associated requisition not found.');
    }
    
    const awardStrategy = (requisition.rfqSettings as any)?.awardStrategy;

    if (awardStrategy === 'item') {
        let promotedCount = 0;
        let auditDetailsMessage = 'Promoted standby vendors: ';

        const itemUpdates = [];

        // 1. Iterate through each item to find opportunities for promotion
        for (const item of requisition.items) {
            const currentDetails = (item.perItemAwardDetails as PerItemAwardDetail[] | null) || [];
            const hasDeclinedWinner = currentDetails.some(d => d.status === 'Declined');

            if (hasDeclinedWinner) {
                const standbyToPromote = currentDetails
                    .filter(d => d.status === 'Standby')
                    .sort((a, b) => (a.rank || 99) - (b.rank || 99))[0]; // Get highest-ranked standby

                if (standbyToPromote) {
                    const updatedDetails = currentDetails.map(d => {
                        if (d.vendorId === standbyToPromote.vendorId && d.rank === standbyToPromote.rank) {
                            promotedCount++;
                            auditDetailsMessage += `${d.vendorName} for item ${item.name}. `;
                            return { ...d, status: 'Pending_Award' as const };
                        }
                        if (d.status === 'Declined') {
                            return { ...d, status: 'Failed_to_Award' as const };
                        }
                        return d;
                    });
                    itemUpdates.push(tx.requisitionItem.update({
                        where: { id: item.id },
                        data: { perItemAwardDetails: updatedDetails as any }
                    }));
                } else {
                     const updatedDetails = currentDetails.map(d => 
                        d.status === 'Declined' ? { ...d, status: 'Failed_to_Award' as const } : d
                    );
                    itemUpdates.push(tx.requisitionItem.update({
                        where: { id: item.id },
                        data: { perItemAwardDetails: updatedDetails as any }
                    }));
                }
            }
        }
        
        if (itemUpdates.length > 0) {
            await Promise.all(itemUpdates);
        }

        if (promotedCount === 0) {
            await tx.purchaseRequisition.update({ where: { id: requisitionId }, data: { status: 'Scoring_Complete' }});
            return { message: 'No more standby vendors available for any declined items. The award process is now complete for this requisition.'};
        }

        // 2. Recalculate total value based on the new state
        const updatedRequisition = await tx.purchaseRequisition.findUnique({ where: {id: requisitionId}, include: { items: true }});
        if (!updatedRequisition) throw new Error("Could not refetch requisition for value calculation.");

        let newTotalValue = 0;
        for (const item of updatedRequisition.items) {
             const details = (item.perItemAwardDetails as PerItemAwardDetail[] | null) || [];
             const winningAward = details.find(d => d.status === 'Pending_Award' || d.status === 'Accepted');
             if (winningAward) {
                 newTotalValue += winningAward.unitPrice * item.quantity;
             }
        }

        // 3. Get the next approval step and route the requisition
        const { nextStatus, nextApproverId, auditDetails } = await getNextApprovalStep(tx, newTotalValue);

        await tx.purchaseRequisition.update({
            where: { id: requisitionId },
            data: {
                status: nextStatus as any,
                currentApproverId: nextApproverId,
                totalPrice: newTotalValue,
            }
        });
        
        await tx.auditLog.create({
            data: {
                user: { connect: { id: actor.id } },
                action: 'PROMOTE_STANDBY',
                entity: 'Requisition',
                entityId: requisition.id,
                details: `${auditDetailsMessage} ${auditDetails}`,
                transactionId: requisition.transactionId
            }
        });

        return { message: `Promoted ${promotedCount} standby award(s). Re-routing for approval.` };

    } else { // Single Vendor Strategy
        // **FIX START**: Correctly find the next best standby vendor by score
        const standbyQuotes = await tx.quotation.findMany({
            where: { requisitionId, status: 'Standby' },
            orderBy: { finalAverageScore: 'desc' }, // Sort by score, highest first
        });

        const nextStandby = standbyQuotes[0];
        // **FIX END**

        if (!nextStandby) {
            throw new Error('No standby vendor found to promote.');
        }

        // --- Champion Bid Recalculation for Promoted Vendor ---
        const standbyQuoteDetails = requisition.quotations.find(q => q.id === nextStandby.id);
        if(!standbyQuoteDetails) throw new Error("Could not find full quote details for standby vendor.");

        let newTotalValue = 0;
        const newAwardedItemIds: string[] = [];

        for (const reqItem of requisition.items) {
            const proposalsForItem = standbyQuoteDetails.items.filter(i => i.requisitionItemId === reqItem.id);
            if (proposalsForItem.length === 0) continue;

            let bestProposalScore = -1;
            let championBid: QuoteItem | null = null;

            for (const proposal of proposalsForItem) {
                let currentProposalScore = 0;
                let scorerCount = 0;
                for (const scoreSet of standbyQuoteDetails.scores) {
                    const itemScore = scoreSet.itemScores.find(is => is.quoteItemId === proposal.id);
                    if (itemScore) {
                        currentProposalScore += itemScore.finalScore;
                        scorerCount++;
                    }
                }
                const avgScore = scorerCount > 0 ? currentProposalScore / scorerCount : 0;
                if (avgScore > bestProposalScore) {
                    bestProposalScore = avgScore;
                    championBid = proposal as any;
                }
            }
            
            if (championBid) {
                newTotalValue += championBid.unitPrice * championBid.quantity;
                newAwardedItemIds.push(championBid.id);
            }
        }

        if (newAwardedItemIds.length === 0) {
            throw new Error("Could not determine champion bids for the promoted standby vendor.");
        }
        // --- End Recalculation ---
        
        const { nextStatus, nextApproverId, auditDetails } = await getNextApprovalStep(tx, newTotalValue);
        
        await tx.purchaseRequisition.update({
            where: { id: requisitionId },
            data: {
                status: nextStatus as any,
                totalPrice: newTotalValue,
                currentApproverId: nextApproverId,
                awardedQuoteItemIds: newAwardedItemIds,
            }
        });
        
        await tx.quotation.update({
            where: { id: nextStandby.id },
            data: { status: 'Pending_Award' }
        });
        
        await tx.quotation.updateMany({
            where: { requisitionId: requisitionId, status: 'Declined' },
            data: { status: 'Failed' }
        });
        
        await tx.auditLog.create({
            data: {
                timestamp: new Date(),
                user: { connect: { id: actor.id } },
                action: 'PROMOTE_STANDBY_AWARD',
                entity: 'Requisition',
                entityId: requisitionId,
                details: `Promoted standby vendor ${nextStandby.vendorName}. ${auditDetails}`,
                transactionId: requisitionId,
            }
        });

        return { message: `Promoted ${nextStandby.vendorName}. The award is now being routed for approval.` };
    }
}
