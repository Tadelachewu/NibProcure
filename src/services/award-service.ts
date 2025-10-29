
'use server';

import { Prisma, PrismaClient } from '@prisma/client';
import { User, UserRole } from '@/lib/types';

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
        const committeeMatch = role.match(/Committee_(\w+)_Member/);
        if (committeeMatch) {
            return `Pending_${role}`;
        }

        const statusMap: { [key: string]: string } = {
            'Manager_Procurement_Division': 'Pending_Managerial_Approval',
            'Director_Supply_Chain_and_Property_Management': 'Pending_Director_Approval',
            'VP_Resources_and_Facilities': 'Pending_VP_Approval',
            'President': 'Pending_President_Approval',
        };
        return statusMap[role] || `Pending_${role.replace(/ /g, '_')}`;
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
            action: 'REJECT_AWARD',
            entity: 'Quotation',
            entityId: quote.id,
            details: `Vendor declined award for items: ${declinedItemIds.join(', ') || 'all'}.`,
            transactionId: requisition.transactionId,
        }
    });

    const nextStandby = await tx.quotation.findFirst({
        where: { requisitionId: requisition.id, status: 'Standby' },
        orderBy: { rank: 'asc' },
    });

    if (nextStandby) {
         // 2a. If a standby exists, set the main requisition status to 'Award_Declined' to signal manual promotion is needed.
        await tx.purchaseRequisition.update({
            where: { id: requisition.id },
            data: { status: 'Award_Declined' }
        });

        await tx.auditLog.create({
            data: {
                timestamp: new Date(),
                user: { connect: { id: actor.id } },
                action: 'AWARD_DECLINED',
                entity: 'Requisition',
                entityId: requisition.id,
                details: `Award declined by ${quote.vendorName}. A standby vendor is available. Manual promotion required.`,
                transactionId: requisition.transactionId,
            }
        });

        return { message: 'Award has been declined. A standby vendor is available for promotion.' };
    } else {
        // 2b. If NO standby exists, reset the process.
        await tx.quotation.updateMany({
            where: { requisitionId: requisition.id },
            data: { status: 'Submitted', rank: null }
        });
        
        await tx.purchaseRequisition.update({
            where: { id: requisition.id },
            data: {
                status: 'PreApproved', // Revert to a state where RFQ can be re-initiated
                deadline: null,
                scoringDeadline: null,
                awardResponseDeadline: null
            }
        });
        
        await tx.auditLog.create({
            data: {
                timestamp: new Date(),
                action: 'RESTART_RFQ_NO_STANDBY',
                entity: 'Requisition',
                entityId: requisition.id,
                details: `All vendors declined award and no standby vendors were available. RFQ process has been reset for requisition.`,
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
    
    // Set the requisition to PostApproved, which makes it ready for the PO to send the notification
    await tx.purchaseRequisition.update({
        where: { id: requisitionId },
        data: {
            status: 'PostApproved',
            totalPrice: nextStandby.totalPrice, // Update price to the new winner's
            awardedQuoteItemIds: nextStandby.items.map(item => item.id), // Update awarded items
            currentApproverId: null, // Clear current approver as it's now with the PO
        }
    });
    
    // Update the promoted quote's status to 'Awarded'. It's now the official winner, pending notification.
    await tx.quotation.update({
        where: { id: nextStandby.id },
        data: { status: 'Awarded' }
    });
    
     // The old 'Declined' quote should remain as is. Other 'Standby' quotes also remain.

    await tx.auditLog.create({
        data: {
            user: { connect: { id: actor.id } },
            action: 'PROMOTE_STANDBY_AWARD',
            entity: 'Requisition',
            entityId: requisitionId,
            details: `Promoted standby vendor ${nextStandby.vendorName}. Requisition is now ready for vendor notification.`,
            transactionId: requisitionId,
        }
    });

    return { message: `Promoted ${nextStandby.vendorName}. The requisition is now ready for vendor notification.` };
}
