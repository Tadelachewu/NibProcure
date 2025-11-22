

'use server';

import { Prisma, PrismaClient } from '@prisma/client';
import { User, UserRole, PerItemAwardDetail, QuoteItem } from '@/lib/types';

/**
 * Finds the correct next approval step for a given requisition based on its current status and value.
 * @param tx - Prisma transaction client.
 * @param requisition - The full requisition object.
 * @param actor - The user performing the current approval.
 * @returns An object with the next status, next approver ID, and a detailed audit message.
 */
export async function getNextApprovalStep(tx: Prisma.TransactionClient, requisition: any, actor: User) {
    const totalAwardValue = requisition.totalPrice;
    
    const approvalMatrix = await tx.approvalThreshold.findMany({
      include: {
        steps: {
          include: { role: { select: { name: true } } },
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
            auditDetails: `Award value ${totalAwardValue.toLocaleString()} ETB falls into "${relevantTier.name}" tier which has no approval steps. Auto-approved for vendor notification.`
        };
    }
    
    const currentStepIndex = relevantTier.steps.findIndex(step => {
        // Find the step that corresponds to the requisition's CURRENT status.
        return `Pending_${step.role.name}` === requisition.status;
    });

    let nextStepIndex = currentStepIndex + 1;
    
    // If the requisition isn't in a pending state found in the matrix, it means this is the first approval for this tier.
    if (currentStepIndex === -1) {
        nextStepIndex = 0;
    }


    while(nextStepIndex < relevantTier.steps.length) {
        const nextStep = relevantTier.steps[nextStepIndex];
        const nextRoleName = nextStep.role.name;
        
        // Dynamically create the pending status. This is the core fix.
        const nextStatus = `Pending_${nextRoleName}`;
        
        // Find a user for the next step. Committee roles don't get a specific approver ID.
        let nextApproverId: string | null = null;
        if (!nextRoleName.includes('Committee')) {
            const approverUser = await tx.user.findFirst({ where: { roles: { some: { name: nextRoleName } } }});
            if (!approverUser) {
                // If a specific approver role is not found (e.g. "President"), we should not throw an error, but rather log a warning.
                // In a real system, there should be robust error handling or fallback mechanisms.
                console.warn(`Could not find a user for the role: ${nextRoleName.replace(/_/g, ' ')}. The approval will be unassigned.`);
            } else {
                 nextApproverId = approverUser.id;
            }
        }

        const actorRoles = (actor.roles as any[]).map(r => r.name).join(', ').replace(/_/g, ' ');
        return {
            nextStatus,
            nextApproverId,
            auditDetails: `Award approved by ${actorRoles}. Advanced to ${nextRoleName.replace(/_/g, ' ')}.`
        };
    }

    // If we've gone through all the steps, it's the final approval for this tier.
    const actorRoles = (actor.roles as any[]).map(r => r.name).join(', ').replace(/_/g, ' ');
    return {
        nextStatus: 'PostApproved',
        nextApproverId: null,
        auditDetails: `Final award approval for requisition ${requisition.id} granted by ${actorRoles}. Ready for vendor notification.`
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
 * @returns A message indicating the result of the operation.
 */
export async function handleAwardRejection(
    tx: Prisma.TransactionClient, 
    quote: any, 
    requisition: any,
    actor: any,
    declinedItemIds: string[] = [],
    rejectedQuoteItemId?: string
) {
    const awardStrategy = (requisition.rfqSettings as any)?.awardStrategy;
    
    if (awardStrategy === 'item') {
        let itemsUpdated = 0;
        for (const reqItem of requisition.items) {
            // This item is not one of the declined ones, so skip it
            if (!declinedItemIds.includes(reqItem.id)) continue;

            const awardDetails = (reqItem.perItemAwardDetails as PerItemAwardDetail[] | null) || [];
            let hasBeenUpdated = false;
            
            const updatedDetails = awardDetails.map(d => {
                // Find the specific award that was just rejected by the vendor
                if (d.vendorId === quote.vendorId && d.status === 'Awarded' && (!rejectedQuoteItemId || d.quoteItemId === rejectedQuoteItemId)) {
                    hasBeenUpdated = true;
                    console.log(`[handleAwardRejection] Vendor ${quote.vendorName} rejected item ${reqItem.name}. Setting status to Declined.`);
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
            
            // Now, immediately try to promote a standby vendor
            return await promoteStandbyVendor(tx, requisition.id, actor, declinedItemIds);

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

        // Immediately try to promote a standby
        return await promoteStandbyVendor(tx, requisition.id, actor);
    }
}


/**
 * Promotes the next standby vendor(s) and starts their approval workflow.
 * This function handles both single-vendor and per-item award strategies.
 * @param tx - Prisma transaction client.
 * @param requisitionId - The ID of the requisition.
 * @param actor - The user performing the action.
 * @param specificItemIds - Optional array of item IDs to focus on for per-item promotion.
 * @returns A message indicating the result of the operation.
 */
export async function promoteStandbyVendor(
    tx: Prisma.TransactionClient, 
    requisitionId: string, 
    actor: any,
    specificItemIds?: string[]
) {
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

        // If specificItemIds are provided, only look at those. Otherwise, check all items.
        const itemsToCheck = specificItemIds 
            ? requisition.items.filter(i => specificItemIds.includes(i.id))
            : requisition.items;

        for (const item of itemsToCheck) {
            const currentDetails = (item.perItemAwardDetails as PerItemAwardDetail[] | null) || [];
            const hasDeclined = currentDetails.some(d => d.status === 'Declined');
            
            if (hasDeclined) {
                const standbyToPromote = currentDetails
                    .filter(d => d.status === 'Standby')
                    .sort((a, b) => (a.rank || 99) - (b.rank || 99))[0];

                if (standbyToPromote) {
                    const updatedDetails = currentDetails.map(d => {
                        if (d.quoteItemId === standbyToPromote.quoteItemId) {
                            promotedCount++;
                            auditDetailsMessage += `${d.vendorName} for item ${item.name}. `;
                            return { ...d, status: 'Pending_Award' as const };
                        }
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
                     const updatedDetails = currentDetails.map(d => 
                        d.status === 'Declined' ? { ...d, status: 'Failed_to_Award' as const } : d
                    );
                     await tx.requisitionItem.update({
                        where: { id: item.id },
                        data: { perItemAwardDetails: updatedDetails as any }
                    });
                }
            }
        }
        
        if (promotedCount === 0) {
            await tx.purchaseRequisition.update({ where: { id: requisitionId }, data: { status: 'Scoring_Complete' }});
            return { message: 'No more standby vendors available for any declined items. The award process is now complete for this requisition.'};
        }
        
        const updatedReqWithValue = await tx.purchaseRequisition.findUnique({ where: {id: requisitionId}, include: { items: true }});
        if (!updatedReqWithValue) throw new Error("Could not refetch requisition for value calculation.");

        let newTotalValue = 0;
        for (const item of updatedReqWithValue.items) {
             const details = (item.perItemAwardDetails as PerItemAwardDetail[] | null) || [];
             const winningAward = details.find(d => d.status === 'Pending_Award' || d.status === 'Accepted');
             if (winningAward) {
                 newTotalValue += winningAward.unitPrice * item.quantity;
             }
        }
        
        const { nextStatus, nextApproverId, auditDetails } = await getNextApprovalStep(tx, { ...updatedReqWithValue, totalPrice: newTotalValue }, actor);

        await tx.purchaseRequisition.update({
            where: { id: requisitionId },
            data: { status: nextStatus as any, currentApproverId: nextApproverId, totalPrice: newTotalValue }
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
        const standbyQuotes = await tx.quotation.findMany({
            where: { requisitionId, status: 'Standby' },
            orderBy: { rank: 'asc' },
        });

        const nextStandby = standbyQuotes[0];

        if (!nextStandby) {
            await deepCleanRequisition(tx, requisition.id);
            await tx.auditLog.create({ 
                data: { 
                    timestamp: new Date(),
                    user: { connect: { id: actor.id } },
                    action: 'AUTO_RESET_RFQ', 
                    entity: 'Requisition', 
                    entityId: requisition.id, 
                    details: 'Award was declined and no standby vendors were available. The RFQ process has been automatically reset.', 
                    transactionId: requisition.transactionId 
                } 
            });
            return { message: 'No more standby vendors. Requisition has been reset for a new RFQ process.'};
        }
        
        const { nextStatus, nextApproverId, auditDetails } = await getNextApprovalStep(tx, { ...requisition, totalPrice: nextStandby.totalPrice }, actor);
        
        await tx.purchaseRequisition.update({
            where: { id: requisitionId },
            data: { status: nextStatus as any, totalPrice: nextStandby.totalPrice, currentApproverId: nextApproverId }
        });
        
        await tx.quotation.update({ where: { id: nextStandby.id }, data: { status: 'Pending_Award' } });
        
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
