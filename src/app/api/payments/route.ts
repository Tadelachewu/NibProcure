
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PerItemAwardDetail } from '@/lib/types';
import { getActorFromToken } from '@/lib/auth';

export async function POST(
  request: Request
) {
  try {
    const actor = await getActorFromToken(request);
    if (!actor || !(actor.roles as string[]).includes('Finance')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { invoiceId, paymentEvidenceUrl } = body;
    
    if (!paymentEvidenceUrl) {
      return NextResponse.json({ error: 'Payment evidence document is required.' }, { status: 400 });
    }

    const invoiceToUpdate = await prisma.invoice.findUnique({ 
        where: { id: invoiceId },
        include: { purchaseOrder: true }
    });
    if (!invoiceToUpdate) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    
    if (invoiceToUpdate.status !== 'Approved_for_Payment') {
        return NextResponse.json({ error: 'Invoice must be approved before payment.' }, { status: 400 });
    }
    
    const transactionResult = await prisma.$transaction(async (tx) => {

        const paymentReference = `PAY-${Date.now()}`;
        const updatedInvoice = await tx.invoice.update({
            where: { id: invoiceId },
            data: {
                status: 'Paid',
                paymentDate: new Date(),
                paymentReference: paymentReference,
                paymentEvidenceUrl: paymentEvidenceUrl,
            }
        });
        
        if (invoiceToUpdate.purchaseOrder?.requisitionId) {
            const requisition = await tx.purchaseRequisition.findUnique({
                where: { id: invoiceToUpdate.purchaseOrder.requisitionId },
                include: { items: true, purchaseOrders: { include: { items: true, invoices: true }}}
            });
            
            if (requisition) {
                const isPerItem = (requisition.rfqSettings as any)?.awardStrategy === 'item';
                let isFullyComplete = false;

                if (isPerItem) {
                    // Per-Item Logic: The ENTIRE requisition is complete only when EVERY item has reached a final state.
                    const allItemsFinished = requisition.items.every(item => {
                        const awardDetails = (item.perItemAwardDetails as any[] | undefined) || [];
                        
                        // If no awards were ever made for this item (e.g. it wasn't part of the final award), it is considered "finished" for this check.
                        if (awardDetails.length === 0) {
                            return true;
                        }

                        const hasTerminalStatus = awardDetails.some(d => ['Failed_to_Award', 'Declined', 'Restarted'].includes(d.status));
                        if (hasTerminalStatus) {
                            return true; // This item is finished because it failed or was restarted.
                        }

                        const acceptedAward = awardDetails.find(d => d.status === 'Accepted');
                        if (acceptedAward) {
                            // Find the PO associated with this accepted item
                            const itemPO = requisition.purchaseOrders.find(po => po.items.some(poi => poi.requisitionItemId === item.id));
                            if (!itemPO) return false; // If there's an accepted award, there must be a PO.
                            
                            // All invoices for this specific PO must be paid.
                            const allInvoicesForPO = itemPO.invoices;
                            if (allInvoicesForPO.length === 0) return false; // Must have an invoice to be considered paid.

                            // The current invoice being paid might not be in the database yet, so we check against its ID.
                            return allInvoicesForPO.every(inv => inv.status === 'Paid' || inv.id === updatedInvoice.id);
                        }
                        
                        // If an item has award details, but none are in a terminal or accepted state, it's not finished.
                        return false;
                    });
                    
                    isFullyComplete = allItemsFinished;

                } else {
                    // Single-Vendor Logic: All POs for this requisition must be in a terminal state, and all invoices paid.
                    const allPOsForRequisition = await tx.purchaseOrder.findMany({
                        where: { requisitionId: requisition.id },
                        include: { invoices: true }
                    });
                    
                    const allPOsClosed = allPOsForRequisition.length > 0 && allPOsForRequisition.every(po => 
                        ['Delivered', 'Closed', 'Cancelled'].includes(po.status)
                    );

                    const allInvoicesPaid = allPOsForRequisition.length > 0 && allPOsForRequisition.flatMap(po => po.invoices).every(inv => {
                        return inv.status === 'Paid' || inv.id === updatedInvoice.id;
                    });

                    isFullyComplete = allPOsClosed && allInvoicesPaid;
                }

                if (isFullyComplete) {
                     // Check if a partial status was already set. If not, set it. Otherwise, set to Closed.
                    const nextStatus = requisition.status === 'Partially_Closed' ? 'Closed' : 
                                       isFullyComplete ? 'Closed' : 'Partially_Closed';
                    await tx.purchaseRequisition.update({
                        where: { id: requisition.id },
                        data: { status: nextStatus }
                    });
                } else if (isPerItem) {
                    // If not fully complete, but at least one item is now paid, we can set the status to Partially_Closed
                     await tx.purchaseRequisition.update({
                        where: { id: requisition.id },
                        data: { status: 'Partially_Closed' }
                    });
                }
            }
        }
        
        await tx.auditLog.create({
            data: {
                user: { connect: { id: actor.id } },
                timestamp: new Date(),
                action: 'PROCESS_PAYMENT',
                entity: 'Invoice',
                entityId: invoiceId,
                details: `Processed payment for invoice ${invoiceId}. Ref: ${paymentReference}.`,
                transactionId: invoiceToUpdate.transactionId,
            }
        });

        return updatedInvoice;
    });
    
    return NextResponse.json(transactionResult);
  } catch (error) {
    console.error('[PROCESS-PAYMENT] Failed to process payment:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
