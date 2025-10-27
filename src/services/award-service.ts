
'use server';

import { Prisma, PrismaClient } from '@prisma/client';
import { UserRole } from '@/lib/types';

/**
 * Finds the correct initial status and approver for a given value tier.
 * This is now an exported function to be reusable.
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
 * @returns A message indicating the result of the operation.
 */
export async function handleAwardRejection(
    tx: Prisma.TransactionClient, 
    quote: any, 
    requisition: any,
    actor: any
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
            details: `Vendor declined award.`,
            transactionId: requisition.transactionId,
        }
    });

    // 2. Find the next standby vendor
    const nextRank = (quote.rank || 0) + 1;
    const nextQuote = await tx.quotation.findFirst({
        where: { requisitionId: quote.requisitionId, rank: nextRank },
        include: { items: true }
    });

    if (nextQuote) {
        // 3a. If a standby exists, promote them and re-trigger approval workflow
        
        // ** THE FIX **: Recalculate total value based only on the specific items this vendor won.
        // The awardedQuoteItemIds on the requisition still holds the item IDs from the original evaluation.
        // We find which of those items belong to our newly promoted vendor.
        const originalWinningItemIds = new Set(requisition.awardedQuoteItemIds);
        const newVendorAwardedItems = nextQuote.items.filter((item: any) => originalWinningItemIds.has(item.id));
        
        // If the original award was for all items, newVendorAwardedItems might be empty.
        // In that case, we use all items from the nextQuote.
        const itemsToCalculate = newVendorAwardedItems.length > 0 ? newVendorAwardedItems : nextQuote.items;
        const newTotalAwardValue = itemsToCalculate.reduce((acc: number, item: any) => acc + (item.unitPrice * item.quantity), 0);
        
        const { nextStatus, nextApproverId, auditDetails } = await getNextApprovalStep(tx, newTotalAwardValue);

        await tx.purchaseRequisition.update({
            where: { id: requisition.id },
            data: {
                totalPrice: newTotalAwardValue, // Use the CORRECTED value
                status: nextStatus as any,
                currentApproverId: nextApproverId,
                // Do NOT change awardedQuoteItemIds. It's the source of truth for the award structure.
            }
        });
        
        // Update statuses: Promote standby to Awarded, and fail the original rejector.
        await tx.quotation.update({ where: { id: quote.id }, data: { status: 'Declined' } });
        await tx.quotation.update({ where: { id: nextQuote.id }, data: { rank: 1, status: 'Awarded' } });
        
        await tx.auditLog.create({
            data: {
                timestamp: new Date(),
                action: 'PROMOTE_STANDBY',
                entity: 'Quotation',
                entityId: nextQuote.id,
                details: `Promoted standby vendor ${nextQuote.vendorName} to Awarded. Re-initiating approval workflow with new value ${newTotalAwardValue.toLocaleString()} ETB. ${auditDetails}`,
                transactionId: requisition.transactionId,
            }
        });

        return { message: `Award declined. Next vendor (${nextQuote.vendorName}) has been promoted and sent for approval.` };

    } else {
        // 3b. If no standby exists, reset the entire RFQ process for this requisition
        await tx.purchaseRequisition.update({
            where: { id: requisition.id },
            data: { 
                status: 'PreApproved', // Revert to a state where RFQ can be re-initiated
                deadline: null,
                scoringDeadline: null,
                awardResponseDeadline: null,
                committeeName: null,
                committeePurpose: null,
                awardedQuoteItemIds: [],
            }
        });
        
        // Delete all data related to the failed RFQ process
        const quotationsToDelete = await tx.quotation.findMany({ where: { requisitionId: requisition.id }, select: { id: true } });
        const quoteIds = quotationsToDelete.map(q => q.id);
        if (quoteIds.length > 0) {
            const scoreSets = await tx.committeeScoreSet.findMany({ where: { quotationId: { in: quoteIds } }, select: { id: true } });
            const scoreSetIds = scoreSets.map(s => s.id);
            if (scoreSetIds.length > 0) {
                const itemScores = await tx.itemScore.findMany({ where: { scoreSetId: { in: scoreSetIds } }, select: { id: true } });
                const itemScoreIds = itemScores.map(i => i.id);
                if (itemScoreIds.length > 0) {
                    await tx.score.deleteMany({ where: { itemScoreId: { in: itemScoreIds } } });
                }
                await tx.itemScore.deleteMany({ where: { scoreSetId: { in: scoreSetIds } } });
            }
            await tx.committeeScoreSet.deleteMany({ where: { quotationId: { in: quoteIds } } });
            await tx.quotation.deleteMany({ where: { id: { in: quoteIds } } });
        }
        
        await tx.auditLog.create({
            data: {
                timestamp: new Date(),
                action: 'RESTART_RFQ',
                entity: 'Requisition',
                entityId: requisition.id,
                details: `All vendors declined or failed award process. Requisition has been reset for a new RFQ.`,
                transactionId: requisition.transactionId,
            }
        });

        return { message: 'Award declined. No more standby vendors. Requisition has been reset for a new RFQ process.' };
    }
}
