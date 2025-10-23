
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { User, UserRole } from '@/lib/types';


async function findApproverId(role: UserRole): Promise<string | null> {
    const user = await prisma.user.findFirst({
        where: { role: role.replace(/ /g, '_') }
    });
    return user?.id || null;
}

function getNextStatusFromRole(role: string): string {
    switch (role) {
        case 'Manager_Procurement_Division':
            return 'Pending_Managerial_Approval';
        case 'Director_Supply_Chain_and_Property_Management':
            return 'Pending_Director_Approval';
        case 'VP_Resources_and_Facilities':
            return 'Pending_VP_Approval';
        case 'President':
            return 'Pending_President_Approval';
        case 'Committee_A_Member':
            return 'Pending_Committee_A_Recommendation';
        case 'Committee_B_Member':
            return 'Pending_Committee_B_Review';
        default:
            return `Pending_${role}`;
    }
}


export async function POST(
  request: Request,
  { params }: { params: { id:string } }
) {
    const requisitionId = params.id;
    try {
        const body = await request.json();
        const { userId, awards, awardStrategy, awardResponseDeadline, totalAwardValue } = body;

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

            if (!relevantTier) {
                throw new Error(`No approval tier found for an award value of ${totalAwardValue.toLocaleString()} ETB. Please configure the Approval Matrix.`);
            }

            const awardedVendorIds = Object.keys(awards);
            const winnerQuotes = allQuotes.filter(q => awardedVendorIds.includes(q.vendorId));
            const otherQuotes = allQuotes.filter(q => !awardedVendorIds.includes(q.vendorId));

            for (const quote of winnerQuotes) {
                const award = awards[quote.vendorId];
                 await tx.quotation.update({
                    where: { id: quote.id },
                    data: {
                        status: award.items.length > 0 ? (awardStrategy === 'all' ? 'Awarded' : 'Partially_Awarded') : 'Rejected',
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
                nextStatus = getNextStatusFromRole(firstStep.role);

                if (!firstStep.role.includes('Committee')) {
                    nextApproverId = await findApproverId(firstStep.role as UserRole);
                    if (!nextApproverId) {
                        throw new Error(`Could not find a user for the role: ${firstStep.role.replace(/_/g, ' ')}`);
                    }
                }
                auditDetails = `Award value ${totalAwardValue.toLocaleString()} ETB falls into "${relevantTier.name}" tier. Routing to ${firstStep.role.replace(/_/g, ' ')} for approval.`;
            } else {
                nextStatus = 'Review_Complete';
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

        return NextResponse.json({ message: 'Award process finalized and routed for review.', requisition: result });

    } catch (error) {
        console.error("Failed to finalize scores and award:", error);
        if (error instanceof Error) {
            return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
        }
        return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
    }
}
