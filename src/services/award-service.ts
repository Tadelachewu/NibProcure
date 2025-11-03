
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
 * For each declined item, it promotes a standby or resets the item for a new RFQ.
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
    let itemsResetToRfqCount = 0;
    let itemsPromotedCount = 0;

    await tx.quoteItem.updateMany({
        where: { id: { in: declinedQuoteItemIds } },
        data: { status: 'Declined' }
    });

    await tx.auditLog.create({
        data: {
            timestamp: new Date(),
            user: { connect: { id: actor.id } },
            action: 'DECLINE_AWARD_ITEM',
            entity: 'Quotation',
            entityId: quote.id,
            details: `Vendor ${quote.vendorName} declined award for ${declinedQuoteItemIds.length} item(s).`,
            transactionId: requisition.transactionId,
        }
    });

    const declinedItems = await tx.quoteItem.findMany({
        where: { id: { in: declinedQuoteItemIds } }
    });

    for (const declinedItem of declinedItems) {
        const nextStandby = await tx.quoteItem.findFirst({
            where: { 
                requisitionItemId: declinedItem.requisitionItemId, 
                status: 'Standby' 
            },
            orderBy: { rank: 'asc' },
            include: { quotation: { include: { vendor: true } } }
        });

        if (nextStandby) {
            itemsPromotedCount++;
            await tx.quoteItem.update({
                where: { id: nextStandby.id },
                data: { status: 'Pending_Award', rank: 1 } // Promote to winner
            });

            // Make sure the parent quote is actionable for the newly awarded vendor
            await tx.quotation.update({
                where: { id: nextStandby.quotationId },
                data: { status: 'Partially_Awarded' }
            });
            
            // Notify the newly promoted vendor
            const standbyVendor = nextStandby.quotation.vendor;
            if (standbyVendor.email) {
                const emailHtml = `
                    <h1>Good News! You've been awarded an item from standby!</h1>
                    <p>Hello ${standbyVendor.name},</p>
                    <p>A previously awarded vendor for an item in requisition <strong>${requisition.title}</strong> has declined. As a standby vendor, you are now awarded for item: <strong>${nextStandby.name}</strong>.</p>
                    <p>Please log in to the vendor portal to review the award details and respond.</p>
                    ${requisition.awardResponseDeadline ? `<p><strong>This award must be accepted by ${format(new Date(requisition.awardResponseDeadline), 'PPpp')}.</strong></p>` : ''}
                    <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002'}/vendor/dashboard">Go to Vendor Portal</a>
                    <p>Thank you,</p>
                    <p>Nib InternationalBank Procurement</p>
                `;
                await sendEmail({ to: standbyVendor.email, subject: `Awarded from Standby: ${requisition.title}`, html: emailHtml });
            }
             await tx.auditLog.create({
                data: {
                    timestamp: new Date(),
                    user: { connect: { id: actor.id } },
                    action: 'PROMOTE_STANDBY_ITEM',
                    entity: 'Requisition',
                    entityId: requisition.id,
                    details: `Item "${declinedItem.name}" was declined. Standby vendor ${standbyVendor.name} was automatically promoted and notified.`,
                    transactionId: requisition.transactionId,
                }
            });


        } else {
            itemsResetToRfqCount++;
            // No standby, reset the original requisition item
            await tx.requisitionItem.update({
                where: { id: declinedItem.requisitionItemId },
                data: { status: 'Needs_RFQ' }
            });
             await tx.auditLog.create({
                data: {
                    timestamp: new Date(),
                    user: { connect: { id: actor.id } },
                    action: 'ITEM_NEEDS_RFQ',
                    entity: 'Requisition',
                    entityId: requisition.id,
                    details: `Item "${declinedItem.name}" was declined and had no standby vendors. It has been reset and needs a new RFQ.`,
                    transactionId: requisition.transactionId,
                }
            });
        }
    }
    
    // Finally, update the overall requisition status
    const remainingPendingItems = await tx.requisitionItem.count({
        where: { requisitionId: requisition.id, status: 'Pending' }
    });

    if (remainingPendingItems === 0) {
        const hasItemsNeedingRFQ = await tx.requisitionItem.count({ where: { requisitionId: requisition.id, status: 'Needs_RFQ' } });
        if (hasItemsNeedingRFQ > 0) {
             await tx.purchaseRequisition.update({
                where: { id: requisition.id },
                data: { status: 'Partially_Award_Declined' }
            });
        } else {
             await tx.purchaseRequisition.update({
                where: { id: requisition.id },
                data: { status: 'Partially_PO_Created' }
            });
        }
    }


    return { message: `${itemsPromotedCount} item(s) promoted to standby, ${itemsResetToRfqCount} item(s) reset for new RFQ.` };
}
