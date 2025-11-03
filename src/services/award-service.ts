
'use server';

import { Prisma, PrismaClient } from '@prisma/client';
import { User, UserRole, Quotation, PurchaseRequisition } from '@/lib/types';

/**
 * Finds the correct initial status and approver for a given value tier.
 * @param tx - Prisma transaction client.
 * @param totalAwardValue - The value of the award.
 * @returns An object with the next status and approver ID.
 */
export async function getNextApprovalStep(tx: Prisma.TransactionClient, totalAwardValue: number) {
    const approvalMatrix = await tx.approvalThreshold.findMany({ 
        include: { steps: { orderBy: { order: 'asc' } } }, 
        orderBy: { min: 'asc' }
    });

    const relevantTier = approvalMatrix.find(tier => 
        totalAwardValue >= tier.min && (tier.max === null || totalAwardValue <= tier.max)
    );

    if (!relevantTier) {
        throw new Error(`No approval tier found for an award value of ${totalAwardValue.toLocaleString()} ETB.`);
    }

    if (relevantTier.steps.length === 0) {
        // If there are no steps, it's immediately approved for notification.
        return { 
            nextStatus: 'PostApproved', 
            nextApproverId: null, 
            auditDetails: `Award value ${totalAwardValue.toLocaleString()} ETB falls into "${relevantTier.name}" tier, which has no approval steps. Approved for vendor notification.`
        };
    }

    const firstStep = relevantTier.steps[0];
    const getNextStatusFromRole = (role: string): string => `Pending_${role.replace(/ /g, '_')}`;
    
    const nextStatus = getNextStatusFromRole(firstStep.role);
    let nextApproverId: string | null = null;
    
    // Assign an approver only if it's a specific user role, not a general committee role.
    if (!firstStep.role.includes('Committee')) {
        const approverUser = await tx.user.findFirst({ where: { role: firstStep.role }});
        if (!approverUser) {
            // This is a configuration error, so we should throw.
            throw new Error(`Could not find a user for the role: ${firstStep.role.replace(/_/g, ' ')}`);
        }
        nextApproverId = approverUser.id;
    }

    return { 
        nextStatus, 
        nextApproverId,
        auditDetails: `Award value ${totalAwardValue.toLocaleString()} ETB falls into "${relevantTier.name}" tier. Routing to ${firstStep.role.replace(/_/g, ' ')} for approval.`
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
    
    await tx.committeeAssignment.deleteMany({ where: { requisitionId } });

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
 * promoting a standby if one is available, or resetting the RFQ if not.
 * @param tx - Prisma transaction client.
 * @param quote - The quote that was rejected.
 * @param requisition - The associated requisition.
 * @param actor - The user performing the action.
 * @param declinedItemIds - The specific requisition item IDs that were declined.
 * @returns A message indicating the result of the operation.
 */
export async function handleAwardRejection(
    tx: Prisma.TransactionClient, 
    quote: Quotation, 
    requisition: PurchaseRequisition,
    actor: User,
    declinedItemIds: string[] = []
) {
    await tx.quotation.update({ where: { id: quote.id }, data: { status: 'Declined' } });
    await tx.auditLog.create({
        data: {
            timestamp: new Date(),
            user: { connect: { id: actor.id } },
            action: 'DECLINE_AWARD',
            entity: 'Quotation',
            entityId: quote.id,
            details: `Vendor ${quote.vendorName} declined award for items: ${declinedItemIds.join(', ') || 'all'}.`,
            transactionId: requisition.transactionId,
        }
    });
    
    const otherActiveAwards = await tx.quotation.count({
        where: {
            requisitionId: requisition.id,
            id: { not: quote.id },
            status: { in: ['Accepted', 'Awarded', 'Partially_Awarded', 'Pending_Award'] }
        }
    });

    if (otherActiveAwards > 0) {
        // This is a partial decline in a split award scenario.
        // The core logic here is just to set a status that the UI can react to.
        // The actual re-sourcing of the declined items should be a separate, deliberate action by the PO.
        await tx.purchaseRequisition.update({
            where: { id: requisition.id },
            data: { status: 'Partially_Award_Declined' }
        });
         await tx.auditLog.create({
            data: {
                timestamp: new Date(),
                user: { connect: { id: actor.id } },
                action: 'AWARD_PARTIALLY_DECLINED',
                entity: 'Requisition',
                entityId: requisition.id,
                details: `A portion of the award was declined by ${quote.vendorName}. Other parts of the award remain active. Manual action is required to re-source the declined items.`,
                transactionId: requisition.transactionId,
            }
        });
        return { message: 'A part of the award has been declined. Manual action is required.' };
    }


    const nextStandby = await tx.quotation.findFirst({
        where: { requisitionId: requisition.id, status: 'Standby' },
        orderBy: { rank: 'asc' },
        include: { items: true } // *** FIX: Include items to prevent crash ***
    });

    if (nextStandby) {
        // A standby exists, so we promote them.
        await tx.quotation.update({ where: { id: nextStandby.id }, data: { status: 'Pending_Award', rank: 1 }});

        // The old price and awarded items might be different. We need to re-evaluate based on the new winner.
        const newTotalPrice = nextStandby.totalPrice;
        
        // Ensure items are loaded before mapping
        const newAwardedItemIds = nextStandby.items.map((i: any) => i.id);

        const { nextStatus, nextApproverId, auditDetails } = await getNextApprovalStep(tx, newTotalPrice);
        
        await tx.purchaseRequisition.update({
            where: { id: requisition.id },
            data: { 
                status: nextStatus as any,
                totalPrice: newTotalPrice,
                awardedQuoteItemIds: newAwardedItemIds,
                currentApproverId: nextApproverId
            }
        });

        await tx.auditLog.create({
            data: {
                timestamp: new Date(),
                action: 'PROMOTE_STANDBY_AWARD',
                entity: 'Requisition',
                entityId: requisition.id,
                details: `Award declined by ${quote.vendorName}. Promoted standby vendor ${nextStandby.vendorName}. ${auditDetails}`,
                transactionId: requisition.transactionId,
                user: { connect: { id: actor.id } } // Connect actor to audit log
            }
        });

        return { message: `Award declined. Promoted standby vendor ${nextStandby.vendorName}. Award is now being re-routed for approval.` };

    } else {
        // No standby and no other active awards. Perform a deep clean.
        await deepCleanRequisition(tx, requisition.id);
        
        await tx.auditLog.create({
            data: {
                timestamp: new Date(),
                action: 'RESTART_RFQ_NO_STANDBY',
                entity: 'Requisition',
                entityId: requisition.id,
                details: `All vendors declined award and no standby vendors were available. The RFQ process has been completely reset to 'PreApproved'.`,
                transactionId: requisition.transactionId,
                user: { connect: { id: actor.id } } // Connect actor to audit log
            }
        });
        
        return { message: 'Award declined. No more standby vendors. Requisition has been reset for a new RFQ process.' };
    }
}


/**
 * Promotes the next standby vendor and starts their approval workflow.
 * @param tx - Prisma transaction client.
 * @param requisitionId - The ID of the requisition.
 * @param actor - The user performing the action.
 * @returns A message indicating the result of the operation.
 */
export async function promoteStandbyVendor(tx: Prisma.TransactionClient, requisitionId: string, actor: any) {
    throw new Error("promoteStandbyVendor function is deprecated. Use handleAwardRejection instead.");
}
