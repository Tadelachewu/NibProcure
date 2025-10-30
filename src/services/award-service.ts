
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
    declinedItemIds: string[] = []
) {
    await tx.quotation.update({ where: { id: quote.id }, data: { status: 'Declined' } });
    await tx.auditLog.create({
        data: {
            timestamp: new Date(),
            user: { connect: { id: actor.id } },
            action: 'DECLINE_AWARD',
            entity: 'Quotation',
            entityId: quote.id,
            details: `Vendor declined award for items: ${declinedItemIds.join(', ') || 'all'}.`,
            transactionId: requisition.transactionId,
        }
    });
    
    const otherActiveAwards = await tx.quotation.count({
        where: {
            requisitionId: requisition.id,
            id: { not: quote.id },
            status: { in: ['Accepted', 'Awarded', 'Partially_Awarded', 'Pending_Award'] }
        }
    });

    if (otherActiveAwards > 0) {
        await tx.purchaseRequisition.update({
            where: { id: requisition.id },
            data: { status: 'Award_Partially_Declined' }
        });
         await tx.auditLog.create({
            data: {
                timestamp: new Date(),
                user: { connect: { id: actor.id } },
                action: 'AWARD_PARTIALLY_DECLINED',
                entity: 'Requisition',
                entityId: requisition.id,
                details: `A portion of the award was declined by ${quote.vendorName}. Other parts of the award remain active. Manual promotion of standby is required for the failed items.`,
                transactionId: requisition.transactionId,
            }
        });
        return { message: 'A part of the award has been declined. Manual action is required for the failed items.' };
    }

    const nextStandby = await tx.quotation.findFirst({
        where: { requisitionId: requisition.id, status: 'Standby' },
        orderBy: { rank: 'asc' },
    });

    if (nextStandby) {
        await tx.purchaseRequisition.update({
            where: { id: requisition.id },
            data: { status: 'Award_Declined' }
        });

        await tx.auditLog.create({
            data: {
                timestamp: new Date(),
                user: { connect: { id: actor.id } },
                action: 'AWARD_DECLINED_STANDBY_AVAILABLE',
                entity: 'Requisition',
                entityId: requisition.id,
                details: `Award declined by ${quote.vendorName}. A standby vendor is available for promotion.`,
                transactionId: requisition.transactionId,
            }
        });

        return { message: 'Award has been declined. A standby vendor is available for promotion.' };
    } else {
        await deepCleanRequisition(tx, requisition.id);
        
        await tx.auditLog.create({
            data: {
                timestamp: new Date(),
                action: 'RESTART_RFQ_NO_STANDBY',
                entity: 'Requisition',
                entityId: requisition.id,
                details: `All vendors declined award and no standby vendors were available. The RFQ process has been completely reset.`,
                transactionId: requisition.transactionId,
            }
        });
        
        return { message: 'Award declined. No more standby vendors. Requisition has been reset for a new RFQ process.' };
    }
}

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
    
    await tx.purchaseRequisition.update({
        where: { id: requisitionId },
        data: {
            status: nextStatus as any,
            totalPrice: nextStandby.totalPrice, 
            awardedQuoteItemIds: nextStandby.items.map(item => item.id), 
            currentApproverId: nextApproverId,
        }
    });
    
    await tx.quotation.update({
        where: { id: nextStandby.id },
        data: { 
            status: 'Pending_Award',
            rank: 1
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

    return { message: `Promoted ${nextStandby.vendorName}. The award is now being routed for approval.` };
}
