
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
    
    // If the first step is a specific role (not a general committee), find the user to assign.
    if (!firstStep.role.includes('Committee')) {
        const approverUser = await tx.user.findFirst({ where: { role: firstStep.role }});
        if (!approverUser) {
            // This is a critical configuration error. The system can't proceed.
            throw new Error(`System configuration error: Could not find a user for the role: ${firstStep.role.replace(/_/g, ' ')}. Please assign a user to this role.`);
        }
        nextApproverId = approverUser.id;
    }

    return { 
        nextStatus, 
        nextApproverId,
        auditDetails: `Award value ${totalAwardValue.toLocaleString()} ETB falls into "${relevantTier.name}" tier. Routing to ${firstStep.role.replace(/_/g, ' ')} for approval.`
    };
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

    // THIS IS THE CRITICAL FIX: Re-run the approval matrix logic
    const { nextStatus, nextApproverId, auditDetails: promotionAuditDetails } = await getNextApprovalStep(tx, promotionValue);

    await tx.purchaseRequisition.update({
        where: { id: requisitionId },
        data: { 
            status: nextStatus as any,
            currentApproverId: nextApproverId
        }
    });

    await tx.auditLog.create({
        data: {
            user: { connect: { id: actor.id } },
            action: 'PROMOTE_STANDBY_AWARD',
            entity: 'Requisition',
            entityId: requisitionId,
            details: `Promoted standby vendor ${nextVendor.vendorName} for ${itemsToPromote.length} item(s). New award value: ${promotionValue.toLocaleString()} ETB. ${promotionAuditDetails}`,
            transactionId: requisitionId,
            timestamp: new Date(),
        }
    });

    return { message: `Promoted ${nextVendor.vendorName}. Award has been re-routed for approval.` };
}
