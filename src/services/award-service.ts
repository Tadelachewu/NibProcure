
'use server';

import { Prisma, PrismaClient } from '@prisma/client';
import { User, UserRole } from '@/lib/types';

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
    
    await tx.committeeAssignment.deleteMany({ where: { requisitionId }});

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
    quote: any, 
    requisition: any,
    actor: any,
    declinedItemIds: string[] = []
) {
    // 1. Mark the current quote as Declined
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

    // 2. Check if other vendors have active awards for this requisition
    const otherActiveAwards = await tx.quotation.count({
        where: {
            requisitionId: requisition.id,
            id: { not: quote.id },
            status: { in: ['Accepted', 'Awarded', 'Partially_Awarded', 'Pending_Award'] }
        }
    });

    // 3. LOGIC BRANCH: Handle Full Rejection vs. Partial Rejection
    if (otherActiveAwards > 0) {
        // --- This is a PARTIAL rejection (a split award scenario) ---
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
                details: `A portion of the award was declined by ${quote.vendorName}. Other awards remain active. Action required for declined items.`,
                transactionId: requisition.transactionId,
            }
        });

        return { message: 'A part of the award has been declined. Accepted parts will proceed. Declined items need re-sourcing.' };

    } else {
        // --- This is a FULL rejection (single vendor or all split vendors declined) ---
        const nextStandby = await tx.quotation.findFirst({
            where: { requisitionId: requisition.id, status: 'Standby' },
            orderBy: { rank: 'asc' }
        });

        if (nextStandby) {
            // Promote Standby
            return await promoteStandbyVendor(tx, requisition.id, actor);
        } else {
            // No Standby, so reset the entire RFQ
            await deepCleanRequisition(tx, requisition.id);
            await tx.auditLog.create({
                data: {
                    timestamp: new Date(),
                    user: { connect: { id: actor.id } },
                    action: 'RESET_RFQ',
                    entity: 'Requisition',
                    entityId: requisition.id,
                    details: 'Award declined and no standby vendors were available. The requisition has been reset to Pre-Approved for a new RFQ.',
                    transactionId: requisition.transactionId,
                }
            });
            return { message: 'Award declined. No standby vendor available. RFQ process has been reset.' };
        }
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
    const nextStandby = await tx.quotation.findFirst({
        where: {
            requisitionId,
            status: 'Standby'
        },
        orderBy: { rank: 'asc' },
        include: { items: true, scores: { include: { itemScores: true } } }
    });

    if (!nextStandby) {
        throw new Error('No standby vendor found to promote.');
    }
    
    // Fetch the original requisition to get the list of requested items
    const requisition = await tx.purchaseRequisition.findUnique({
        where: { id: requisitionId },
        include: { items: true }
    });

    if (!requisition) {
        throw new Error('Associated requisition not found.');
    }

    // --- START: Intelligent Item Selection Logic ---
    const bestItemsFromNewWinner = requisition.items.map(reqItem => {
        const proposalsForItem = nextStandby.items.filter(i => i.requisitionItemId === reqItem.id);

        if (proposalsForItem.length === 0) return null;
        if (proposalsForItem.length === 1) return proposalsForItem[0];
        
        // If multiple proposals, find the best-scored one
        let bestItemScore = -1;
        let bestProposal = proposalsForItem[0];

        proposalsForItem.forEach(proposal => {
             let totalItemScore = 0;
             let scoreCount = 0;
             nextStandby.scores.forEach(scoreSet => {
                 const itemScore = scoreSet.itemScores.find(i => i.quoteItemId === proposal.id);
                 if (itemScore) {
                     totalItemScore += itemScore.finalScore;
                     scoreCount++;
                 }
             });
             const averageItemScore = scoreCount > 0 ? totalItemScore / scoreCount : 0;
             if (averageItemScore > bestItemScore) {
                 bestItemScore = averageItemScore;
                 bestProposal = proposal;
             }
        });
        return bestProposal;
    }).filter((item): item is NonNullable<typeof item> => item !== null);
    // --- END: Intelligent Item Selection Logic ---

    const newTotalPrice = bestItemsFromNewWinner.reduce((acc, item) => acc + (item.unitPrice * item.quantity), 0);
    const newAwardedItemIds = bestItemsFromNewWinner.map(item => item.id);
    
    // Get the next approval step based on the NEW standby vendor's total price
    const { nextStatus, nextApproverId, auditDetails } = await getNextApprovalStep(tx, newTotalPrice);
    
    // Update the requisition to start the new approval workflow.
    await tx.purchaseRequisition.update({
        where: { id: requisitionId },
        data: {
            status: nextStatus as any,
            totalPrice: newTotalPrice, // Update price to the new winner's
            awardedQuoteItemIds: newAwardedItemIds, // Update awarded items
            currentApproverId: nextApproverId, // Set the first approver in the new chain
        }
    });
    
    // Update the promoted quote's status to 'Pending_Award'.
    // It is NOT 'Awarded' yet. It will become 'Awarded' only after passing the full approval chain.
    await tx.quotation.update({
        where: { id: nextStandby.id },
        data: { 
            status: 'Pending_Award',
            rank: 1 // They are now the primary candidate.
        }
    });
    
    await tx.auditLog.create({
        data: {
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
