

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

            if (awardStrategy === 'all') {
                const vendorId = Object.keys(awards)[0];
                if (!vendorId) {
                    throw new Error("No winning vendor specified for 'all' strategy.");
                }
                const winningQuote = await tx.quotation.findFirst({where: {vendorId: vendorId, requisitionId: requisitionId}});
                if(!winningQuote) throw new Error("Winning quote not found");

                // Mark all items from this quote as pending award, others as rejected/standby
                const allQuotes = await tx.quotation.findMany({ where: { requisitionId }});
                const sortedQuotes = allQuotes.sort((a,b) => (b.finalAverageScore || 0) - (a.finalAverageScore || 0));

                for (let i = 0; i < sortedQuotes.length; i++) {
                    const quote = sortedQuotes[i];
                    if (quote.id === winningQuote.id) {
                         await tx.quotation.update({ where: { id: quote.id }, data: { status: 'Pending_Award', rank: 1 } });
                         await tx.quoteItem.updateMany({where: {quotationId: quote.id}, data: {status: 'Pending_Award', rank: 1}});
                    } else if (i === 1 || i === 2) {
                        await tx.quotation.update({ where: { id: quote.id }, data: { status: 'Standby', rank: (i + 1) as 2 | 3 } });
                        await tx.quoteItem.updateMany({where: {quotationId: quote.id}, data: {status: 'Standby', rank: (i + 1) as 2 | 3}});
                    } else {
                        await tx.quotation.update({ where: { id: quote.id }, data: { status: 'Rejected', rank: null } });
                        await tx.quoteItem.updateMany({where: {quotationId: quote.id}, data: {status: 'Rejected', rank: null}});
                    }
                }

            } else { // Per-item award logic
                for (const reqItem of requisition.items.filter(i => i.status !== 'Awarded')) {
                    const award = awards[reqItem.id];
                    if (!award || !award.winner) continue;

                    await tx.quoteItem.update({
                        where: { id: award.winner.quoteItemId },
                        data: { status: 'Pending_Award', rank: 1 }
                    });

                    for (let i = 0; i < award.standbys.length; i++) {
                        const standby = award.standbys[i];
                        await tx.quoteItem.update({
                            where: { id: standby.quoteItemId },
                            data: { status: 'Standby', rank: (i + 2) as 2 | 3 }
                        });
                    }
                    
                    const allProposalsForThisItem = await tx.quoteItem.findMany({where: {requisitionItemId: reqItem.id}});
                    const awardedOrStandbyIds = new Set([
                        award.winner.quoteItemId,
                        ...award.standbys.map((s:any) => s.quoteItemId)
                    ]);

                    const itemsToReject = allProposalsForThisItem.filter(p => !awardedOrStandbyIds.has(p.id));
                    await tx.quoteItem.updateMany({
                        where: { id: { in: itemsToReject.map(i => i.id) } },
                        data: { status: 'Rejected', rank: null }
                    });

                    await tx.requisitionItem.update({
                        where: { id: reqItem.id },
                        data: { status: 'Awarded' }
                    });
                }
                
                const allQuotes = await tx.quotation.findMany({
                    where: { requisitionId: requisitionId },
                    include: { items: true }
                });
                
                for (const quote of allQuotes) {
                    const hasPendingAward = quote.items.some(i => i.status === 'Pending_Award');
                    const hasStandby = quote.items.some(i => i.status === 'Standby');
                    if (hasPendingAward) {
                        await tx.quotation.update({ where: { id: quote.id }, data: { status: 'Partially_Awarded' }});
                    } else if (hasStandby) {
                         await tx.quotation.update({ where: { id: quote.id }, data: { status: 'Standby' }});
                    } else {
                         await tx.quotation.update({ where: { id: quote.id }, data: { status: 'Rejected' }});
                    }
                }
            }
            
            const { nextStatus, nextApproverId, auditDetails } = await getNextApprovalStep(tx, totalAwardValue);
            
            const updatedRequisition = await tx.purchaseRequisition.update({
                where: { id: requisitionId },
                data: {
                    status: nextStatus as any,
                    currentApproverId: nextApproverId,
                    awardResponseDeadline: awardResponseDeadline ? new Date(awardResponseDeadline) : undefined,
                    totalPrice: totalAwardValue,
                    awardedQuoteItemIds: Object.values(awards).flatMap((award: any) => award.items?.map((item: any) => item.quoteItemId) || (award.winner ? [award.winner.quoteItemId] : [])),
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
