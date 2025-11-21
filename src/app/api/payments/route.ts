
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(
  request: Request
) {
  console.log('[PROCESS-PAYMENT] Received payment processing request.');
  try {
    const body = await request.json();
    console.log('[PROCESS-PAYMENT] Request body:', body);
    const { invoiceId, userId, paymentEvidenceUrl } = body;

    const user = await prisma.user.findUnique({where: {id: userId}});
    if (!user) {
        console.error('[PROCESS-PAYMENT] User not found for ID:', userId);
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
        console.error('[PROCESS-PAYMENT] Invoice not found for ID:', invoiceId);
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    console.log(`[PROCESS-PAYMENT] Found invoice to pay: ${invoiceToUpdate.id}`);
    
    if (invoiceToUpdate.status !== 'Approved_for_Payment') {
        console.error(`[PROCESS-PAYMENT] Invoice ${invoiceId} is not approved for payment. Current status: ${invoiceToUpdate.status}`);
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
        console.log('[PROCESS-PAYMENT] Invoice updated to Paid status.');

        // **MODIFIED LOGIC START**
        // Check if all POs for the requisition are fulfilled before closing the requisition
        if (invoiceToUpdate.po) {
            const requisitionId = invoiceToUpdate.po.requisitionId;
            console.log(`[PROCESS-PAYMENT] Checking completion status for all POs on Requisition ${requisitionId}`);

            // Find all purchase orders associated with the same requisition
            const allPOsForRequisition = await tx.purchaseOrder.findMany({
                where: { requisitionId: requisitionId }
            });
            console.log(`[PROCESS-PAYMENT] Found ${allPOsForRequisition.length} POs for this requisition.`);

            // Check if all of them are in a final state (Delivered, Closed, or Cancelled)
            const allPOsCompleted = allPOsForRequisition.every(po => 
                ['Delivered', 'Closed', 'Cancelled'].includes(po.status.replace(/_/g, ' '))
            );

            if (allPOsForRequisition.length > 0 && allPOsCompleted) {
                console.log(`[PROCESS-PAYMENT] All POs are complete. Updating Requisition ${requisitionId} status to Closed.`);
                await tx.purchaseRequisition.update({
                    where: { id: requisitionId },
                    data: { status: 'Closed' }
                });
            } else {
                console.log(`[PROCESS-PAYMENT] Not all POs for requisition ${requisitionId} are complete. Requisition status remains unchanged.`);
            }
        } else {
             console.log(`[PROCESS-PAYMENT] Invoice ${invoiceId} is not associated with a PO. Cannot check requisition status.`);
        }
        // **MODIFIED LOGIC END**
        
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
        console.log('[PROCESS-PAYMENT] Added audit log.');

        return updatedInvoice;
    });
    
    console.log('[PROCESS-PAYMENT] Transaction complete.');
    return NextResponse.json(transactionResult);
  } catch (error) {
    console.error('[PROCESS-PAYMENT] Failed to process payment:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
