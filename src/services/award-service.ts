

'use server';

import { Prisma, PrismaClient } from '@prisma/client';
import { User, UserRole, Quotation, PurchaseRequisition, QuoteItem } from '@/lib/types';
import { sendEmail } from './email-service';
import { format } from 'date-fns';

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
 * Handles the logic when a vendor rejects an award for specific items.
 * @param tx - Prisma transaction client.
 * @param quote - The quote from which items were rejected.
 * @param requisition - The associated requisition.
 * @param actor - The user performing the action (the vendor).
 * @param declinedQuoteItemIds - The specific quote item IDs that were declined.
 * @returns A message indicating the result of the operation.
 */
export async function handleAwardRejection(
    tx: Prisma.TransactionClient, 
    quote: Quotation & { requisition: PurchaseRequisition & { quotations: Quotation[] } }, 
    requisition: PurchaseRequisition & { items: any[] },
    actor: User,
    declinedQuoteItemIds?: string[]
) {
    if (requisition.status === 'Partially_Awarded' && (!declinedQuoteItemIds || declinedQuoteItemIds.length === 0)) {
        throw new Error("Specific item IDs must be provided for rejection.");
    }
    
    // Determine if it's a full or partial rejection
    const isFullRejection = !declinedQuoteItemIds || declinedQuoteItemIds.length === quote.items.length;

    if (isFullRejection) {
        await tx.quotation.update({ where: { id: quote.id }, data: { status: 'Declined' } });
        await tx.auditLog.create({
            data: {
                timestamp: new Date(), user: { connect: { id: actor.id } },
                action: 'REJECT_AWARD', entity: 'Quotation', entityId: quote.id,
                details: `Vendor ${quote.vendorName} declined the entire award.`,
                transactionId: requisition.transactionId,
            }
        });

        // Check if there are ANY other standby vendors for this ENTIRE requisition
        const standbyCount = await tx.quotation.count({
            where: { requisitionId: requisition.id, status: 'Standby' }
        });

        if (standbyCount > 0) {
            // If standbys exist, let the PO handle manual promotion
            await tx.purchaseRequisition.update({
                where: { id: requisition.id }, data: { status: 'Award_Declined' }
            });
            return { message: 'Award declined. Procurement officer has been notified to promote a standby vendor.' };
        } else {
            // NO standbys exist for the whole req. Automatically reset.
            const quotationsToDelete = await tx.quotation.findMany({
                where: { requisitionId: requisition.id },
                include: { scores: { include: { itemScores: { include: { scores: true } } } } }
            });

            const scoreSetIds = quotationsToDelete.flatMap(q => q.scores.map(s => s.id));
            if (scoreSetIds.length > 0) {
                const itemScoreIds = quotationsToDelete.flatMap(q => q.scores.flatMap(s => s.itemScores.map(i => i.id)));
                if (itemScoreIds.length > 0) {
                    await tx.score.deleteMany({ where: { itemScoreId: { in: itemScoreIds } } });
                }
                await tx.itemScore.deleteMany({ where: { scoreSetId: { in: scoreSetIds } } });
                await tx.committeeScoreSet.deleteMany({ where: { id: { in: scoreSetIds } } });
            }

            await tx.quotation.deleteMany({where: {requisitionId: requisition.id}});
            await tx.committeeAssignment.deleteMany({where: {requisitionId: requisition.id}});

            await tx.purchaseRequisition.update({
                where: { id: requisition.id },
                data: {
                    status: 'PreApproved', deadline: null, scoringDeadline: null, committeeName: null,
                    committeePurpose: null, financialCommitteeMembers: { set: [] }, technicalCommitteeMembers: { set: [] },
                    currentApproverId: null, totalPrice: requisition.items.reduce((acc, item) => acc + (item.unitPrice || 0) * item.quantity, 0),
                }
            });

            await tx.auditLog.create({
                data: {
                    timestamp: new Date(), user: { connect: { id: actor.id } },
                    action: 'RESET_RFQ_NO_STANDBY', entity: 'Requisition', entityId: requisition.id,
                    details: `All vendors declined and no standbys remain. RFQ process has been automatically reset to 'PreApproved' (Ready for RFQ).`,
                    transactionId: requisition.transactionId,
                }
            });
            return { message: 'Award declined. No more standby vendors. Requisition has been reset for new RFQ process.' };
        }
    } else {
        // This is a partial rejection (from a per-item award)
        // This logic is complex and deferred per user request, will be handled in a future step.
        throw new Error("Partial award rejection logic is not yet implemented.");
    }
}
