
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { User, Quotation } from '@/lib/types';
import { getNextApprovalStep, handleItemAwardRejection } from '@/services/award-service';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const requisitionId = params.id;
  try {
    const body = await request.json();
    const { userId } = body;

    const user: User | null = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || (user.role !== 'Procurement_Officer' && user.role !== 'Admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const result = await prisma.$transaction(async (tx) => {
        const requisition = await tx.purchaseRequisition.findUnique({
            where: { id: requisitionId },
            include: { 
                quotations: { include: { items: true } },
                items: true, // RequisitionItems
            }
        });

        if (!requisition || (requisition.status !== 'Award_Declined' && requisition.status !== 'Partially_Award_Declined')) {
            throw new Error("This requisition is not in a state where a standby vendor can be promoted.");
        }
        
        // --- START STRATEGY DETECTION ---
        const isPerItemStrategy = requisition.quotations.some(q => q.status === 'Partially_Awarded' || q.status === 'Partially_Award_Declined');
        // --- END STRATEGY DETECTION ---

        if (isPerItemStrategy) {
            // --- PER-ITEM PROMOTION LOGIC ---
            const declinedItems = await tx.quoteItem.findMany({
                where: {
                    quotation: { requisitionId: requisitionId },
                    status: 'Declined'
                }
            });
            const declinedReqItemIds = new Set(declinedItems.map(i => i.requisitionItemId));
            
            let promotionsInitiated = 0;
            let itemsResetToRfq = 0;

            for (const reqItemId of declinedReqItemIds) {
                // Find the next standby for this specific requisition item
                const nextStandby = await tx.quoteItem.findFirst({
                    where: {
                        requisitionItemId: reqItemId,
                        status: 'Standby'
                    },
                    orderBy: { rank: 'asc' },
                    include: { quotation: true }
                });

                if (nextStandby) {
                    await tx.quoteItem.update({
                        where: { id: nextStandby.id },
                        data: { status: 'Pending_Award' }
                    });
                     // Ensure the parent quote reflects it has a pending award
                    await tx.quotation.update({
                        where: { id: nextStandby.quotationId },
                        data: { status: 'Partially_Awarded' }
                    });
                    promotionsInitiated++;
                } else {
                    // No more standbys, reset this specific requisition item for re-sourcing
                    await tx.requisitionItem.update({
                        where: { id: reqItemId },
                        data: { status: 'Needs_RFQ' }
                    });
                    itemsResetToRfq++;
                }
            }
            
            // Now, we determine the new overall status of the requisition
            let newRequisitionStatus: any = requisition.status;
            if (promotionsInitiated > 0) {
                 const { nextStatus, nextApproverId, auditDetails } = await getNextApprovalStep(tx, requisition.totalPrice); // Re-route for approval
                 newRequisitionStatus = nextStatus;
                 await tx.purchaseRequisition.update({ where: { id: requisition.id }, data: { currentApproverId: nextApproverId, status: newRequisitionStatus }});

                 await tx.auditLog.create({
                    data: {
                        timestamp: new Date(), user: { connect: { id: userId } }, action: 'PROMOTE_STANDBY', entity: 'Requisition', entityId: requisition.id, transactionId: requisition.transactionId,
                        details: `Promoted standby vendors for ${promotionsInitiated} declined item(s). Re-routing for approval. ${itemsResetToRfq > 0 ? `${itemsResetToRfq} item(s) reset to "Needs RFQ".` : ''} ${auditDetails}`
                    }
                });
            } else if (itemsResetToRfq > 0) {
                 // If only resets occurred, the status might stay Partially_Award_Declined but some items are now Needs_RFQ
                 await tx.auditLog.create({
                    data: {
                        timestamp: new Date(), user: { connect: { id: userId } }, action: 'PROMOTE_STANDBY_FAILED', entity: 'Requisition', entityId: requisition.id, transactionId: requisition.transactionId,
                        details: `${itemsResetToRfq} item(s) had no standby vendors and were reset to "Needs RFQ".`
                    }
                });
            }

            return { message: 'Standby promotion process completed for per-item awards.' };

        } else {
            // --- SINGLE-VENDOR PROMOTION LOGIC ---
            const standbyQuote = await tx.quotation.findFirst({
                where: { requisitionId: requisitionId, status: 'Standby' },
                orderBy: { rank: 'asc' },
                include: { items: true }
            });

            if (!standbyQuote) {
                 // "Deep clean" and reset
                await tx.minute.deleteMany({where: {requisitionId}});
                await tx.score.deleteMany({where: {itemScore: {scoreSet: {quotation: {requisitionId}}}}});
                await tx.itemScore.deleteMany({where: {scoreSet: {quotation: {requisitionId}}}}});
                await tx.committeeScoreSet.deleteMany({where: {quotation: {requisitionId}}});
                await tx.quotation.deleteMany({where: {requisitionId}});
                
                await tx.purchaseRequisition.update({
                    where: { id: requisition.id },
                    data: { status: 'PreApproved', currentApproverId: null, deadline: null }
                });
                 await tx.auditLog.create({
                    data: {
                        timestamp: new Date(), user: { connect: { id: userId } }, action: 'RESET_RFQ', entity: 'Requisition', entityId: requisition.id, transactionId: requisition.transactionId,
                        details: `All vendors declined or were rejected. No standbys left. Requisition automatically reset to "PreApproved" for a new RFQ process.`
                    }
                });
                return { message: "No standby vendors available. Requisition has been reset for a new RFQ."};
            }
            
            // Promote the standby quote to Pending_Award
            await tx.quotation.update({ where: { id: standbyQuote.id }, data: { status: 'Pending_Award', rank: 1 }});

            const newTotalPrice = standbyQuote.totalPrice;
            const { nextStatus, nextApproverId, auditDetails } = await getNextApprovalStep(tx, newTotalPrice);
            
            const updatedRequisition = await tx.purchaseRequisition.update({
                where: { id: requisition.id },
                data: { 
                    status: nextStatus as any,
                    totalPrice: newTotalPrice,
                    awardedQuoteItemIds: [],
                    currentApproverId: nextApproverId
                }
            });

            await tx.auditLog.create({
                data: {
                    timestamp: new Date(),
                    user: { connect: { id: userId } },
                    action: 'PROMOTE_STANDBY',
                    entity: 'Requisition',
                    entityId: requisition.id,
                    details: `Manually promoted standby vendor ${standbyQuote.vendorName}. ${auditDetails}`,
                    transactionId: requisition.transactionId,
                }
            });
            
            return updatedRequisition;
        }
    });

    return NextResponse.json({ message: "Standby promotion process initiated.", details: result });

  } catch (error) {
    console.error(`Failed to promote standby for requisition ${requisitionId}:`, error);
    if (error instanceof Error) {
      return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
