
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
    const { status } = body;

    const validStatuses = ['Approved_for_Payment', 'Disputed'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status provided.' }, { status: 400 });
    }
    
    const invoiceToUpdate = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoiceToUpdate) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const oldStatus = invoiceToUpdate.status;
    const updatedInvoice = await prisma.invoice.update({
        where: { id: invoiceId },
        data: { status: status.replace(/ /g, '_') as any }
    });
    
    await prisma.auditLog.create({
        data: {
            user: { connect: { id: actor.id } },
            timestamp: new Date(),
            action: 'UPDATE_INVOICE_STATUS',
            entity: 'Invoice',
            entityId: invoiceId,
            details: `Updated invoice status from "${oldStatus}" to "${status}".`,
        }
    });

    return NextResponse.json(updatedInvoice);
  } catch (error) {
    console.error('Failed to update invoice status:', error);
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
