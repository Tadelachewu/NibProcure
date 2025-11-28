
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
 * Finds the correct PREVIOUS approval step for a given requisition when it is rejected.
 * @param tx - Prisma transaction client.
 * @param requisition - The full requisition object.
 * @param actor - The user performing the rejection.
 * @param reason - The reason for rejection.
 * @returns An object with the previous status, previous approver ID, and a detailed audit message.
 */
export async function getPreviousApprovalStep(tx: Prisma.TransactionClient, requisition: any, actor: User, reason: string) {
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

    if (!relevantTier || relevantTier.steps.length === 0) {
        // No defined steps, rejection sends it back to scoring
        return {
            previousStatus: 'Scoring_Complete',
            previousApproverId: null,
            auditDetails: `Award rejected by ${(actor.roles as any[]).map(r=>r.name).join(', ')}. No approval tier found, returning to scoring.`
        };
    }
    
    const currentStepIndex = relevantTier.steps.findIndex(step => 
        `Pending_${step.role.name}` === requisition.status
    );

    if (currentStepIndex <= 0) {
        // This is the first step in the chain. Rejection reverts to Scoring_Complete.
        return {
            previousStatus: 'Scoring_Complete',
            previousApproverId: null, // Unassign it
            auditDetails: `Award rejected at first step by ${(actor.roles as any[]).map(r=>r.name).join(', ')}. Requisition returned to 'Scoring Complete' for re-evaluation. Reason: "${reason}"`
        };
    }
    
    const previousStep = relevantTier.steps[currentStepIndex - 1];
    const previousRoleName = previousStep.role.name;
    const previousStatus = `Pending_${previousRoleName}`;
    
    let previousApproverId: string | null = null;
    if (!previousRoleName.includes('Committee')) {
        const previousApprover = await tx.user.findFirst({ where: { roles: { some: { name: previousRoleName } } }});
        previousApproverId = previousApprover?.id || null;
    }

    const actorRoles = (actor.roles as any[]).map(r => r.name).join(', ').replace(/_/g, ' ');
    return {
        previousStatus,
        previousApproverId,
        auditDetails: `Award rejected by ${actorRoles}. Sent back to previous step: ${previousRoleName.replace(/_/g, ' ')}. Reason: "${reason}"`
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

export async function handleAwardRejection(
    tx: Prisma.TransactionClient, 
    quote: any, 
    requisition: any,
    actor: any,
    quoteItemId?: string
) {
    const awardStrategy = (requisition.rfqSettings as any)?.awardStrategy;
    
    if (awardStrategy === 'item') {
        if (!quoteItemId) {
            throw new Error('A quoteItemId is required to reject a specific per-item award.');
        }

        const declinedQuoteItem = quote.items.find((i: any) => i.id === quoteItemId);
        if (!declinedQuoteItem) {
            throw new Error(`Could not find the specific quote item (${quoteItemId}) within the provided quotation.`);
        }

        const itemToUpdate = requisition.items.find((i: any) => i.id === declinedQuoteItem.requisitionItemId);
        
        if (!itemToUpdate) {
            throw new Error(`Could not find a requisition item associated with the rejected quote item ID: ${quoteItemId}`);
        }
        
        const updatedDetails = (itemToUpdate.perItemAwardDetails as PerItemAwardDetail[]).map(d => 
            d.quoteItemId === quoteItemId ? { ...d, status: 'Failed_to_Award' as const } : d
        );
        
        await tx.requisitionItem.update({
            where: { id: itemToUpdate.id },
            data: { perItemAwardDetails: updatedDetails }
        });
        
        await tx.auditLog.create({ 
            data: { 
                timestamp: new Date(), 
                user: { connect: { id: actor.id } }, 
                action: 'DECLINE_AWARD', 
                entity: 'Requisition', 
                entityId: requisition.id, 
                details: `Vendor ${quote.vendorName} declined the award for item ${itemToUpdate.name}. Manual promotion of standby is now required.`, 
                transactionId: requisition.transactionId 
            } 
        });

        await tx.purchaseRequisition.update({
            where: { id: requisition.id },
            data: { status: 'Award_Declined' }
        });

        return { message: `Award for item ${itemToUpdate.name} declined. The Procurement Officer must now manually promote a standby vendor.` };

    } else {
        await tx.quotation.update({ where: { id: quote.id }, data: { status: 'Declined' } });
        
        await tx.auditLog.create({ 
            data: { 
                timestamp: new Date(), 
                user: { connect: { id: actor.id } }, 
                action: 'DECLINE_AWARD', 
                entity: 'Quotation', 
                entityId: quote.id, 
                details: `Vendor declined award. Manual promotion of standby is now required.`, 
                transactionId: requisition.transactionId 
            } 
        });
        
        await tx.purchaseRequisition.update({
            where: { id: requisition.id },
            data: { status: 'Award_Declined' }
        });

        return { message: 'Award declined. The Procurement Officer must now manually promote a standby vendor.' };
    }
}

export async function promoteStandbyVendor(tx: Prisma.TransactionClient, requisitionId: string, actor: any) {
    const requisition = await tx.purchaseRequisition.findUnique({
        where: { id: requisitionId },
        include: { items: true, quotations: { include: { items: true } } }
    });

    if (!requisition) {
        throw new Error('Associated requisition not found.');
    }

    const awardStrategy = (requisition.rfqSettings as any)?.awardStrategy;
    let auditDetailsMessage = 'Promoted standby vendors: ';
    
    if (awardStrategy === 'item') {
        let promotedCount = 0;
        
        const itemsWithDeclinedAwards = await tx.requisitionItem.findMany({
            where: {
                requisitionId: requisitionId,
                perItemAwardDetails: {
                    path: ['status'],
                    array_contains: 'Declined',
                }
            }
        });
        

        for (const item of itemsWithDeclinedAwards) {
            const currentDetails = (item.perItemAwardDetails as PerItemAwardDetail[] | null) || [];
            
            const alreadyFailedOrDeclinedVendorIds = new Set(
                currentDetails.filter(d => d.status === 'Failed_to_Award' || d.status === 'Declined').map(d => d.vendorId)
            );

            const bidToPromote = currentDetails
                .filter(d => d.status === 'Standby' && !alreadyFailedOrDeclinedVendorIds.has(d.vendorId))
                .sort((a, b) => a.rank - b.rank)[0];

            if (bidToPromote) {
                promotedCount++;
                auditDetailsMessage += `${bidToPromote.vendorName} for item ${item.name}. `;
                
                const updatedDetails = currentDetails.map(d => {
                    if (d.quoteItemId === bidToPromote.quoteItemId) {
                        return { ...d, status: 'Pending_Award' as const };
                    }
                    if (d.status === 'Declined') {
                        return { ...d, status: 'Failed_to_Award' as const };
                    }
                    return d;
                });
                await tx.requisitionItem.update({ where: { id: item.id }, data: { perItemAwardDetails: updatedDetails as any }});
            } else {
                 const updatedDetails = currentDetails.map(d => d.status === 'Declined' ? { ...d, status: 'Failed_to_Award' as const } : d);
                 await tx.requisitionItem.update({ where: { id: item.id }, data: { perItemAwardDetails: updatedDetails as any }});
            }
        }
        
        if (promotedCount === 0) {
            const remainingPendingItems = await tx.requisitionItem.count({
                where: {
                    requisitionId: requisitionId,
                    perItemAwardDetails: {
                        path: ['status'],
                        array_contains: 'Pending_Award',
                    }
                }
            });
            if (remainingPendingItems === 0) {
                 await tx.purchaseRequisition.update({ where: { id: requisitionId }, data: { status: 'Scoring_Complete' }});
                 return { message: 'No eligible standby vendors found and no pending awards remain. Requisition has returned to Scoring Complete status.' };
            }
        }

    } else {
        await tx.quotation.updateMany({ where: { requisitionId, status: 'Declined' }, data: { status: 'Failed_to_Award' } });
        const nextStandby = await tx.quotation.findFirst({
            where: { requisitionId, status: 'Standby' },
            orderBy: { rank: 'asc' },
        });

        if (!nextStandby) {
            await tx.purchaseRequisition.update({ where: { id: requisitionId }, data: { status: 'Scoring_Complete' }});
            return { message: 'No more standby vendors available. Requisition has returned to Scoring Complete status.' };
        }
        await tx.quotation.update({ where: { id: nextStandby.id }, data: { status: 'Pending_Award' } });
        auditDetailsMessage += `${nextStandby.vendorName}. `;
    }
    
    const updatedRequisition = await tx.purchaseRequisition.findUnique({ where: { id: requisitionId }, include: { items: true, quotations: {include: {items: true}} } });
    if (!updatedRequisition) throw new Error("Could not refetch requisition.");

    let newTotalValue = 0;
     if (awardStrategy === 'item') {
        for (const item of updatedRequisition.items) {
            const winningAward = (item.perItemAwardDetails as PerItemAwardDetail[] || []).find(d => d.status === 'Pending_Award' || d.status === 'Accepted');
            if (winningAward) {
                newTotalValue += winningAward.unitPrice * item.quantity;
            }
        }
    } else {
        const winningQuote = updatedRequisition.quotations.find(q => q.status === 'Pending_Award' || q.status === 'Accepted');
        if (winningQuote) newTotalValue = winningQuote.totalPrice;
    }

    const { nextStatus, nextApproverId, auditDetails } = await getNextApprovalStep(tx, { ...updatedRequisition, totalPrice: newTotalValue }, actor);

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
            details: `Manual promotion triggered. ${auditDetailsMessage} ${auditDetails}`,
            transactionId: requisition.transactionId
        }
    });

    return { message: `Successfully promoted standby vendor(s). Re-routing for approval.` };
}
