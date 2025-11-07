

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
            
            // Set awarded quotes to Pending_Award
            for (const quote of allQuotes) {
                if (awardedVendorIds.includes(quote.vendorId)) {
                    await tx.quotation.update({
                        where: { id: quote.id },
                        data: { status: 'Pending_Award', rank: 1 }
                    });
                }
            }

            // Set standby vendors for each awarded item
            const awardedItemIds = Object.values(awards).flatMap((a: any) => a.items.map((i: any) => i.requisitionItemId));
            const uniqueAwardedItemIds = [...new Set(awardedItemIds)];

            // Clear previous standby assignments for this requisition to avoid duplicates
            const quotesForReq = await tx.quotation.findMany({ where: { requisitionId: requisitionId }, select: { id: true }});
            await tx.standbyAssignment.deleteMany({ where: { quotationId: { in: quotesForReq.map(q => q.id) } } });


            for (const reqItemId of uniqueAwardedItemIds) {
                const quotesWithItem = allQuotes
                    .filter(q => q.items.some(i => i.requisitionItemId === reqItemId))
                    .sort((a,b) => (b.finalAverageScore || 0) - (a.finalAverageScore || 0));

                const winnerQuote = quotesWithItem.find(q => awardedVendorIds.includes(q.vendorId));

                const standbyCandidates = quotesWithItem.filter(q => q.id !== winnerQuote?.id);

                for (let i = 0; i < Math.min(2, standbyCandidates.length); i++) {
                    const standbyQuote = standbyCandidates[i];
                    await tx.standbyAssignment.create({
                        data: {
                            quotationId: standbyQuote.id,
                            requisitionItemId: reqItemId,
                            rank: i + 2,
                        }
                    });
                    // Also update the quote status itself if it's not already awarded for another item
                    const currentStatus = await tx.quotation.findUnique({ where: { id: standbyQuote.id }, select: { status: true } });
                    if(currentStatus?.status !== 'Pending_Award') {
                       await tx.quotation.update({
                           where: { id: standbyQuote.id },
                           data: { status: 'Standby' }
                       });
                    }
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
