

'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PerItemAwardDetail } from '@/lib/types';

export async function POST(
  request: Request
) {
  try {
    const body = await request.json();
    const { invoiceId, userId, paymentEvidenceUrl } = body;

    const user = await prisma.user.findUnique({where: {id: userId}});
    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
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
                include: { 
                    items: true,
                    purchaseOrders: {
                        include: { invoices: true }
                    }
                }
            });
            
            if (requisition) {
                const isPerItem = (requisition.rfqSettings as any)?.awardStrategy === 'item';
                let isFullyComplete = false;

                if (isPerItem) {
                    // For per-item, every item must be in a terminal state (Accepted/Paid, Failed, or Restarted)
                    isFullyComplete = requisition.items.every(item => {
                        const details = item.perItemAwardDetails as PerItemAwardDetail[] | null;
                        if (!details || details.length === 0) {
                            // If an item has no award details, it was never part of an award process, so it's not 'complete'.
                            // A truly complete requisition would have had some resolution for every item.
                            return false;
                        }
                        // An item is considered resolved if its winning bid has been actioned to a final state.
                        return details.some(d => d.status === 'Accepted' || d.status === 'Failed_to_Award' || d.status === 'Restarted');
                    });

                } else {
                    // For single-vendor, check if all POs are delivered/closed/paid
                    const allPOsForRequisition = await tx.purchaseOrder.findMany({
                        where: { requisitionId: requisition.id },
                        include: { invoices: true }
                    });
                    
                    isFullyComplete = allPOsForRequisition.length > 0 && allPOsForRequisition.every(po => {
                        const isDelivered = ['Delivered', 'Closed', 'Cancelled'].includes(po.status.replace(/_/g, ' '));
                        const isPaid = po.invoices.every(inv => inv.status === 'Paid');
                        return isDelivered || isPaid;
                    });
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
                user: { connect: { id: user.id } },
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

