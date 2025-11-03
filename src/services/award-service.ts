
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
 * This version makes the process manual by setting the status to 'Award_Declined',
 * requiring a procurement officer to manually promote a standby vendor.
 * @param tx - Prisma transaction client.
 * @param quote - The quote from which items were rejected.
 * @param requisition - The associated requisition.
 * @param actor - The user performing the action (the vendor).
 * @param declinedQuoteItemIds - The specific quote item IDs that were declined.
 * @returns A message indicating the result of the operation.
 */
export async function handleItemAwardRejection(
    tx: Prisma.TransactionClient, 
    quote: Quotation, 
    requisition: PurchaseRequisition & { items: any[] },
    actor: User,
    declinedQuoteItemIds: string[]
) {
    // Mark the declined items' status
    await tx.quoteItem.updateMany({
        where: { id: { in: declinedQuoteItemIds } },
        data: { status: 'Declined' }
    });

    // Mark the parent quote as Declined. This is simpler and signals a problem with the whole quote.
    await tx.quotation.update({
        where: { id: quote.id },
        data: { status: 'Declined' }
    });

    await tx.auditLog.create({
        data: {
            timestamp: new Date(),
            user: { connect: { id: actor.id } },
            action: 'DECLINE_AWARD_ITEM',
            entity: 'Quotation',
            entityId: quote.id,
            details: `Vendor ${quote.vendorName} declined award for ${declinedQuoteItemIds.length} item(s). Manual intervention required.`,
            transactionId: requisition.transactionId,
        }
    });

    // Determine the overall status of the requisition.
    // Check if there are other items still successfully awarded to other vendors.
    const remainingAwardedItems = await tx.quoteItem.count({
        where: {
            quotation: { requisitionId: requisition.id },
            status: 'Accepted'
        }
    });

    // Set the requisition status to 'Award_Declined' or 'Partially_Award_Declined'
    // to signal that a PO needs to take action.
    const newRequisitionStatus = remainingAwardedItems > 0 ? 'Partially_Award_Declined' : 'Award_Declined';
    
    await tx.purchaseRequisition.update({
        where: { id: requisition.id },
        data: { status: newRequisitionStatus as any }
    });

    return { message: `Award declined. The procurement officer has been notified to take action.` };
}

