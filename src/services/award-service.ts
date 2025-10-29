'use server';

import { Prisma, PrismaClient } from '@prisma/client';
import { UserRole } from '@/lib/types';

/**
 * Finds the correct initial status and approver for a given value tier.
 * @param tx - Prisma transaction client.
 * @param totalAwardValue - The value of the award.
 * @returns An object with the next status and approver ID.
 */
async function getNextApprovalStep(tx: Prisma.TransactionClient, totalAwardValue: number) {
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
    const getNextStatusFromRole = (role: string): string => {
        const statusMap: { [key: string]: string } = {
            'Manager_Procurement_Division': 'Pending_Managerial_Approval',
            'Director_Supply_Chain_and_Property_Management': 'Pending_Director_Approval',
            'VP_Resources_and_Facilities': 'Pending_VP_Approval',
            'President': 'Pending_President_Approval',
            'Committee_A_Member': 'Pending_Committee_A_Recommendation',
            'Committee_B_Member': 'Pending_Committee_B_Review',
        };
        return statusMap[role] || `Pending_${role}`;
    }
    
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


/**
 * Handles the logic when a vendor rejects an award, promoting the next vendor and re-evaluating the approval workflow.
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
    declinedItemIds: string[] = [] // Default to empty array if not provided
) {
    // 1. Mark the current quote as Declined
    await tx.quotation.update({ where: { id: quote.id }, data: { status: 'Declined' } });
    await tx.auditLog.create({
        data: {
            timestamp: new Date(),
            user: { connect: { id: actor.id } },
            action: 'REJECT_AWARD',
            entity: 'Quotation',
            entityId: quote.id,
            details: `Vendor declined award for items: ${declinedItemIds.join(', ') || 'all'}.`,
            transactionId: requisition.transactionId,
        }
    });

    // 2. Find the next highest-ranked standby quote that hasn't already declined.
    const nextStandbyQuote = await tx.quotation.findFirst({
        where: {
            requisitionId: requisition.id,
            status: 'Standby'
        },
        orderBy: { rank: 'asc' },
        include: { items: true }
    });

    if (nextStandbyQuote) {
        // 3. If a standby exists, promote them.
        await tx.quotation.update({
            where: { id: nextStandbyQuote.id },
            data: { status: 'Awarded' } 
        });

        // The requisition goes back to PostApproved so the PO can notify the new winner
        await tx.purchaseRequisition.update({
            where: { id: requisition.id },
            data: { 
                status: 'PostApproved',
                totalPrice: nextStandbyQuote.totalPrice // Update price to the new winner's
            }
        });

        await tx.auditLog.create({
            data: {
                timestamp: new Date(),
                user: { connect: { id: actor.id } },
                action: 'PROMOTE_STANDBY',
                entity: 'Quotation',
                entityId: nextStandbyQuote.id,
                details: `Promoted standby vendor ${nextStandbyQuote.vendorName} to Awarded. Waiting for Procurement Officer to notify.`,
                transactionId: requisition.transactionId,
            }
        });
        return { message: 'Award declined. A standby vendor has been promoted and is ready for notification.' };
    } else {
        // 4. If NO standby exists, reset the entire RFQ process for this requisition.
        const quotationIds = (await tx.quotation.findMany({
            where: { requisitionId: requisition.id },
            select: { id: true }
        })).map(q => q.id);

        const scoreSetIds = (await tx.committeeScoreSet.findMany({
            where: { quotationId: { in: quotationIds } },
            select: { id: true }
        })).map(s => s.id);
        
        const itemScoreIds = (await tx.itemScore.findMany({
            where: { scoreSetId: { in: scoreSetIds } },
            select: { id: true }
        })).map(i => i.id);

        // Delete in correct order to avoid constraint violations
        if (itemScoreIds.length > 0) {
            await tx.score.deleteMany({ where: { itemScoreId: { in: itemScoreIds } } });
        }
        if (scoreSetIds.length > 0) {
            await tx.itemScore.deleteMany({ where: { scoreSetId: { in: scoreSetIds } } });
        }
        if (scoreSetIds.length > 0) {
            await tx.committeeScoreSet.deleteMany({ where: { id: { in: scoreSetIds } } });
        }
        if (quotationIds.length > 0) {
            await tx.quotation.deleteMany({ where: { id: { in: quotationIds } } });
        }
        
        await tx.committeeAssignment.deleteMany({ where: { requisitionId: requisition.id }});

        await tx.purchaseRequisition.update({
            where: { id: requisition.id },
            data: { 
                status: 'PreApproved', // Revert to a state where RFQ can be re-sent
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
        
        await tx.auditLog.create({
            data: {
                timestamp: new Date(),
                user: { connect: { id: actor.id } },
                action: 'RESTART_RFQ',
                entity: 'Requisition',
                entityId: requisition.id,
                details: `All vendors declined or no standby was available. Requisition and all related quotes/scores have been reset for a new RFQ process.`,
                transactionId: requisition.transactionId,
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
    const nextStandby = await tx.quotation.findFirst({
        where: {
            requisitionId,
            status: 'Standby'
        },
        orderBy: { rank: 'asc' },
        include: { items: true }
    });

    if (!nextStandby) {
        throw new Error('No standby vendor found to promote.');
    }

    const { nextStatus, nextApproverId, auditDetails } = await getNextApprovalStep(tx, nextStandby.totalPrice);

    // Instead of directly awarding, set to Pending_Award and start the review process.
    await tx.quotation.update({
        where: { id: nextStandby.id },
        data: { status: 'Pending_Award' }
    });

    // Update the requisition to reflect the new approval flow
    await tx.purchaseRequisition.update({
        where: { id: requisitionId },
        data: {
            status: nextStatus as any,
            currentApproverId: nextApproverId,
            totalPrice: nextStandby.totalPrice, // Update req price to the standby's price
            awardedQuoteItemIds: nextStandby.items.map(item => item.id), // Update awarded items
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

    return { message: `Promoted ${nextStandby.vendorName}. Award review process initiated.` };
}
