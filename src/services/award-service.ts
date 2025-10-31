

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
    
    const updatedQuote = await tx.quotation.update({
        where: { id: quote.id },
        data: { status: 'Declined' },
        include: { items: true, answers: true, scores: { include: { scorer: true, itemScores: { include: { scores: true } } } } }
    });


    const otherPendingAwards = await tx.awardedItem.count({
        where: {
            requisitionId: requisition.id,
            status: 'PendingAcceptance',
        }
    });

    let message: string;
    if (otherPendingAwards === 0) {
         await tx.purchaseRequisition.update({
            where: { id: requisition.id },
            data: { status: 'Award_Declined' }
        });
        message = 'Award has been declined. The procurement officer can now promote a standby vendor if available.';
    } else {
         await tx.purchaseRequisition.update({
            where: { id: requisition.id },
            data: { status: 'Award_Partially_Declined' }
        });
        message = 'A part of the award has been declined. Other portions of the award are still active.';
    }
    
    return { message, quote: updatedQuote };
}


export async function promoteStandbyVendor(tx: Prisma.TransactionClient, requisitionId: string, actor: any) {
    const declinedItems = await tx.awardedItem.findMany({
        where: { requisitionId, status: 'Declined' },
        select: { requisitionItemId: true, quotationId: true }
    });

    if (declinedItems.length === 0) {
        throw new Error('No declined items found to promote a standby for.');
    }
    
    const declinedQuotationIds = [...new Set(declinedItems.map(d => d.quotationId).filter(Boolean))] as string[];
    for(const quoteId of declinedQuotationIds) {
         await tx.quotation.update({
            where: { id: quoteId },
            data: { status: 'Rejected' }
        });
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
        // NO STANDBY FOUND - RESET THE PROCESS
        await tx.purchaseRequisition.update({
            where: { id: requisitionId },
            data: {
                status: 'PreApproved',
                deadline: null,
                currentApproverId: null,
            }
        });
        await tx.quotation.updateMany({
            where: { requisitionId },
            data: { status: 'Submitted', rank: null }
        });
        await tx.awardedItem.deleteMany({
            where: { requisitionId }
        });
        
         await tx.auditLog.create({
            data: {
                timestamp: new Date(),
                user: { connect: { id: actor.id } },
                action: 'AWARD_RESET',
                entity: 'Requisition',
                entityId: requisitionId,
                details: `Award declined and no standby vendors were available. The RFQ process for this requisition has been reset.`,
                transactionId: requisitionId,
            }
        });

        return { message: 'No standby vendors available. The award process has been reset for re-evaluation.' };
    }

    const nextVendor = standbyQuotes[0];
    const itemsToPromote = nextVendor.items.filter(item => declinedItemIds.includes(item.requisitionItemId));
    const promotionValue = itemsToPromote.reduce((acc, item) => acc + (item.unitPrice * item.quantity), 0);
    
    await tx.awardedItem.updateMany({
        where: {
            requisitionId: requisitionId,
            requisitionItemId: { in: itemsToPromote.map(i => i.requisitionItemId) },
            status: 'Declined'
        },
        data: { status: 'Superseded' }
    });

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
            timestamp: new Date(),
            user: { connect: { id: actor.id } },
            action: 'PROMOTE_STANDBY_AWARD',
            entity: 'Requisition',
            entityId: requisitionId,
            details: `Promoted standby vendor ${nextVendor.vendorName} for ${itemsToPromote.length} item(s). ${promotionAuditDetails}`,
            transactionId: requisitionId,
        }
    });

    return { message: `Promoted ${nextVendor.vendorName}. Award has been re-routed for approval.` };
}
