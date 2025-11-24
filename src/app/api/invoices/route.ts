'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const invoices = await prisma.invoice.findMany({
      orderBy: { invoiceDate: 'desc' },
    });
    return NextResponse.json(invoices);
  } catch (error) {
    console.error('Failed to fetch invoices:', error);
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { purchaseOrderId, vendorId, invoiceDate, items, totalAmount, documentUrl, userId } = body;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
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
            user: { connect: { id: user.id } },
            timestamp: new Date(),
            action: 'CREATE_INVOICE',
            entity: 'Invoice',
            entityId: newInvoice.id,
            details: `Created Invoice for PO ${purchaseOrderId}.`,
        }
    });

    return NextResponse.json(newInvoice, { status: 201 });
  } catch (error) {
    console.error('[SUBMIT-INVOICE] Failed to create invoice:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
