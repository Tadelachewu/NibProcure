

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
                    const allItemDetails = requisition.items.flatMap(i => i.perItemAwardDetails as PerItemAwardDetail[] || []);
                    const allInvoices = requisition.purchaseOrders.flatMap(po => po.invoices);
                    
                    // An item is 'resolved' if its award has been accepted and its corresponding invoice has been paid,
                    // OR if its award track failed or was restarted.
                    const areAllItemsResolved = requisition.items.every(item => {
                        const details = (item.perItemAwardDetails as PerItemAwardDetail[] | undefined) || [];
                        const winningBid = details.find(d => d.status === 'Accepted');
                        
                        if (winningBid) {
                            // Find the invoice related to this specific winning bid's PO
                            const po = requisition.purchaseOrders.find(p => p.vendorId === winningBid.vendorId && p.items.some(pi => pi.requisitionItemId === item.id));
                            const invoice = allInvoices.find(inv => inv.purchaseOrderId === po?.id);
                            return invoice?.status === 'Paid';
                        }
                        
                        // If no winning bid, check if the award process for this item failed
                        const hasFailed = details.some(d => d.status === 'Failed_to_Award' || d.status === 'Restarted');
                        // If no awards were ever made for this item, it's not resolved.
                        if (details.length === 0) return false;

                        return hasFailed;
                    });
                    
                    isFullyComplete = areAllItemsResolved;

                } else {
                    // For single-vendor, check if all POs are delivered/closed and paid
                    const allPOsForRequisition = await tx.purchaseOrder.findMany({
                        where: { requisitionId: requisition.id },
                        include: { invoices: true }
                    });
                    
                    isFullyComplete = allPOsForRequisition.length > 0 && allPOsForRequisition.every(po => {
                        const isDeliveredOrCancelled = ['Delivered', 'Closed', 'Cancelled'].includes(po.status.replace(/_/g, ' '));
                        const areInvoicesPaid = po.invoices.length > 0 && po.invoices.every(inv => inv.status === 'Paid');
                        return isDeliveredOrCancelled || areInvoicesPaid;
                    });
                }
                
                let newStatus = requisition.status;
                if (isFullyComplete) {
                    newStatus = 'Closed';
                } else if (isPerItem) {
                    // If not fully complete, but at least one invoice is paid, it's partially closed
                    newStatus = 'Partially_Closed';
                }

                if (newStatus !== requisition.status) {
                    await tx.purchaseRequisition.update({
                        where: { id: requisition.id },
                        data: { status: newStatus }
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
