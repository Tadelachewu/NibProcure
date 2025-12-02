
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';
import { invoiceSchema } from '@/lib/schemas';
import { ZodError } from 'zod';

export async function GET() {
  try {
    const invoices = await prisma.invoice.findMany({
      orderBy: { invoiceDate: 'desc' },
    });
    return NextResponse.json(invoices);
  } catch (error) {
    console.error('Failed to fetch invoices:', error instanceof Error ? error.message : 'An unknown error occurred');
    return NextResponse.json({ error: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await getActorFromToken(request);
    if (!actor) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { purchaseOrderId, vendorId, invoiceDate, items, totalAmount, documentUrl } = invoiceSchema.parse(body);


    if (actor.vendorId !== vendorId && !(actor.roles as string[]).includes('Finance')) {
        return NextResponse.json({ error: 'You are not authorized to submit an invoice for this vendor.' }, { status: 403 });
    }

    const po = await prisma.purchaseOrder.findUnique({ where: { id: purchaseOrderId } });
    if (!po) {
      return NextResponse.json({ error: 'Purchase Order not found' }, { status: 404 });
    }

    const newInvoice = await prisma.invoice.create({
      data: {
        transactionId: po.transactionId,
        purchaseOrderId: purchaseOrderId,
        vendorId: vendorId,
        invoiceDate: new Date(invoiceDate),
        totalAmount,
        status: 'Pending',
        documentUrl,
        items: {
          create: items.map((item: any) => ({
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
          })),
        },
      },
    });
    
    await prisma.quotation.updateMany({
        where: {
            requisitionId: po.requisitionId,
            vendorId: vendorId,
            status: 'Accepted'
        },
        data: {
            status: 'Invoice_Submitted'
        }
    });

    await prisma.auditLog.create({
        data: {
            transactionId: po.transactionId,
            user: { connect: { id: actor.id } },
            timestamp: new Date(),
            action: 'CREATE_INVOICE',
            entity: 'Invoice',
            entityId: newInvoice.id,
            details: `Created Invoice for PO ${purchaseOrderId}.`,
        }
    });

    return NextResponse.json(newInvoice, { status: 201 });
  } catch (error) {
     if (error instanceof ZodError) {
        return NextResponse.json({ error: 'Invalid input data', details: error.errors }, { status: 400 });
    }
    console.error('[SUBMIT-INVOICE] Failed to create invoice:', error instanceof Error ? error.message : 'An unknown error occurred');
    return NextResponse.json({ error: 'An internal server error occurred' }, { status: 500 });
  }
}
