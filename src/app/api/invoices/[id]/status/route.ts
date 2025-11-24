'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { users } from '@/lib/auth-store';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const invoiceId = params.id;
    const body = await request.json();
    const { status, userId } = body;

    const validStatuses = ['Approved for Payment', 'Disputed'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status provided.' }, { status: 400 });
    }
    
    const user = users.find(u => u.id === userId);
    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
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
            user: { connect: { id: user.id } },
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
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
