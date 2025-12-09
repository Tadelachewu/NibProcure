
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
                // Before changing status, check if another part of the workflow is active.
                const isAnyItemStillInReview = requisition.status.startsWith('Pending_');

                if (isAnyItemStillInReview) {
                    // Do not change the main requisition status. Let the review process continue.
                    console.log(`[PAYMENT] Payment for invoice ${invoiceId} processed, but requisition ${requisition.id} is still in review (${requisition.status}). Status will not be changed.`);
                } else {
                    const isPerItem = (requisition.rfqSettings as any)?.awardStrategy === 'item';
                    let isFullyComplete = false;

                    if (isPerItem) {
                        isFullyComplete = requisition.items.every(item => {
                            const details = (item.perItemAwardDetails as PerItemAwardDetail[] | undefined) || [];
                            if (details.length === 0) return true; // Not part of an award, so it's "complete" in this context.

                            const acceptedAward = details.find(d => d.status === 'Accepted');
                            if (acceptedAward) {
                                const po = requisition.purchaseOrders.find(p => p.items.some(pi => pi.requisitionItemId === item.id));
                                return po?.invoices.every(inv => inv.status === 'Paid' || inv.id === updatedInvoice.id) || false;
                            }
                            
                            // It's also complete if it failed and has no more standby options, or was restarted.
                            const hasStandby = details.some(d => d.status === 'Standby');
                            const hasFailed = details.some(d => d.status === 'Failed_to_Award' || d.status === 'Declined');
                            const hasBeenRestarted = details.some(d => d.status === 'Restarted');
                            
                            if (hasBeenRestarted) return true;
                            if (hasFailed && !hasStandby) return true;

                            return false;
                        });

                    } else { // Single-Vendor Logic
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
