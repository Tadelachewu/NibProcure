'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { addDays } from 'date-fns';
import { getActorFromToken, isActorAuthorizedForRequisition } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const actor = await getActorFromToken(request);
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const {
      requisitionId,
      vendorId,
      items,
      notes,
      answers,
      cpoDocumentUrl,
      experienceDocumentUrl,
      bidDocumentUrl,
    } = body || {};

    if (!requisitionId || !vendorId || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'requisitionId, vendorId, and items are required' },
        { status: 400 }
      );
    }

    const isAuthorized = await isActorAuthorizedForRequisition(actor, String(requisitionId));
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const requisition = await prisma.purchaseRequisition.findUnique({ where: { id: String(requisitionId) } });
    if (!requisition) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
    }

    const rfqSettings = (requisition.rfqSettings || {}) as any;
    const isUnmasked = rfqSettings?.masked === false || Boolean(rfqSettings?.directorPresenceVerified);
    if (!isUnmasked) {
      return NextResponse.json(
        { error: 'RFQ is still sealed. Unmask vendor quotations before adding manual quotations.' },
        { status: 400 }
      );
    }

    const vendor = await prisma.vendor.findUnique({ where: { id: String(vendorId) }, include: { user: true } });
    if (!vendor) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
    }

    const existingQuote = await prisma.quotation.findFirst({
      where: { requisitionId: String(requisitionId), vendorId: String(vendorId) },
    });
    if (existingQuote) {
      return NextResponse.json(
        { error: 'A quotation already exists for this vendor and requisition.' },
        { status: 409 }
      );
    }

    let totalPrice = 0;
    let maxLeadTime = 0;

    items.forEach((item: any) => {
      totalPrice += (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0);
      const ltd = Number(item.leadTimeDays) || 0;
      if (ltd > maxLeadTime) maxLeadTime = ltd;
    });

    const createData: any = {
      transactionId: requisition.transactionId,
      requisition: { connect: { id: String(requisitionId) } },
      vendor: { connect: { id: String(vendorId) } },
      vendorName: vendor.name,
      submissionMethod: 'Manual',
      totalPrice,
      deliveryDate: addDays(new Date(), maxLeadTime),
      status: 'Submitted',
      notes,
      cpoDocumentUrl,
      experienceDocumentUrl,
      bidDocumentUrl,
      items: {
        create: items.map((item: any) => ({
          requisitionItemId: String(item.requisitionItemId),
          name: String(item.name),
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          leadTimeDays: Number(item.leadTimeDays),
          brandDetails: item.brandDetails ? String(item.brandDetails) : null,
          imageUrl: item.imageUrl ? String(item.imageUrl) : null,
        })),
      },
      answers: {
        create: (Array.isArray(answers) ? answers : []).map((ans: any) => ({
          questionId: String(ans.questionId),
          answer: String(ans.answer ?? ''),
        })),
      },
    };

    const newQuotation = await (prisma.quotation as any).create({ data: createData });

    await prisma.auditLog.create({
      data: {
        transactionId: requisition.transactionId,
        timestamp: new Date(),
        user: { connect: { id: actor.id } },
        action: 'SUBMIT_QUOTATION_MANUAL',
        entity: 'Quotation',
        entityId: newQuotation.id,
        details: `Manually uploaded quotation for vendor ${vendor.name} on requisition ${requisitionId}.`,
      },
    });

    return NextResponse.json(newQuotation, { status: 201 });
  } catch (error) {
    console.error('Failed to create manual quotation:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: 'Failed to process manual quotation', details: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
