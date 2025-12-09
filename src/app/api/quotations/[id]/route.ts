

'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { addDays } from 'date-fns';
import { getActorFromToken } from '@/lib/auth';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const requisition = await prisma.purchaseRequisition.findUnique({
      where: { id },
      include: {
        items: true,
        customQuestions: true,
        evaluationCriteria: {
          include: {
            financialCriteria: true,
            technicalCriteria: true,
          }
        },
        financialCommitteeMembers: { select: { id: true, name: true, email: true } },
        technicalCommitteeMembers: { select: { id: true, name: true, email: true } },
        requester: true,
      }
    });

    if (!requisition) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
    }
    
    // Formatting data to match client-side expectations
    const formatted = {
        ...requisition,
        requesterName: requisition.requester.name || 'Unknown',
        financialCommitteeMemberIds: requisition.financialCommitteeMembers.map(m => m.id),
        technicalCommitteeMemberIds: requisition.technicalCommitteeMembers.map(m => m.id),
    };

    return NextResponse.json(formatted);
  } catch (error) {
     console.error('Failed to fetch requisition:', error);
     if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}


export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
    const quoteId = params.id;
    try {
        const actor = await getActorFromToken(request);
        if (!actor) {
            return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
        }

        const body = await request.json();
        const { items, notes, answers, cpoDocumentUrl, summaryDocumentUrl } = body;
        
        const quote = await prisma.quotation.findUnique({
             where: { id: quoteId },
             include: { requisition: true }
        });

        if (!quote) {
            return NextResponse.json({ error: 'Quotation not found' }, { status: 404 });
        }

        if (quote.vendorId !== actor.vendorId) {
            return NextResponse.json({ error: 'You are not authorized to edit this quotation.' }, { status: 403 });
        }
        
        const isAwardProcessStarted = await prisma.quotation.count({
            where: {
                requisitionId: quote.requisitionId,
                status: { in: ['Awarded', 'Standby', 'Accepted', 'Declined', 'Failed'] }
            }
        }) > 0;

        if (isAwardProcessStarted) {
            return NextResponse.json({ error: 'Cannot edit quote after award process has started.' }, { status: 403 });
        }
        
        let totalPrice = 0;
        let maxLeadTime = 0;
        items.forEach((item: any) => {
            totalPrice += (item.unitPrice || 0) * (item.quantity || 0);
            if (item.leadTimeDays > maxLeadTime) {
                maxLeadTime = item.leadTimeDays;
            }
        });

        // Delete old items and answers, then create new ones
        await prisma.quoteItem.deleteMany({ where: { quotationId: quoteId } });
        await prisma.quoteAnswer.deleteMany({ where: { quotationId: quoteId } });

        const updatedQuote = await prisma.quotation.update({
            where: { id: quoteId },
            data: {
                totalPrice,
                deliveryDate: addDays(new Date(), maxLeadTime),
                notes,
                cpoDocumentUrl,
                summaryDocumentUrl,
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

        await prisma.auditLog.create({
            data: {
                timestamp: new Date(),
                user: { connect: { id: actor.id } },
                action: 'UPDATE_QUOTATION',
                entity: 'Quotation',
                entityId: quoteId,
                details: `Updated quote for requisition ${quote.requisitionId}.`,
            }
        });

        return NextResponse.json(updatedQuote, { status: 200 });

    } catch (error) {
        console.error('Failed to update quote:', error);
        if (error instanceof Error) {
            return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 400 });
        }
        return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
    }
}
