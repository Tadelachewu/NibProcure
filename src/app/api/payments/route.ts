
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
                    // Per-Item Logic: The ENTIRE requisition is complete only when EVERY item has reached a final, resolved state.
                    const allItemsFinished = requisition.items.every(item => {
                        const awardDetails = (item.perItemAwardDetails as PerItemAwardDetail[] | undefined) || [];
                        
                        // If an item never went to award, it's considered "finished" for this check.
                        if (awardDetails.length === 0) {
                            return true;
                        }

                        // An item is considered resolved if it has been restarted.
                        if (awardDetails.some(d => d.status === 'Restarted')) {
                            return true;
                        }

                        // An item is resolved if its award was accepted AND its invoice has now been paid.
                        const acceptedAward = awardDetails.find(d => d.status === 'Accepted');
                        if (acceptedAward) {
                            const itemPO = requisition.purchaseOrders.find(po => po.items.some(poi => poi.requisitionItemId === item.id));
                            if (!itemPO) return false;
                            
                            // Check if ALL invoices related to this specific PO are paid.
                            const allInvoicesForPO = itemPO.invoices;
                            if (allInvoicesForPO.length === 0) return false;

                            return allInvoicesForPO.every(inv => inv.status === 'Paid' || inv.id === updatedInvoice.id);
                        }

                        // An item is resolved if it failed to award and there are no more standbys.
                         const hasFailedAward = awardDetails.some(d => d.status === 'Failed_to_Award');
                         const hasStandby = awardDetails.some(d => d.status === 'Standby');
                         if(hasFailedAward && !hasStandby) {
                             return true;
                         }
                        
                        // If an item has award details, but none of the above terminal conditions are met, it's not finished.
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
                    await tx.purchaseRequisition.update({
                        where: { id: requisition.id },
                        data: { status: 'Closed' }
                    });
                } else if (isPerItem) {
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
