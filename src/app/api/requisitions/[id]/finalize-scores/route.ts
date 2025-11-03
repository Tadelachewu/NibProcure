
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
                const winningItems = awards[winnerVendorId]?.items || [];

                for (const item of winningItems) {
                    await tx.quoteItem.update({
                        where: { id: item.quoteItemId },
                        data: { status: 'Pending_Award', rank: 1 }
                    });
                }
                // Set other quotes from the same vendor to rejected unless they are the winning one
                await tx.quoteItem.updateMany({
                    where: {
                        quotation: { vendorId: winnerVendorId, requisitionId: requisitionId },
                        id: { notIn: winningItems.map((i:any) => i.quoteItemId) }
                    },
                    data: { status: 'Rejected', rank: null }
                });


            } else { // Per-item award
                const allAwardedQuoteItems: string[] = [];

                for (const reqItemId in awards) {
                    const awardInfo = awards[reqItemId];
                    
                    // Award the winner
                    await tx.quoteItem.update({
                        where: { id: awardInfo.winner.quoteItemId },
                        data: { status: 'Pending_Award', rank: 1 }
                    });
                    allAwardedQuoteItems.push(awardInfo.winner.quoteItemId);

                    // Award standby vendors
                    for (let i = 0; i < awardInfo.standbys.length; i++) {
                        await tx.quoteItem.update({
                            where: { id: awardInfo.standbys[i].quoteItemId },
                            data: { status: 'Standby', rank: i + 2 }
                        });
                        allAwardedQuoteItems.push(awardInfo.standbys[i].quoteItemId);
                    }
                }
            }
            
            // Set parent Quotation statuses based on their items' statuses
            const allQuotes = await tx.quotation.findMany({ where: { requisitionId: requisitionId }});
            for (const quote of allQuotes) {
                const quoteItems = await tx.quoteItem.findMany({ where: { quotationId: quote.id }});
                const hasPending = quoteItems.some(qi => qi.status === 'Pending_Award' || qi.status === 'Standby');
                if(hasPending) {
                    await tx.quotation.update({ where: {id: quote.id}, data: {status: 'Partially_Awarded'}});
                } else {
                     await tx.quotation.update({ where: {id: quote.id}, data: {status: 'Rejected'}});
                }
            }
            
            // Mark requisition items as awarded
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
