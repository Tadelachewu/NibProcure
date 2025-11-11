
'use server';

import { Prisma, PrismaClient } from '@prisma/client';
import { User, UserRole, PerItemAwardDetail } from '@/lib/types';

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
    if ((requisition.rfqSettings as any)?.awardStrategy === 'item') {
        const reqItems = await tx.requisitionItem.findMany({ where: { requisitionId: requisition.id }});
        for (const itemId of declinedItemIds) {
            const reqItem = reqItems.find(i => i.id === itemId);
            if (!reqItem || !reqItem.perItemAwardDetails) continue;

            const awardDetails = reqItem.perItemAwardDetails as PerItemAwardDetail[];
            const rejectedVendorIndex = awardDetails.findIndex(d => d.vendorId === quote.vendorId);
            if (rejectedVendorIndex !== -1) {
                awardDetails[rejectedVendorIndex].status = 'Declined';
            }

            const nextStandby = awardDetails.find(d => d.rank === rejectedVendorIndex + 2);
            if (nextStandby) {
                nextStandby.status = 'Pending_Award';
                 await tx.auditLog.create({ data: { action: 'PROMOTE_STANDBY', entity: 'RequisitionItem', entityId: reqItem.id, details: `Promoted ${nextStandby.vendorName} to pending award for item ${reqItem.name}.`, transactionId: requisition.transactionId } });
            }

            await tx.requisitionItem.update({
                where: { id: reqItem.id },
                data: { perItemAwardDetails: awardDetails as any }
            });
        }
        await tx.purchaseRequisition.update({ where: { id: requisition.id }, data: { status: 'Award_Declined' } });
        return { message: 'Per-item award has been updated after decline.' };

    } else { // Single vendor award
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
            where: {
                requisitionId: requisition.id,
                status: 'Standby'
            }
        });

        // Set the main requisition status to 'Award_Declined' to signal the UI.
        // This pauses the process until the PO manually promotes.
        await tx.purchaseRequisition.update({
            where: { id: requisition.id },
            data: { status: 'Award_Declined' }
        });

        if (hasStandby > 0) {
            return { message: 'Award declined. A standby vendor is available for promotion.' };
        } else {
             await tx.auditLog.create({ 
                data: { 
                    timestamp: new Date(), 
                    action: 'AWAITING_RESET', 
                    entity: 'Requisition', 
                    entityId: requisition.id, 
                    details: 'Award was declined and no standby vendors are available. Manual RFQ restart is required.', 
                    transactionId: requisition.transactionId 
                } 
            });
            return { message: 'Award declined. No more standby vendors are available.' };
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
    
    const requisition = await tx.purchaseRequisition.findUnique({
        where: { id: requisitionId },
        include: { items: true }
    });

    if (!requisition) {
        throw new Error('Associated requisition not found.');
    }

    const bestItemsFromNewWinner = requisition.items.map(reqItem => {
        const proposalsForItem = nextStandby.items.filter(i => i.requisitionItemId === reqItem.id);
        if (proposalsForItem.length === 0) return null;
        if (proposalsForItem.length === 1) return proposalsForItem[0];
        
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
    
    const newTotalPrice = bestItemsFromNewWinner.reduce((acc, item) => acc + (item.unitPrice * item.quantity), 0);
    const newAwardedItemIds = bestItemsFromNewWinner.map(item => item.id);
    
    const { nextStatus, nextApproverId, auditDetails } = await getNextApprovalStep(tx, newTotalPrice);
    
    await tx.purchaseRequisition.update({
        where: { id: requisitionId },
        data: {
            status: nextStatus as any,
            totalPrice: newTotalPrice,
            awardedQuoteItemIds: newAwardedItemIds,
            currentApproverId: nextApproverId,
        }
    });
    
    await tx.quotation.update({
        where: { id: nextStandby.id },
        data: { 
            status: 'Pending_Award',
            rank: 1
        }
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
