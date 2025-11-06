
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
        
        // --- START BRANCHING LOGIC ---

        if (awardStrategy === 'all') { // SINGLE_VENDOR strategy
            const result = await prisma.$transaction(async (tx) => {
                const { nextStatus, nextApproverId, auditDetails } = await getNextApprovalStep(tx, totalAwardValue);

                const awardedVendorIds = Object.keys(awards);
                const winningQuote = await tx.quotation.findFirst({ 
                    where: { requisitionId: requisitionId, vendorId: { in: awardedVendorIds } }, 
                });
                
                if (!winningQuote) throw new Error("Winning quote not found.");

                // Set winner to Pending_Award, standby, and reject others
                await tx.quotation.update({ where: { id: winningQuote.id }, data: { status: 'Pending_Award', rank: 1 }});
                
                const standbyCandidates = await tx.quotation.findMany({
                    where: { requisitionId: requisitionId, id: { not: winningQuote.id } },
                    orderBy: { finalAverageScore: 'desc' },
                    take: 2
                });
                 for (let i = 0; i < standbyCandidates.length; i++) {
                    await tx.quotation.update({ where: { id: standbyCandidates[i].id }, data: { status: 'Standby', rank: (i + 2) as 2 | 3 } });
                }

                const awardedItemIds = Object.values(awards).flatMap((a: any) => a.items.map((i: any) => i.quoteItemId));
                
                const updatedRequisition = await tx.purchaseRequisition.update({
                    where: { id: requisitionId },
                    data: {
                        status: nextStatus as any,
                        awardStrategy: 'SINGLE_VENDOR',
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
            
            console.log(`--- FINALIZE-SCORES END for REQ: ${requisitionId} (SINGLE_VENDOR) ---`);
            return NextResponse.json({ message: 'Award process finalized and routed for review.', requisition: result });

        } else if (awardStrategy === 'item') { // BEST_ITEM strategy
            // Placeholder logic for the new flow
             await prisma.purchaseRequisition.update({
                where: { id: requisitionId },
                data: {
                    awardStrategy: 'BEST_ITEM',
                    // Note: We are NOT changing the status yet. This will be handled by the new independent flow.
                }
            });
            
            console.log(`--- FINALIZE-SCORES END for REQ: ${requisitionId} (BEST_ITEM - COMING SOON) ---`);
            return NextResponse.json({ 
                message: 'Award strategy "Best Item" has been saved. The detailed implementation for this flow is coming soon.',
            }, { status: 202 }); // Use 202 Accepted to indicate the request is received but not fully processed yet.
        
        } else {
            return NextResponse.json({ error: 'Invalid award strategy specified.' }, { status: 400 });
        }
        // --- END BRANCHING LOGIC ---

    } catch (error) {
        console.error("[FINALIZE-SCORES] Failed to finalize scores and award:", error);
        if (error instanceof Error) {
            return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
        }
        return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
    }
}
