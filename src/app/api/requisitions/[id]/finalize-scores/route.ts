
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
            
            const requisition = await tx.purchaseRequisition.findUnique({
                where: { id: requisitionId },
                include: { items: true }
            });
            if (!requisition) {
                throw new Error("Requisition not found.");
            }

            // Set all quote items to rejected by default
            await tx.quoteItem.updateMany({
                where: { quotation: { requisitionId: requisitionId } },
                data: { status: 'Rejected', rank: null }
            });

            if (awardStrategy === 'all') {
                const winnerVendorId = Object.keys(awards)[0];
                const awardData = awards[winnerVendorId];
                if (!awardData) {
                    throw new Error("Invalid award data for single vendor strategy.");
                }
                const winningItems = awardData.items || [];
                const standbyVendors = awardData.standbys || [];

                for (const item of winningItems) {
                    if (item && item.quoteItemId) {
                         await tx.quoteItem.update({
                            where: { id: item.quoteItemId },
                            data: { status: 'Pending_Award', rank: 1 }
                        });
                    }
                }
                
                // Set the entire quotes for standby vendors to 'Standby'
                for (let i = 0; i < standbyVendors.length; i++) {
                    const standby = standbyVendors[i];
                    await tx.quotation.updateMany({
                        where: { vendorId: standby.vendorId, requisitionId: requisitionId },
                        data: { status: 'Standby', rank: i + 2 }
                    });
                }


            } else { // Per-item award
                
                for (const reqItemId in awards) {
                    const awardInfo = awards[reqItemId];
                    if (!awardInfo || !awardInfo.winner) continue;
                    
                    // Award the winner for this item
                    await tx.quoteItem.update({
                        where: { id: awardInfo.winner.quoteItemId },
                        data: { status: 'Pending_Award', rank: 1 }
                    });

                    // Award standby vendors for this item
                    for (let i = 0; i < awardInfo.standbys.length; i++) {
                        const standby = awardInfo.standbys[i];
                        await tx.quoteItem.update({
                            where: { id: standby.quoteItemId },
                            data: { status: 'Standby', rank: i + 2 }
                        });
                    }
                }
            }
            
            // Set parent Quotation statuses based on their items' statuses
            const allQuotes = await tx.quotation.findMany({ where: { requisitionId: requisitionId }});
            for (const quote of allQuotes) {
                const quoteItems = await tx.quoteItem.findMany({ where: { quotationId: quote.id }});
                const hasPending = quoteItems.some(qi => qi.status === 'Pending_Award');
                const hasStandby = quoteItems.some(qi => qi.status === 'Standby');
                if(hasPending) {
                    await tx.quotation.update({ where: {id: quote.id}, data: {status: 'Pending_Award'}});
                } else if (hasStandby) {
                     await tx.quotation.update({ where: {id: quote.id}, data: {status: 'Standby'}});
                } else {
                     await tx.quotation.update({ where: {id: quote.id}, data: {status: 'Rejected'}});
                }
            }
            
            // Mark corresponding requisition items as being in an award process
            await tx.requisitionItem.updateMany({
                where: {
                    quoteItems: { some: { status: 'Pending_Award' }}
                },
                data: { status: 'Awarded' }
            });
            
            const { nextStatus, nextApproverId, auditDetails } = await getNextApprovalStep(tx, totalAwardValue);
            
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
                    timestamp: new Date(),
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
            maxWait: 15000,
            timeout: 30000,
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
