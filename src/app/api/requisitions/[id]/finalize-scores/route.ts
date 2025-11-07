
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
        console.log(`[FINALIZE-SCORES] Award Strategy: ${awardStrategy}, Award Value: ${totalAwardValue}`);

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
            const allAwardedQuoteItemIds: string[] = Object.values(awards).flatMap((a: any) => a.items.map((i: any) => i.quoteItemId));

            // --- LOGIC FOR SINGLE VENDOR AWARD ---
            if (awardStrategy === 'all') {
                const winnerVendorId = awardedVendorIds[0];
                const winnerQuote = allQuotes.find(q => q.vendorId === winnerVendorId);

                if (!winnerQuote) {
                    throw new Error("Winning quote not found for single-vendor award strategy.");
                }

                // Award to winner, reject all others
                await tx.quotation.update({
                    where: { id: winnerQuote.id },
                    data: { status: 'Pending_Award', rank: 1 }
                });
                await tx.quotation.updateMany({
                    where: { requisitionId: requisitionId, id: { not: winnerQuote.id } },
                    data: { status: 'Rejected', rank: null }
                });

            } 
            // --- LOGIC FOR SPLIT (PER-ITEM) AWARD ---
            else if (awardStrategy === 'item') {
                 // Set awarded quotes to Pending_Award and rank them as #1
                for (const vendorId of awardedVendorIds) {
                    const quotesForVendor = allQuotes.filter(q => q.vendorId === vendorId);
                    for (const quote of quotesForVendor) {
                        await tx.quotation.update({
                            where: { id: quote.id },
                            data: { status: 'Pending_Award', rank: 1 }
                        });
                    }
                }

                // Set standby vendors for each awarded item
                const awardedRequisitionItemIds = allQuotes.flatMap(q => q.items)
                    .filter(qi => allAwardedQuoteItemIds.includes(qi.id))
                    .map(qi => qi.requisitionItemId);
                
                await tx.standbyAssignment.deleteMany({ where: { requisition: { id: requisitionId } } });

                for (const reqItemId of [...new Set(awardedRequisitionItemIds)]) {
                    const quotesWithItem = allQuotes
                        .filter(q => q.items.some(i => i.requisitionItemId === reqItemId))
                        .sort((a,b) => (b.finalAverageScore || 0) - (a.finalAverageScore || 0));

                    const winnerQuote = quotesWithItem.find(q => awardedVendorIds.includes(q.vendorId));
                    const standbyCandidates = quotesWithItem.filter(q => q.id !== winnerQuote?.id && !awardedVendorIds.includes(q.vendorId));

                    for (let i = 0; i < Math.min(2, standbyCandidates.length); i++) {
                        const standbyQuote = standbyCandidates[i];
                        await tx.standbyAssignment.create({
                            data: {
                                quotationId: standbyQuote.id,
                                requisitionId: requisitionId,
                                requisitionItemId: reqItemId,
                                rank: i + 2,
                            }
                        });
                        
                        const currentStatus = await tx.quotation.findUnique({ where: { id: standbyQuote.id }, select: { status: true } });
                        if(currentStatus?.status !== 'Pending_Award' && currentStatus?.status !== 'Awarded') {
                        await tx.quotation.update({
                            where: { id: standbyQuote.id },
                            data: { status: 'Standby' }
                        });
                        }
                    }
                }
            }

            const updatedRequisition = await tx.purchaseRequisition.update({
                where: { id: requisitionId },
                data: {
                    status: nextStatus as any,
                    currentApproverId: nextApproverId,
                    awardedQuoteItemIds: allAwardedQuoteItemIds,
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
