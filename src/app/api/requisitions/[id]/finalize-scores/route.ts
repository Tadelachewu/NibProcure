

'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { User, UserRole } from '@/lib/types';

function getNextStatusFromRole(role: string): string {
    const committeeMatch = role.match(/Committee_(\w+)_Member/);
    if (committeeMatch) {
        const committeeLetter = committeeMatch[1];
        // Standardize the status format for ALL committees.
        return `Pending_Committee_${committeeLetter}_Recommendation`;
    }
    
    const statusMap: { [key: string]: string } = {
        'Manager_Procurement_Division': 'Pending_Managerial_Approval',
        'Director_Supply_Chain_and_Property_Management': 'Pending_Director_Approval',
        'VP_Resources_and_Facilities': 'Pending_VP_Approval',
        'President': 'Pending_President_Approval',
    };

    return statusMap[role] || `Pending_${role}`;
}


export async function POST(
  request: Request,
  { params }: { params: { id:string } }
) {
    const requisitionId = params.id;
    console.log(`--- FINALIZE-SCORES START for REQ: ${requisitionId} ---`);
    try {
        const body = await request.json();
        const { userId, awards, awardStrategy, awardResponseDeadline, totalAwardValue } = body;
        console.log(`[FINALIZE-SCORES] Award Value: ${totalAwardValue}`);

        const user: User | null = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || (user.role !== 'Procurement_Officer' && user.role !== 'Admin' && user.role !== 'Committee')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }
        
        const result = await prisma.$transaction(async (tx) => {
            
            const allQuotes = await tx.quotation.findMany({ 
                where: { requisitionId: requisitionId }, 
                orderBy: { finalAverageScore: 'desc' } 
            });

            if (allQuotes.length === 0) {
                throw new Error("No quotes found to process for this requisition.");
            }
            
            const approvalMatrix = await tx.approvalThreshold.findMany({ include: { steps: { orderBy: { order: 'asc' } } }, orderBy: { min: 'asc' }});
            const relevantTier = approvalMatrix.find(tier => totalAwardValue >= tier.min && (tier.max === null || totalAwardValue <= tier.max));
            console.log(`[FINALIZE-SCORES] Matched Tier: ${relevantTier?.name || 'NONE'}`);

            if (!relevantTier) {
                throw new Error(`No approval tier found for an award value of ${totalAwardValue.toLocaleString()} ETB. Please configure the Approval Matrix.`);
            }

            const awardedVendorIds = Object.keys(awards);
            const winnerQuotes = allQuotes.filter(q => awardedVendorIds.includes(q.vendorId));

            // Create an exclusion list of vendors who have already declined.
            const declinedVendorIds = new Set(allQuotes.filter(q => q.status === 'Declined').map(q => q.vendorId));

            // The pool of "other" quotes now EXCLUDES winners and any previously declined vendors.
            const otherQuotes = allQuotes.filter(q => !awardedVendorIds.includes(q.vendorId) && !declinedVendorIds.has(q.vendorId));


            for (const quote of winnerQuotes) {
                const award = awards[quote.vendorId];
                 await tx.quotation.update({
                    where: { id: quote.id },
                    data: {
                        status: 'Pending_Award', // Set to pending, not awarded yet
                        rank: 1
                    }
                });
            }
            
            const standbyQuotes = otherQuotes.slice(0, 2);
            if (standbyQuotes.length > 0) {
                for (let i = 0; i < standbyQuotes.length; i++) {
                    await tx.quotation.update({ where: { id: standbyQuotes[i].id }, data: { status: 'Standby', rank: (i + 2) as 2 | 3 } });
                }
            }
            
            const rejectedQuoteIds = otherQuotes.slice(2).map(q => q.id);
            if (rejectedQuoteIds.length > 0) {
                await tx.quotation.updateMany({ where: { id: { in: rejectedQuoteIds } }, data: { status: 'Rejected', rank: null } });
            }

            let nextStatus: string;
            let nextApproverId: string | null = null;
            let auditDetails: string;

            if (relevantTier.steps.length > 0) {
                const firstStep = relevantTier.steps[0];
                console.log(`[FINALIZE-SCORES] First approval step role: ${firstStep.role}`);
                nextStatus = getNextStatusFromRole(firstStep.role);
                console.log(`[FINALIZE-SCORES] Generated initial status: ${nextStatus}`);

                if (!firstStep.role.includes('Committee')) {
                    const approverUser = await tx.user.findFirst({ where: { role: firstStep.role }});
                    if (!approverUser) {
                        throw new Error(`Could not find a user for the role: ${firstStep.role.replace(/_/g, ' ')}`);
                    }
                    nextApproverId = approverUser.id;
                }
                console.log(`[FINALIZE-SCORES] Next Approver ID: ${nextApproverId}`);
                auditDetails = `Award value ${totalAwardValue.toLocaleString()} ETB falls into "${relevantTier.name}" tier. Routing to ${firstStep.role.replace(/_/g, ' ')} for approval.`;
            } else {
                // If there are no steps, it's auto-approved. We can move straight to PostApproved
                nextStatus = 'PostApproved';
                 console.log(`[FINALIZE-SCORES] No approval steps for this tier. Setting status to: ${nextStatus}`);
                auditDetails = `Award value ${totalAwardValue.toLocaleString()} ETB falls into "${relevantTier.name}" tier, which has no approval steps. Approved for vendor notification.`;
            }
            
            const awardedItemIds = Object.values(awards).flatMap((a: any) => a.items.map((i: any) => i.quoteItemId));
            
            const updatedRequisition = await tx.purchaseRequisition.update({
                where: { id: requisitionId },
                data: {
                    status: nextStatus as any,
                    currentApproverId: nextApproverId,
                    awardedQuoteItemIds: awardedItemIds,
                    awardResponseDeadline: awardResponseDeadline ? new Date(awardResponseDeadline) : undefined,
                    totalPrice: totalAwardValue
                }
            });
            console.log(`[FINALIZE-SCORES] Requisition ${requisitionId} updated. New status: ${updatedRequisition.status}, Approver: ${updatedRequisition.currentApproverId}`);

            await tx.auditLog.create({
                data: {
                    user: { connect: { id: userId } },
                    action: 'FINALIZE_AWARD',
                    entity: 'Requisition',
                    entityId: requisitionId,
                    details: auditDetails,
                    transactionId: requisitionId,
                }
            });
            
            return updatedRequisition;
        }, {
            maxWait: 10000,
            timeout: 20000,
        });
        
        console.log(`--- FINALIZE-SCORES END for REQ: ${requisitionId} ---`);
        return NextResponse.json({ message: 'Award process finalized and routed for review.', requisition: result });

    } catch (error) {
        console.error("[FINALIZE-SCORES] Failed to finalize scores and award:", error);
        if (error instanceof Error) {
            return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
        }
        return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
    }
}
