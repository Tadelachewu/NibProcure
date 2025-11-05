
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
                orderBy: { finalAverageScore: 'desc' } 
            });

            if (allQuotes.length === 0) {
                throw new Error("No quotes found to process for this requisition.");
            }
            
            const { nextStatus, nextApproverId, auditDetails } = await getNextApprovalStep(tx, totalAwardValue);

            const awardedVendorIds = Object.keys(awards);
            const winnerQuotes = allQuotes.filter(q => awardedVendorIds.includes(q.vendorId));

            // Create an exclusion list of vendors who have already declined.
            const declinedVendorIds = new Set(allQuotes.filter(q => q.status === 'Declined' || q.status === 'Failed').map(q => q.vendorId));

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
