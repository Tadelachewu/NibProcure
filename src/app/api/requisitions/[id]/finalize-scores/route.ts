

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
                const allQuotesForReq = await tx.quotation.findMany({
                    where: { requisitionId: requisitionId }
                });

                if (allQuotesForReq.length === 0) {
                    throw new Error("Cannot finalize award, no quotes found.");
                }

                const sortedQuotes = allQuotesForReq.sort((a, b) => (b.finalAverageScore || 0) - (a.finalAverageScore || 0));

                for (let i = 0; i < sortedQuotes.length; i++) {
                    const quote = sortedQuotes[i];
                    if (i === 0) { // The winner
                        await tx.quotation.update({ where: { id: quote.id }, data: { status: 'Pending_Award', rank: 1 } });
                        // For single-vendor award, all items in the winning quote are considered pending award
                        await tx.quoteItem.updateMany({
                            where: { quotationId: quote.id },
                            data: { status: 'Pending_Award', rank: 1 }
                        });
                    } else if (i === 1 || i === 2) { // Standbys
                        await tx.quotation.update({ where: { id: quote.id }, data: { status: 'Standby', rank: (i + 1) as 2 | 3 } });
                    } else { // All others
                        await tx.quotation.update({ where: { id: quote.id }, data: { status: 'Rejected', rank: null } });
                    }
                }

                 // Mark all requisition items as awarded since it's a single-vendor award
                await tx.requisitionItem.updateMany({
                    where: { requisitionId: requisitionId },
                    data: { status: 'Awarded' }
                });


            } else { // Per-item award logic
                // THIS LOGIC IS INTENTIONALLY DEFERRED PER USER REQUEST
                // For now, we will only support the single-vendor award flow.
                throw new Error("Per-item award strategy is not yet fully implemented in this path.");
            }
            
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
