'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';
import { z } from 'zod';

const invoiceItemSchema = z.object({
  name: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number().positive(),
  totalPrice: z.number().positive(),
});

const invoiceSchema = z.object({
  purchaseOrderId: z.string(),
  vendorId: z.string(),
  invoiceDate: z.string().refine((date) => !isNaN(Date.parse(date)), { message: "Invalid date string" }),
  items: z.array(invoiceItemSchema),
  totalAmount: z.number().positive(),
  documentUrl: z.string().url().optional(),
});


export async function GET(request: Request) {
  try {
    // Enforce authentication for this endpoint
    const actor = await getActorFromToken(request);
    if (!actor) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
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
    const actor = await getActorFromToken(request);
    if (!actor) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const validation = invoiceSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid request data', details: validation.error.flatten() }, { status: 400 });
    }
    const { purchaseOrderId, vendorId, invoiceDate, items, totalAmount, documentUrl } = validation.data;

    if (actor.vendorId !== vendorId && !(actor.roles as string[]).includes('Finance')) {
        return NextResponse.json({ error: 'You are not authorized to submit an invoice for this vendor.' }, { status: 403 });
    }

    const po = await prisma.purchaseOrder.findUnique({ where: { id: purchaseOrderId } });
    if (!po) {
      return NextResponse.json({ error: 'Purchase Order not found' }, { status: 404 });
    }

    // Server-side validation of total amount
    const calculatedTotal = items.reduce((acc, item) => acc + item.totalPrice, 0);
    if (Math.abs(calculatedTotal - totalAmount) > 0.01) { // Use a tolerance for floating point
        return NextResponse.json({ error: `Calculated total (${calculatedTotal.toFixed(2)}) does not match submitted total amount (${totalAmount.toFixed(2)}).`}, { status: 400 });
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
    console.error('[SUBMIT-INVOICE] Failed to create invoice:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
