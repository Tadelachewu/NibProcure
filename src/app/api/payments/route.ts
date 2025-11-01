
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(
  request: Request
) {
  console.log('POST /api/payments - Processing payment.');
  try {
    const body = await request.json();
    console.log('Request body:', body);
    const { invoiceId, userId } = body;

    const user = await prisma.user.findUnique({where: {id: userId}});
    if (!user) {
        console.error('User not found for ID:', userId);
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    const invoiceToUpdate = await prisma.invoice.findUnique({ 
        where: { id: invoiceId },
        include: { po: true }
    });
    if (!invoiceToUpdate) {
        console.error('Invoice not found for ID:', invoiceId);
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    console.log('Found invoice to pay:', invoiceToUpdate);
    
    if (invoiceToUpdate.status !== 'Approved_for_Payment') {
        console.error(`Invoice ${invoiceId} is not approved for payment. Current status: ${invoiceToUpdate.status}`);
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
            }
        });
        console.log('Invoice updated to Paid status.');

        // **MODIFIED LOGIC START**
        // Check if all POs for the requisition are fulfilled before closing the requisition
        if (invoiceToUpdate.po) {
            const requisitionId = invoiceToUpdate.po.requisitionId;

            // Find all purchase orders associated with the same requisition
            const allPOsForRequisition = await tx.purchaseOrder.findMany({
                where: { requisitionId: requisitionId }
            });

            // Check if all of them are in a final state (Delivered, Closed, or Cancelled)
            const allPOsCompleted = allPOsForRequisition.every(po => 
                ['Delivered', 'Closed', 'Cancelled'].includes(po.status.replace(/_/g, ' '))
            );

            if (allPOsForRequisition.length > 0 && allPOsCompleted) {
                await tx.purchaseRequisition.update({
                    where: { id: requisitionId },
                    data: { status: 'Closed' }
                });
                console.log(`All POs for requisition ${requisitionId} are complete. Requisition status updated to Closed.`);
            } else {
                console.log(`Not all POs for requisition ${requisitionId} are complete. Requisition status remains unchanged.`);
            }
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
        console.log('Added audit log:');

        return updatedInvoice;
    });

    return NextResponse.json(transactionResult);
  } catch (error) {
    console.error('Failed to process payment:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
