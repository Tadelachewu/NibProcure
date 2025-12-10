
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { addDays } from 'date-fns';
import { User } from '@/lib/types';


export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requisitionId = searchParams.get('requisitionId');

  if (!requisitionId) {
    return NextResponse.json({ error: 'Requisition ID is required' }, { status: 400 });
  }

  try {
    const reqQuotations = await prisma.quotation.findMany({
      where: { requisitionId },
      include: {
        items: true,
        answers: true,
        scores: {
          include: {
            scorer: true, // Include the scorer relation
            itemScores: {
              include: {
                scores: true,
              },
            },
          },
        },
      },
    });
    return NextResponse.json(reqQuotations);
  } catch (error) {
    console.error('Failed to fetch quotations:', error);
    return NextResponse.json({ error: 'Failed to fetch quotations' }, { status: 500 });
  }
}


export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { requisitionId, vendorId, items, notes, answers, cpoDocumentUrl, experienceDocumentUrl } = body;

    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId }, include: { user: true } });
    if (!vendor) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
    }
    
    const requisition = await prisma.purchaseRequisition.findUnique({ where: { id: requisitionId } });
    if (!requisition) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
    }

    const existingQuote = await prisma.quotation.findFirst({
      where: { requisitionId, vendorId }
    });
    if (existingQuote) {
        return NextResponse.json({ error: 'You have already submitted a quote for this requisition.' }, { status: 409 });
    }

    let totalPrice = 0;
    let maxLeadTime = 0;

    items.forEach((item: any) => {
        totalPrice += (item.unitPrice || 0) * (item.quantity || 0);
        if (item.leadTimeDays > maxLeadTime) {
            maxLeadTime = item.leadTimeDays;
        }
    });

    const newQuotation = await prisma.quotation.create({
        data: {
            transactionId: requisition.transactionId,
            requisition: { connect: { id: requisitionId } },
            vendor: { connect: { id: vendorId } },
            vendorName: vendor.name,
            totalPrice,
            deliveryDate: addDays(new Date(), maxLeadTime),
            status: 'Submitted',
            notes,
            cpoDocumentUrl,
            experienceDocumentUrl,
            items: {
                create: items.map((item: any) => ({
                    requisitionItemId: item.requisitionItemId,
                    name: item.name,
                    quantity: item.quantity,
                    unitPrice: Number(item.unitPrice),
                    leadTimeDays: Number(item.leadTimeDays),
                    brandDetails: item.brandDetails,
                    imageUrl: item.imageUrl,
                }))
            },
            answers: {
                create: answers?.map((ans: any) => ({
                    questionId: ans.questionId,
                    answer: ans.answer,
                }))
            }
        }
    });


    if (vendor.user) {
        await prisma.auditLog.create({
            data: {
                transactionId: requisition.transactionId,
                timestamp: new Date(),
                user: { connect: { id: vendor.user.id } },
                action: 'SUBMIT_QUOTATION',
                entity: 'Quotation',
                entityId: newQuotation.id,
                details: `Submitted quotation from ${vendor.name} for requisition ${requisitionId}.`,
            }
        });
    }

    return NextResponse.json(newQuotation, { status: 201 });
  } catch (error) {
    console.error('Failed to create quotation:', error);
    if (error instanceof Error && (error as any).code === 'P2003') {
       return NextResponse.json({ error: 'Foreign key constraint failed. One of the item IDs does not exist.' }, { status: 400 });
    }
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process quotation', details: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
