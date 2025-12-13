
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
        include: { po: { include: { receipts: true } } }
    });
    if (!invoiceToUpdate) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    
    if (invoiceToUpdate.status !== 'Approved_for_Payment') {
        return NextResponse.json({ error: 'Invoice must be approved before payment.' }, { status: 400 });
    }

    // Prevent payment when the related PO has a disputed goods receipt
    if (invoiceToUpdate.po?.receipts?.some(r => r.status === 'Disputed')) {
        return NextResponse.json({ error: 'Cannot process payment: associated goods receipt is disputed.' }, { status: 400 });
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
                include: { 
                    items: true, 
                    purchaseOrders: { 
                        include: { 
                            invoices: true,
                            items: true, // Include PO items
                        }
                    }
                }
            });
            
            if (requisition) {
                const isPerItem = (requisition.rfqSettings as any)?.awardStrategy === 'item';
                let isFullyComplete = false;

                if (isPerItem) {
                    // For per-item, every item must be in a terminal state (Accepted, Failed, or Restarted)
                    isFullyComplete = requisition.items.every(item => {
                        const details = (item.perItemAwardDetails as PerItemAwardDetail[] | undefined) || [];
                        if (details.length === 0) return true; // If an item never went to award, it's considered "complete" for this check
                        
                        // Check if an item is considered resolved.
                        const isResolved = details.some(d => ['Accepted', 'Failed_to_Award', 'Restarted'].includes(d.status));
                        
                        // If it's resolved and Accepted, we need to make sure its corresponding invoice is paid.
                        if (details.some(d => d.status === 'Accepted')) {
                             const acceptedPO = requisition.purchaseOrders.find(po => po.items.some(poi => poi.requisitionItemId === item.id));
                             const isPaid = acceptedPO?.invoices.some(inv => inv.status === 'Paid');
                             return isPaid;
                        }

                        // If it's not in an 'Accepted' state, being Failed or Restarted is enough to be complete.
                        return isResolved && !details.some(d => d.status === 'Accepted');
                    });

                } else {
                    // For single-vendor, check if all POs for this req are Delivered/Closed AND all invoices are Paid
                    const allPOsForRequisition = await tx.purchaseOrder.findMany({
                        where: { requisitionId: requisition.id },
                        include: { invoices: true }
                    });
                    
                    const allPOsClosed = allPOsForRequisition.length > 0 && allPOsForRequisition.every(po => 
                        ['Delivered', 'Closed', 'Cancelled'].includes(po.status.replace(/_/g, ' '))
                    );
                    const allInvoicesPaid = allPOsForRequisition.flatMap(po => po.invoices).every(inv => inv.status === 'Paid');

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
