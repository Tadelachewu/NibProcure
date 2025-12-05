
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const actor = await getActorFromToken(request);
    if (!actor || !(actor.roles as string[]).includes('Finance')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    const invoiceId = params.id;
    const body = await request.json();
    const { status, reason } = body;

    const validStatuses = ['Approved_for_Payment', 'Disputed'];
    if (!validStatuses.includes(status.replace(/ /g, '_'))) {
      return NextResponse.json({ error: 'Invalid status provided.' }, { status: 400 });
    }
    
    const invoiceToUpdate = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoiceToUpdate) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    
    const oldStatus = invoiceToUpdate.status;

    const transactionResult = await prisma.$transaction(async (tx) => {
      const updatedInvoice = await tx.invoice.update({
          where: { id: invoiceId },
          data: { 
            status: status.replace(/ /g, '_') as any,
            disputeReason: status === 'Disputed' ? reason : null,
          }
      });
      
      // If disputed, find the related GRN and update its status
      if (status === 'Disputed') {
        const po = await tx.purchaseOrder.findUnique({
          where: { id: updatedInvoice.purchaseOrderId },
          include: { receipts: true }
        });
        
        if (po && po.receipts.length > 0) {
          // Assuming the most recent receipt is the one to dispute
          const receiptToDispute = po.receipts.sort((a, b) => new Date(b.receivedDate).getTime() - new Date(a.receivedDate).getTime())[0];
          await tx.goodsReceiptNote.update({
            where: { id: receiptToDispute.id },
            data: { status: 'Disputed' }
          });
        }
      }

      await tx.auditLog.create({
          data: {
              user: { connect: { id: actor.id } },
              timestamp: new Date(),
              action: 'UPDATE_INVOICE_STATUS',
              entity: 'Invoice',
              entityId: invoiceId,
              details: `Updated invoice status from "${oldStatus}" to "${status}". ${reason ? `Reason: ${reason}` : ''}`.trim(),
          }
      });
      
      return updatedInvoice;
    });


    return NextResponse.json(transactionResult);
  } catch (error) {
    console.error('Failed to update invoice status:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
