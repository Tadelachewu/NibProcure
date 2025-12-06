
'use server';

import { Prisma, PrismaClient } from '@prisma/client';
import { User, UserRole, PerItemAwardDetail, QuoteItem } from '@/lib/types';

/**
 * Creates the initial review entries in the database for a new approval workflow.
 * @param tx - Prisma transaction client.
 * @param requisition - The full requisition object.
 * @param actor - The user initiating the review process.
 * @returns An object with the next status, next approver ID, and a detailed audit message.
 */
export async function getNextApprovalStep(tx: Prisma.TransactionClient, requisition: any, actor: User) {
    const totalAwardValue = requisition.totalPrice;
    
    const approvalMatrix = await tx.approvalThreshold.findMany({
      include: {
        steps: {
          include: { role: { select: { name: true, id: true } } },
          orderBy: { order: 'asc' }
        }
      },
      orderBy: { min: 'asc' }
    });

    const relevantTier = approvalMatrix.find(tier => 
        totalAwardValue >= tier.min && (tier.max === null || totalAwardValue <= tier.max)
    );

    if (!relevantTier || relevantTier.steps.length === 0) {
        // No steps for this tier, so it's auto-approved.
        await tx.review.create({
            data: {
                requisitionId: requisition.id,
                stepId: 'auto-approved', // Placeholder
                status: 'Approved',
                comment: `Award value ${totalAwardValue.toLocaleString()} ETB falls into tier "${relevantTier?.name || 'Unknown'}" which has no approval steps. Auto-approved.`,
                reviewerId: actor.id,
            }
        });
        return { 
            nextStatus: 'PostApproved', 
            nextApproverId: null, 
            auditDetails: `Award value ${totalAwardValue.toLocaleString()} ETB auto-approved for vendor notification.`
        };
    }
    
    // This is the first step in the chain
    const firstStep = relevantTier.steps[0];
    const firstRoleName = firstStep.role.name;
    const nextStatus = `Pending_${firstRoleName}`; // This status is still useful for a high-level view

    let nextApproverId: string | null = null;
    if (!firstRoleName.includes('Committee')) {
        const approverUser = await tx.user.findFirst({ where: { roles: { some: { name: firstRoleName } } }});
        nextApproverId = approverUser?.id || null;
    }

    // Create the first Review record
    await tx.review.create({
        data: {
            requisitionId: requisition.id,
            stepId: firstStep.id,
            status: 'Pending',
            reviewerId: nextApproverId, // Can be null for committee roles
        }
    });

    const actorRoles = (actor.roles as any[]).map(r => r.name).join(', ').replace(/_/g, ' ');
    return {
        nextStatus,
        nextApproverId, // This might still be useful for notifications
        auditDetails: `Award routed to ${firstRoleName.replace(/_/g, ' ')} for review.`
    };
}


/**
 * Finds the correct PREVIOUS approval step for a given requisition when it is rejected.
 * @param tx - Prisma transaction client.
 * @param requisition - The full requisition object.
 * @param actor - The user performing the rejection.
 * @param reason - The reason for rejection.
 * @returns An object with the previous status, previous approver ID, and a detailed audit message.
 */
