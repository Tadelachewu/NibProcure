

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
                include: { items: true }
            });

            if (allQuotes.length === 0) {
                throw new Error("No quotes found to process for this requisition.");
            }
            
            const { nextStatus, nextApproverId, auditDetails } = await getNextApprovalStep(tx, totalAwardValue);

            const awardedVendorIds = Object.keys(awards);
            
            for (const quote of allQuotes) {
                if (awardedVendorIds.includes(quote.vendorId)) {
                    await tx.quotation.update({
                        where: { id: quote.id },
                        data: { status: 'Pending_Award', rank: 1 }
                    });
                }
            }

            // Set up to 2 standby vendors for each awarded item
            const awardedItemIds = Object.values(awards).flatMap((a: any) => a.items.map((i: any) => i.requisitionItemId));
            const uniqueAwardedItemIds = [...new Set(awardedItemIds)];

            for (const reqItemId of uniqueAwardedItemIds) {
                const quotesWithItem = allQuotes
                    .filter(q => q.items.some(i => i.requisitionItemId === reqItemId))
                    .sort((a,b) => (b.finalAverageScore || 0) - (a.finalAverageScore || 0));

                const winnerQuote = quotesWithItem.find(q => awardedVendorIds.includes(q.vendorId));

                const standbyCandidates = quotesWithItem.filter(q => q.id !== winnerQuote?.id);

                for (let i = 0; i < Math.min(2, standbyCandidates.length); i++) {
                    const standbyQuote = standbyCandidates[i];
                    await tx.quotation.update({
                        where: { id: standbyQuote.id },
                        data: {
                            status: 'Standby',
                            standbyForItemId: reqItemId, // Link standby status to a specific item
                            rank: (i + 2) as 2 | 3
                        }
                    });
                }
            }
            
            const awardedQuoteItemIds = Object.values(awards).flatMap((a: any) => a.items.map((i: any) => i.quoteItemId));
            
            const updatedRequisition = await tx.purchaseRequisition.update({
                where: { id: requisitionId },
                data: {
                    status: nextStatus as any,
                    currentApproverId: nextApproverId,
                    awardedQuoteItemIds: awardedQuoteItemIds,
                    awardResponseDeadline: awardResponseDeadline ? new Date(awardResponseDeadline) : undefined,
                    totalPrice: totalAwardValue
                }
            });
            console.log(`[FINALIZE-SCORES] Requisition ${requisitionId} updated. New status: ${updatedRequisition.status}, Approver: ${updatedRequisition.currentApproverId}`);

            await tx.auditLog.create({
                data: {
                    user: { connect: { id: userId } },
                    timestamp: new Date(),
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
