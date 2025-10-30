
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { User, UserRole } from '@/lib/types';
import { getNextApprovalStep } from '@/services/award-service';

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
            
            const { nextStatus, nextApproverId, auditDetails } = await getNextApprovalStep(tx, totalAwardValue);

            // Clear any previous awards for this requisition
            await tx.awardedItem.deleteMany({ where: { requisitionId: requisitionId } });

            // Create new AwardedItem entries for each winning item
            for (const vendorId in awards) {
                const award = awards[vendorId];
                for (const item of award.items) {
                    if (!item.quoteItemId) {
                        throw new Error(`quoteItemId is missing for awarded item. This should not happen.`);
                    }
                    if (!award.quoteId) {
                         throw new Error(`quoteId is missing for award to vendor ${vendorId}.`);
                    }
                    await tx.awardedItem.create({
                        data: {
                            status: 'PendingAcceptance',
                            requisition: { connect: { id: requisitionId } },
                            requisitionItem: { connect: { id: item.requisitionItemId } },
                            vendor: { connect: { id: vendorId } },
                            quotation: { connect: { id: award.quoteId } }
                        }
                    });
                }
            }

            // Reject all quotes that didn't win anything
            const awardedVendorIds = Object.keys(awards);
            await tx.quotation.updateMany({
                where: {
                    requisitionId: requisitionId,
                    vendorId: { notIn: awardedVendorIds }
                },
                data: { status: 'Rejected' }
            });
             // Set winning quotes to a neutral 'Awaiting Vendor' status for clarity
             await tx.quotation.updateMany({
                where: {
                    requisitionId: requisitionId,
                    vendorId: { in: awardedVendorIds }
                },
                data: { status: 'Pending_Award' }
            });
            
            const updatedRequisition = await tx.purchaseRequisition.update({
                where: { id: requisitionId },
                data: {
                    status: nextStatus as any,
                    currentApproverId: nextApproverId,
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
        console.error("[FINALIZE-SCORES] Failed to finalize scores and award:", error);
        if (error instanceof Error) {
            return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
        }
        return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
    }
}
