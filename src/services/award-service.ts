
'use server';

import { Prisma, PrismaClient } from '@prisma/client';
import { User, UserRole } from '@/lib/types';

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

async function deepCleanRequisition(tx: Prisma.TransactionClient, requisitionId: string) {
    await tx.awardedItem.deleteMany({ where: { requisitionId } });

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
    actor: any
) {
    // Find all awarded items for this quote that are pending acceptance and mark them as declined.
    const declinedAwards = await tx.awardedItem.updateMany({
        where: {
            quotationId: quote.id,
            status: 'PendingAcceptance'
        },
        data: { status: 'Declined' }
    });

    if (declinedAwards.count > 0) {
        await tx.auditLog.create({
            data: {
                timestamp: new Date(),
                user: { connect: { id: actor.id } },
                action: 'DECLINE_AWARD',
                entity: 'Quotation',
                entityId: quote.id,
                details: `Vendor declined award for ${declinedAwards.count} item(s).`,
                transactionId: requisition.transactionId,
            }
        });
    }

    // Check if there are any other items for this requisition still waiting for vendor acceptance.
    const otherPendingAwards = await tx.awardedItem.count({
        where: {
            requisitionId: requisition.id,
            status: 'PendingAcceptance',
        }
    });

    // If there are no other pending acceptances, we can proceed with standby logic.
    if (otherPendingAwards === 0) {
         await tx.purchaseRequisition.update({
            where: { id: requisition.id },
            data: { status: 'Award_Declined' } // Signal to UI that action is needed.
        });
        return { message: 'Award has been declined. The procurement officer can now promote a standby vendor if available.' };
    } else {
        // If other awards are still pending, just flag the requisition as partially declined.
         await tx.purchaseRequisition.update({
            where: { id: requisition.id },
            data: { status: 'Award_Partially_Declined' }
        });
        return { message: 'A part of the award has been declined. Other portions of the award are still active.' };
    }
}


export async function promoteStandbyVendor(tx: Prisma.TransactionClient, requisitionId: string, actor: any) {
    const declinedItems = await tx.awardedItem.findMany({
        where: { requisitionId, status: 'Declined' },
        select: { requisitionItemId: true }
    });

    if (declinedItems.length === 0) {
        throw new Error('No declined items found to promote a standby for.');
    }
    
    const declinedItemIds = declinedItems.map(d => d.requisitionItemId);
    
    const standbyQuotes = await tx.quotation.findMany({
        where: {
            requisitionId,
            status: 'Standby',
            items: { some: { requisitionItemId: { in: declinedItemIds } } }
        },
        include: { items: true },
        orderBy: { rank: 'asc' }
    });
    
    if (standbyQuotes.length === 0) {
        // No standby vendors available for any of the failed items. Reset RFQ for these items.
        // This logic is complex and might be better handled as a manual action by the PO.
        // For now, we'll just indicate no standby is available.
        return { message: 'No standby vendors available for the declined items. Manual re-sourcing is required.' };
    }

    const nextVendor = standbyQuotes[0];
    const itemsToPromote = nextVendor.items.filter(item => declinedItemIds.includes(item.requisitionItemId));
    const promotionValue = itemsToPromote.reduce((acc, item) => acc + (item.unitPrice * item.quantity), 0);
    
    // Mark the old declined items as superseded to close their loop
    await tx.awardedItem.updateMany({
        where: {
            requisitionId: requisitionId,
            requisitionItemId: { in: itemsToPromote.map(i => i.requisitionItemId) },
            status: 'Declined'
        },
        data: { status: 'Superseded' }
    });

    // Create new awards for the standby vendor
    for (const item of itemsToPromote) {
        await tx.awardedItem.create({
            data: {
                status: 'PendingAcceptance',
                requisition: { connect: { id: requisitionId } },
                requisitionItem: { connect: { id: item.requisitionItemId } },
                vendor: { connect: { id: nextVendor.vendorId } },
                quotation: { connect: { id: nextVendor.id } }
            }
        });
    }

    // Update the main requisition to reflect the new state
    await tx.purchaseRequisition.update({
        where: { id: requisitionId },
        data: { status: 'PostApproved' } // Ready for PO to notify vendor again
    });

    await tx.auditLog.create({
        data: {
            user: { connect: { id: actor.id } },
            action: 'PROMOTE_STANDBY_AWARD',
            entity: 'Requisition',
            entityId: requisitionId,
            details: `Promoted standby vendor ${nextVendor.vendorName} for ${itemsToPromote.length} item(s).`,
            transactionId: requisitionId,
        }
    });

    return { message: `Promoted ${nextVendor.vendorName}. Requisition is ready for vendor notification.` };
}
