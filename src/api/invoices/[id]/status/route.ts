
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
    const { status, reason, returnToReceiving } = body;

    const validStatuses = ['Approved for Payment', 'Disputed'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status provided.' }, { status: 400 });
    }
    
    const invoiceToUpdate = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoiceToUpdate) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const oldStatus = invoiceToUpdate.status;
    const updateData: any = { status: status.replace(/ /g, '_') };
    if (status === 'Disputed' && reason) {
      updateData.disputeReason = reason;
    }

    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: updateData
    });

    // If finance chose to return the invoice to receiving, mark the latest GRN for the PO as Disputed
    if (status === 'Disputed' && returnToReceiving) {
      try {
        const latestGrn = await prisma.goodsReceiptNote.findFirst({
          where: { purchaseOrderId: invoiceToUpdate.purchaseOrderId },
          orderBy: { receivedDate: 'desc' },
          include: { items: true }
        });

        if (latestGrn) {
          await prisma.goodsReceiptNote.update({
            where: { id: latestGrn.id },
            data: { status: 'Disputed' }
          });
          await prisma.auditLog.create({
            data: {
              user: { connect: { id: actor.id } },
              timestamp: new Date(),
              action: 'RETURN_TO_RECEIVING',
              entity: 'GoodsReceiptNote',
              entityId: latestGrn.id,
              details: `Finance returned invoice ${invoiceId} to receiving. Reason: "${reason || 'No reason provided.'}"`,
              transactionId: invoiceToUpdate.transactionId || undefined
            }
          });
        }
      } catch (err) {
        console.error('Failed to mark GRN as disputed when returning to receiving:', err);
      }
    }
    
    await prisma.auditLog.create({
        data: {
            user: { connect: { id: actor.id } },
            timestamp: new Date(),
            action: 'UPDATE_INVOICE_STATUS',
            entity: 'Invoice',
            entityId: invoiceId,
            details: `Updated invoice status from "${oldStatus}" to "${status}". ${reason ? `Reason: "${reason}"` : ''}`.trim(),
            transactionId: updatedInvoice.transactionId,
        }
    });

    return NextResponse.json(updatedInvoice);
  } catch (error) {
    console.error('Failed to update invoice status:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
