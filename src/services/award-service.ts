

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
    declinedItemIds: string[]
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
            details: `Vendor declined award for items: ${declinedItemIds.join(', ')}.`,
            transactionId: requisition.transactionId,
        }
    });

    const alreadyDeclinedVendorIds = (await tx.quotation.findMany({
        where: { requisitionId: quote.requisitionId, status: 'Declined' },
        select: { vendorId: true }
    })).map(q => q.vendorId);


    // For each declined item, find the next best standby vendor
    let promotionOccurred = false;
    for (const itemId of declinedItemIds) {
         const nextStandbyQuote = await tx.quotation.findFirst({
            where: {
                requisitionId: requisition.id,
                status: 'Standby',
                vendorId: { notIn: alreadyDeclinedVendorIds },
                items: { some: { requisitionItemId: itemId } }
            },
            orderBy: { rank: 'asc' },
            include: { items: true }
        });

        if (nextStandbyQuote) {
            promotionOccurred = true;
            // Promote this vendor for this specific item
            const newAwardedItemIds = [...requisition.awardedQuoteItemIds.filter((id: string) => !declinedItemIds.includes(id)), nextStandbyQuote.items.find(i => i.requisitionItemId === itemId)!.id];
            
            await tx.quotation.update({
                where: { id: nextStandbyQuote.id },
                data: { status: 'Partially_Awarded' } // Promote to partially awarded
            });
            
            await tx.purchaseRequisition.update({
                where: { id: requisition.id },
                data: { awardedQuoteItemIds: newAwardedItemIds }
            });
             await tx.auditLog.create({
                data: {
                    timestamp: new Date(),
                    user: { connect: { id: actor.id } },
                    action: 'PROMOTE_STANDBY',
                    entity: 'Quotation',
                    entityId: nextStandbyQuote.id,
                    details: `Promoted standby vendor ${nextStandbyQuote.vendorName} to Partially Awarded for item ${itemId}.`,
                    transactionId: requisition.transactionId,
                }
            });
        }
    }


    if (promotionOccurred) {
        // If we promoted someone, we just return the message. The PO creation is handled by acceptances.
        return { message: 'Award declined. A standby vendor has been promoted for the declined items.' };
    } else {
        // If no standby exists for any of the declined items, perform a full reset of the RFQ process for this requisition.
        await tx.quotation.deleteMany({ where: { requisitionId: requisition.id }});
        await tx.committeeAssignment.deleteMany({ where: { requisitionId: requisition.id }});

        await tx.purchaseRequisition.update({
            where: { id: requisition.id },
            data: { 
                status: 'PreApproved',
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
                details: `All vendors declined or failed award process. Requisition and all related quotes/scores have been reset for a new RFQ process.`,
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

    await tx.quotation.update({
        where: { id: nextStandby.id },
        data: { status: 'Pending_Award' }
    });

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