export async function getPreviousApprovalStep(tx: Prisma.TransactionClient, requisition: any, actor: User, reason: string) {
    // This function's logic might need to be re-evaluated with the new Review model.
    // For now, rejecting at any stage sends it back to 'Scoring_Complete'.
    
    await tx.review.updateMany({
        where: { requisitionId: requisition.id, status: 'Pending' },
        data: { status: 'Rejected', comment: reason, reviewerId: actor.id }
    });

    return {
        previousStatus: 'Scoring_Complete',
        previousApproverId: null, // Unassign it
        auditDetails: `Award rejected by ${(actor.roles as any[]).map(r=>r.name).join(', ')}. Requisition returned to 'Scoring Complete' for re-evaluation. Reason: "${reason}"`
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
 * @param rejectedQuoteItemId - The specific quote item that was rejected (for per-item awards).
 * @param rejectionReason - The reason for the decline.
 * @returns A message indicating the result of the operation.
 */
export async function handleAwardRejection(
    tx: Prisma.TransactionClient, 
    quote: any, 
    requisition: any,
    actor: any,
    declinedItemIds: string[] = [],
    rejectedQuoteItemId?: string,
    rejectionReason: string = 'No reason provided.'
) {
    const awardStrategy = (requisition.rfqSettings as any)?.awardStrategy;
    
    if (awardStrategy === 'item') {
        let itemsUpdated = 0;
        
        // Find the specific requisition item that was declined
        for (const reqItemId of declinedItemIds) {
            const itemToUpdate = requisition.items.find((item: any) => item.id === reqItemId);

            if (!itemToUpdate) {
                console.warn(`Could not find a requisition item with ID: ${reqItemId}`);
                continue;
            }
            
            const awardDetails = (itemToUpdate.perItemAwardDetails as PerItemAwardDetail[] | null) || [];
            const updatedDetails = awardDetails.map(d => {
                if (d.vendorId === quote.vendorId) { // Mark this vendor's bid for this item as Declined
                    itemsUpdated++;
                    return { ...d, status: 'Declined' as const };
                }
                return d;
            });

            await tx.requisitionItem.update({
                where: { id: itemToUpdate.id },
                data: { perItemAwardDetails: updatedDetails as any }
            });
        }
        
        if (itemsUpdated > 0) {
            // Set main status to Award_Declined immediately.
            await tx.purchaseRequisition.update({ where: { id: requisition.id }, data: { status: 'Award_Declined' } });

            await tx.auditLog.create({ 
                data: { 
                    timestamp: new Date(), 
                    user: { connect: { id: actor.id } }, 
                    action: 'DECLINE_AWARD', 
                    entity: 'Requisition', 
                    entityId: requisition.id, 
                    details: `Award for ${itemsUpdated} item(s) was declined by ${actor.name} (Role: ${(actor.roles as any[]).map(r=>r.name).join(', ')}). Reason: ${rejectionReason}. Manual promotion of standby is now possible.`, 
                    transactionId: requisition.transactionId 
                } 
            });
            return { message: 'Per-item award has been declined. A standby vendor can now be manually promoted.' };
        }
        
        throw new Error("No awarded items found for this vendor to decline.");

    } else { // Single Vendor Strategy
        await tx.quotation.update({ where: { id: quote.id }, data: { status: 'Declined', rejectionReason } });
        
        await tx.auditLog.create({ 
            data: { 
                timestamp: new Date(), 
                user: { connect: { id: actor.id } }, 
                action: 'DECLINE_AWARD', 
                entity: 'Quotation', 
                entityId: quote.id, 
                details: `Award declined by ${actor.name}. Reason: ${rejectionReason}`, 
                transactionId: requisition.transactionId 
            } 
        });

        // Always set the status to Award_Declined to reflect the latest event.
        // The UI will handle allowing other actions to continue.
        await tx.purchaseRequisition.update({
            where: { id: requisition.id },
            data: { status: 'Award_Declined' }
        });
        
        const hasStandby = await tx.quotation.count({
            where: { requisitionId: requisition.id, status: 'Standby' }
        });

        if (hasStandby > 0) {
            return { message: 'Award declined. A standby vendor is available for promotion.' };
        } else {
             await tx.auditLog.create({ 
                data: { 
                    timestamp: new Date(), 
                    action: 'AUTO_RESET_RFQ', 
                    entity: 'Requisition', 
                    entityId: requisition.id, 
                    details: 'Award was declined and no standby vendors were available. The RFQ process has been automatically reset.', 
                    transactionId: requisition.transactionId,
                    user: { connect: { id: actor.id } },
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
        include: { items: true, quotations: { include: { scores: true, items: true } } }
    });

    if (!requisition) {
        throw new Error('Associated requisition not found.');
    }
    
    const awardStrategy = (requisition.rfqSettings as any)?.awardStrategy;

    if (awardStrategy === 'item') {
        let promotedCount = 0;
        let auditDetailsMessage = 'Promoted standby vendors: ';

        // Find all items that have a bid in 'Declined' status.
        const itemsNeedingPromotion = requisition.items.filter(item => 
            (item.perItemAwardDetails as PerItemAwardDetail[] | undefined)?.some(d => d.status === 'Declined')
        );

        if (itemsNeedingPromotion.length === 0) {
            throw new Error("Could not find any items with a 'Declined' status to trigger a promotion.");
        }

        for (const item of itemsNeedingPromotion) {
            const currentDetails = (item.perItemAwardDetails as PerItemAwardDetail[] | null) || [];
            
            // Build a list of ineligible QUOTE ITEM IDs that have already failed.
            const ineligibleQuoteItemIds = new Set(
                currentDetails.filter(d => d.status === 'Failed_to_Award' || d.status === 'Declined').map(d => d.quoteItemId)
            );

            // Find the next eligible standby vendor.
            const bidToPromote = currentDetails
                .filter(d => d.status === 'Standby' && !ineligibleQuoteItemIds.has(d.quoteItemId))
                .sort((a, b) => a.rank - b.rank)[0]; // Get the one with the lowest rank (e.g., 2 then 3)
            
            if (bidToPromote) {
                promotedCount++;
                auditDetailsMessage += `${bidToPromote.vendorName} for item ${item.name}. `;
                
                const updatedDetails = currentDetails.map(d => {
                    if (d.quoteItemId === bidToPromote.quoteItemId) {
                        return { ...d, status: 'Pending_Award' as const };
                    }
                    // Mark the just-declined bid as failed so it's not picked again
                    if (d.status === 'Declined') {
                        return { ...d, status: 'Failed_to_Award' as const };
                    }
                    return d;
                });

                await tx.requisitionItem.update({
                    where: { id: item.id },
                    data: { perItemAwardDetails: updatedDetails as any }
                });
            } else {
                // No more standby vendors for this item.
                 const updatedDetails = currentDetails.map(d => 
                    d.status === 'Declined' ? { ...d, status: 'Failed_to_Award' as const } : d
                );
                 await tx.requisitionItem.update({
                    where: { id: item.id },
                    data: { perItemAwardDetails: updatedDetails as any }
                });
            }
        }
        
        if (promotedCount === 0) {
            return { message: 'No eligible standby vendors were found for promotion. Please review the awards.' };
        }
        
        // After all promotions, refetch the state to calculate new total and get next approval step.
        const updatedRequisition = await tx.purchaseRequisition.findUnique({ where: {id: requisitionId}, include: { items: true }});
        if (!updatedRequisition) throw new Error("Could not refetch requisition for value calculation.");

        let newTotalValue = 0;
        for (const item of updatedRequisition.items) {
             const details = (item.perItemAwardDetails as PerItemAwardDetail[] | null) || [];
             const newlyPendingAward = details.find(d => d.status === 'Pending_Award');
             if (newlyPendingAward) {
                 newTotalValue += newlyPendingAward.unitPrice * item.quantity;
             }
        }
        
        const { nextStatus, nextApproverId, auditDetails } = await getNextApprovalStep(tx, { ...updatedRequisition, totalPrice: newTotalValue }, actor);

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
                timestamp: new Date(),
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
        const declinedQuote = await tx.quotation.findFirst({
             where: { requisitionId: requisitionId, status: 'Declined' }
        });
        
        if (!declinedQuote) {
             throw new Error("Could not find a declined quote to trigger a promotion. The requisition may be in an inconsistent state.");
        }

        await tx.quotation.update({
            where: { id: declinedQuote.id },
            data: { status: 'Failed' }
        });

        const nextStandby = await tx.quotation.findFirst({
            where: { requisitionId, status: 'Standby' },
            orderBy: { rank: 'asc' },
            include: { items: true }
        });

        if (!nextStandby) {
            await tx.purchaseRequisition.update({ where: { id: requisitionId }, data: { status: 'Scoring_Complete' }});
            await tx.auditLog.create({
                data: {
                    timestamp: new Date(),
                    user: { connect: { id: actor.id } },
                    action: 'AWARD_FAILURE',
                    entity: 'Requisition',
                    entityId: requisition.id,
                    details: `All standby vendors were exhausted. Requisition returned to Scoring Complete status for re-evaluation.`,
                    transactionId: requisition.transactionId
                }
            });
            return { message: 'No more standby vendors available. Requisition has returned to Scoring Complete status.'};
        }
        
        const newTotalValue = nextStandby.items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
        
        const { nextStatus, nextApproverId, auditDetails } = await getNextApprovalStep(tx, { ...requisition, totalPrice: newTotalValue }, actor);
        
        await tx.purchaseRequisition.update({
            where: { id: requisitionId },
            data: {
                status: nextStatus as any,
                totalPrice: newTotalValue,
                currentApproverId: nextApproverId,
                awardedQuoteItemIds: nextStandby.items.map(i => i.id),
            }
        });
        
        await tx.quotation.update({
            where: { id: nextStandby.id },
            data: { status: 'Pending_Award' }
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
