
'use server';

import { Prisma, PrismaClient } from '@prisma/client';
import { User, UserRole, PerItemAwardDetail, QuoteItem, Quotation, EvaluationCriteria } from '@/lib/types';

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
    
    // Determine current step index more robustly
    let currentStepIndex = -1;
    for(let i=0; i < relevantTier.steps.length; i++) {
        const step = relevantTier.steps[i];
        if (requisition.status === `Pending_${step.role.name}` || (actor.roles as any[]).some(r => r.name === step.role.name)) {
            currentStepIndex = i;
            // If the user's role matches, we've found our current position in the chain.
            // We break to ensure we don't accidentally pick up a later step if a user has multiple approval roles.
            const userRoles = (actor.roles as any[]).map(r => r.name);
            if (userRoles.includes(step.role.name)) {
                 break;
            }
        }
    }


    let nextStepIndex = currentStepIndex + 1;
    
    // If the requisition isn't in a pending state found in the matrix (e.g. it's Scoring_Complete or Award_Declined), start from the beginning.
    if (currentStepIndex === -1) {
        nextStepIndex = 0;
    }


    while(nextStepIndex < relevantTier.steps.length) {
        const nextStep = relevantTier.steps[nextStepIndex];
        const nextRoleName = nextStep.role.name;
        
        const nextStatus = `Pending_${nextRoleName}`;
        
        let nextApproverId: string | null = null;
        if (!nextRoleName.includes('Committee')) {
            const approverUser = await tx.user.findFirst({ where: { roles: { some: { name: nextRoleName } } }});
            if (!approverUser) {
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
    declinedItemIds: string[] = [],
    rejectionSource: 'Vendor' | 'Receiving',
    rejectionReason: string = 'No reason provided.'
) {
    const awardStrategy = (requisition.rfqSettings as any)?.awardStrategy;
    const formattedReason = `[${rejectionSource}] ${rejectionReason}`;
    
    if (awardStrategy === 'item') {
        let itemsUpdated = 0;
        
        for (const reqItemId of declinedItemIds) {
            const itemToUpdate = requisition.items.find((item: any) => item.id === reqItemId);

            if (!itemToUpdate) {
                console.warn(`Could not find a requisition item with ID: ${reqItemId}`);
                continue;
            }
            
            const awardDetails = (itemToUpdate.perItemAwardDetails as PerItemAwardDetail[] | null) || [];
            const updatedDetails = awardDetails.map(d => {
                if (d.vendorId === quote.vendorId && (d.status === 'Awarded' || d.status === 'Pending_Award' || d.status === 'Accepted')) {
                    itemsUpdated++;
                    return { ...d, status: 'Declined' as const, rejectionReason: formattedReason };
                }
                return d;
            });

            await tx.requisitionItem.update({
                where: { id: itemToUpdate.id },
                data: { perItemAwardDetails: updatedDetails as any }
            });
        }
        
        if (itemsUpdated > 0) {
            await tx.purchaseRequisition.update({
                where: { id: requisition.id },
                data: { status: 'Award_Declined' }
            });
            await tx.auditLog.create({ 
                data: { 
                    timestamp: new Date(), 
                    user: { connect: { id: actor.id } }, 
                    action: 'DECLINE_AWARD', 
                    entity: 'Requisition', 
                    entityId: requisition.id, 
                    details: `Award for ${itemsUpdated} item(s) was declined. Source: ${rejectionSource}. Reason: ${rejectionReason}. Manual promotion of standby is now possible.`, 
                    transactionId: requisition.transactionId 
                } 
            });
            return { message: 'Per-item award has been declined. A standby vendor can now be manually promoted.' };
        }
        
        throw new Error("No awarded items found for this vendor to decline.");

    } else { // Single Vendor Strategy
        await tx.quotation.update({ where: { id: quote.id }, data: { status: 'Declined', rejectionReason: formattedReason } });
        
        await tx.auditLog.create({ 
            data: { 
                timestamp: new Date(), 
                user: { connect: { id: actor.id } }, 
                action: 'DECLINE_AWARD', 
                entity: 'Quotation', 
                entityId: quote.id, 
                details: `Award declined. Source: ${rejectionSource}. Reason: ${rejectionReason}`, 
                transactionId: requisition.transactionId 
            } 
        });

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

function calculateChampionBidsForVendor(requisition: any, vendorQuote: any): QuoteItem[] {
    if (!requisition.evaluationCriteria || !vendorQuote) {
        return [];
    }
    return requisition.items.map((reqItem: any) => {
        const proposalsForItem = vendorQuote.items.filter((item: any) => item.requisitionItemId === reqItem.id);
        if (proposalsForItem.length === 0) return null;

        let championBid: QuoteItem | null = null;
        let bestScore = -1;

        proposalsForItem.forEach((proposal: any) => {
            let totalItemScore = 0;
            let scoreCount = 0;
            vendorQuote.scores?.forEach((scoreSet: any) => {
                const itemScore = scoreSet.itemScores.find((is: any) => is.quoteItemId === proposal.id);
                if (itemScore) {
                    totalItemScore += itemScore.finalScore;
                    scoreCount++;
                }
            });
            const avgScore = scoreCount > 0 ? totalItemScore / scoreCount : 0;
            if (avgScore > bestScore) {
                bestScore = avgScore;
                championBid = proposal;
            }
        });
        return championBid;
    }).filter(Boolean) as QuoteItem[];
}


export async function promoteStandbyVendor(tx: Prisma.TransactionClient, requisitionId: string, actor: any) {
    const requisition = await tx.purchaseRequisition.findUnique({
        where: { id: requisitionId },
        include: { 
            items: true, 
            quotations: { include: { scores: { include: { itemScores: true } }, items: true } },
            evaluationCriteria: { include: { financialCriteria: true, technicalCriteria: true } }
        }
    });

    if (!requisition) {
        throw new Error('Associated requisition not found.');
    }
    
    const awardStrategy = (requisition.rfqSettings as any)?.awardStrategy;

    if (awardStrategy === 'item') {
        let promotedCount = 0;
        let auditDetailsMessage = 'Promoted standby vendors: ';

        const itemsNeedingPromotion = requisition.items.filter(item => 
            (item.perItemAwardDetails as PerItemAwardDetail[] | undefined)?.some(d => d.status === 'Declined')
        );

        if (itemsNeedingPromotion.length === 0) {
            throw new Error("Could not find any items with a 'Declined' status to trigger a promotion.");
        }

        for (const item of itemsNeedingPromotion) {
            const currentDetails = (item.perItemAwardDetails as PerItemAwardDetail[] | null) || [];
            
            const ineligibleQuoteItemIds = new Set(
                currentDetails.filter(d => d.status === 'Failed_to_Award' || d.status === 'Declined').map(d => d.quoteItemId)
            );

            const bidToPromote = currentDetails
                .filter(d => d.status === 'Standby' && !ineligibleQuoteItemIds.has(d.quoteItemId))
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
        
        if (promotedCount === 0) {
            return { message: 'No eligible standby vendors were found for promotion. Please review the awards.' };
        }
        
        const updatedRequisition = await tx.purchaseRequisition.findUnique({ where: {id: requisitionId}, include: { items: true }});
        if (!updatedRequisition) throw new Error("Could not refetch requisition for value calculation.");

        // Recalculate total value based only on newly promoted items
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
                totalPrice: newTotalValue, // Use the newly calculated total
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
            include: { items: true, scores: { include: { itemScores: true } } }
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
        
        const championBids = calculateChampionBidsForVendor(requisition, nextStandby);
        const newTotalValue = championBids.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);

        const { nextStatus, nextApproverId, auditDetails } = await getNextApprovalStep(tx, { ...requisition, totalPrice: newTotalValue }, actor);
        
        await tx.purchaseRequisition.update({
            where: { id: requisitionId },
            data: {
                status: nextStatus as any,
                totalPrice: newTotalValue,
                currentApproverId: nextApproverId,
                awardedQuoteItemIds: championBids.map(i => i.id), // *** THIS IS THE FIX ***
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
