
'use server';

import { Prisma, PrismaClient } from '@prisma/client';
import { User, UserRole, PerItemAwardDetail, QuoteItem, PurchaseRequisition } from '@/lib/types';

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
    const quoteItemIds = quotationsToDelete.flatMap(q => q.items.map(i => i.id));
    
    // Delete in order of dependency
    if (itemScoreIds.length > 0) {
      await tx.score.deleteMany({ where: { itemScoreId: { in: itemScoreIds } } });
    }
    if (scoreSetIds.length > 0) {
      await tx.itemScore.deleteMany({ where: { scoreSetId: { in: scoreSetIds } } });
    }
    if (scoreSetIds.length > 0) {
      await tx.committeeScoreSet.deleteMany({ where: { id: { in: scoreSetIds } } });
    }
    if (quoteItemIds.length > 0) {
        await tx.quoteItem.deleteMany({ where: { id: { in: quoteItemIds } } });
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
    declinedQuoteItemId?: string
) {
    const awardStrategy = (requisition.rfqSettings as any)?.awardStrategy;

    if (awardStrategy === 'item' && declinedQuoteItemId) {
        // --- Per-Item Rejection Logic ---
        const itemToUpdate = requisition.items.find((i: any) => 
            (i.perItemAwardDetails as PerItemAwardDetail[] | undefined)?.some(d => d.quoteItemId === declinedQuoteItemId)
        );

        if (!itemToUpdate) {
            throw new Error(`Could not find a requisition item associated with the rejected quote item ID: ${declinedQuoteItemId}`);
        }
        
        let currentDetails = (itemToUpdate.perItemAwardDetails as PerItemAwardDetail[] || []);
        
        // 1. Mark the declined item as Declined
        currentDetails = currentDetails.map(d => 
            d.quoteItemId === declinedQuoteItemId ? { ...d, status: 'Declined' as const } : d
        );
        
        // Update the database with the 'Declined' status first
        await tx.requisitionItem.update({
            where: { id: itemToUpdate.id },
            data: { perItemAwardDetails: currentDetails as any }
        });

        // Set the main requisition status to indicate an action is needed
        await tx.purchaseRequisition.update({
            where: { id: requisition.id },
            data: { status: 'Award_Declined' }
        });
        
        await tx.auditLog.create({ data: { timestamp: new Date(), user: { connect: { id: actor.id } }, action: 'DECLINE_AWARD', entity: 'RequisitionItem', entityId: itemToUpdate.id, details: `Vendor ${quote.vendorName} declined award for item '${itemToUpdate.name}'. Awaiting manual promotion.`, transactionId: requisition.transactionId } });
        
        return { message: `Award for '${itemToUpdate.name}' declined. Ready for standby promotion.` };
        
    } else { 
        // --- Single Vendor Rejection Logic ---
        await tx.quotation.update({ where: { id: quote.id }, data: { status: 'Declined' } });
        
        await tx.auditLog.create({ data: { timestamp: new Date(), user: { connect: { id: actor.id } }, action: 'DECLINE_AWARD', entity: 'Quotation', entityId: quote.id, details: `Vendor declined award for requisition ${requisition.id}.`, transactionId: requisition.transactionId } });

        await tx.purchaseRequisition.update({
            where: { id: requisition.id },
            data: { status: 'Award_Declined' }
        });
        return { message: 'Award declined. A standby vendor is available for manual promotion.' };
    }
}
