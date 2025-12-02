
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
        include: { po: true }
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
        
        if (invoiceToUpdate.po?.requisitionId) {
            const requisition = await tx.purchaseRequisition.findUnique({
                where: { id: invoiceToUpdate.po.requisitionId },
                include: { items: true, purchaseOrders: { include: { items: true, invoices: true }}}
            });
            
            if (requisition) {
                const isPerItem = (requisition.rfqSettings as any)?.awardStrategy === 'item';
                let isFullyComplete = false;

                if (isPerItem) {
                    // **REVISED LOGIC START**
                    // For per-item, every item must be in a terminal state to close the parent requisition.
                    isFullyComplete = requisition.items.every(item => {
                        const details = (item.perItemAwardDetails as PerItemAwardDetail[] | undefined) || [];
                        // If an item never went to award (e.g., added after), it's not a blocker.
                        if (details.length === 0) return true; 

                        const hasAcceptedAward = details.some(d => d.status === 'Accepted');
                        
                        if (hasAcceptedAward) {
                             // This item's award was accepted. Check if its corresponding invoice is now paid.
                             // We need to find the PO that contains this specific requisition item.
                             const acceptedPO = requisition.purchaseOrders.find(po => 
                                po.items.some(poi => poi.requisitionItemId === item.id)
                             );
                             
                             // If the PO exists, check if ANY of its invoices are paid. This is the crucial check.
                             // We need to refetch the LATEST state of the invoice within the transaction.
                             const isPaid = acceptedPO ? acceptedPO.invoices.some(inv => inv.id === updatedInvoice.id ? updatedInvoice.status === 'Paid' : inv.status === 'Paid') : false;
                             
                             return isPaid;
                        }
                        
                        // If the award was not accepted, it's "finished" if it failed or was restarted.
                        const isOtherwiseResolved = details.some(d => ['Failed_to_Award', 'Restarted', 'Declined'].includes(d.status));
                        return isOtherwiseResolved;
                    });
                    // **REVISED LOGIC END**

                } else {
                    // For single-vendor, check if all POs for this req are Delivered/Closed AND all invoices are Paid
                    const allPOsForRequisition = await tx.purchaseOrder.findMany({
                        where: { requisitionId: requisition.id },
                        include: { invoices: true }
                    });
                    
                    const allPOsClosed = allPOsForRequisition.length > 0 && allPOsForRequisition.every(po => 
                        ['Delivered', 'Closed', 'Cancelled'].includes(po.status.replace(/_/g, ' '))
                    );
                    const allInvoicesPaid = allPOsForRequisition.length > 0 && allPOsForRequisition.flatMap(po => po.invoices).every(inv => inv.status === 'Paid');

                    isFullyComplete = allPOsClosed && allInvoicesPaid;
                }

                if (isFullyComplete) {
                    await tx.purchaseRequisition.update({
                        where: { id: requisition.id },
                        data: { status: 'Closed' }
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
