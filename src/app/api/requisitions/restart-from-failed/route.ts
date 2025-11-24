'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { User, UserRole } from '@/lib/types';
import { sendEmail } from '@/services/email-service';
import { format } from 'date-fns';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { originalRequisitionId, itemIds, userId } = body;

    const actor = await prisma.user.findUnique({ where: { id: userId }, include: { roles: true } });
    if (!actor || !actor.roles.some(r => r.name === 'Procurement_Officer' || r.name === 'Admin')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    if (!originalRequisitionId || !itemIds || itemIds.length === 0) {
      return NextResponse.json({ error: 'Original requisition ID and item IDs are required.' }, { status: 400 });
    }

    const originalRequisition = await prisma.purchaseRequisition.findUnique({
      where: { id: originalRequisitionId },
      include: { 
        items: { where: { id: { in: itemIds } } },
        evaluationCriteria: { include: { financialCriteria: true, technicalCriteria: true } }
      },
    });

    if (!originalRequisition) {
      return NextResponse.json({ error: 'Original requisition not found.' }, { status: 404 });
    }

    const itemsToReTender = originalRequisition.items;
    if (itemsToReTender.length === 0) {
        return NextResponse.json({ error: 'None of the specified items were found on the original requisition.' }, { status: 400 });
    }
    
    const totalPrice = itemsToReTender.reduce((acc, item) => acc + (item.unitPrice || 0) * item.quantity, 0);

    const newRequisition = await prisma.$transaction(async (tx) => {
        const createdReq = await tx.purchaseRequisition.create({
            data: {
                originalRequisitionId: originalRequisition.id,
                requester: { connect: { id: originalRequisition.requesterId } },
                department: { connect: { id: originalRequisition.departmentId } },
                title: `RE-TENDER: ${originalRequisition.title} (Failed Items)`,
                urgency: originalRequisition.urgency,
                justification: `This is a re-tender for failed items from original requisition ${originalRequisition.id}. Original justification: ${originalRequisition.justification}`,
                status: 'PreApproved',
                totalPrice,
                items: {
                    create: itemsToReTender.map(item => ({
                        name: item.name,
                        quantity: Number(item.quantity) || 0,
                        unitPrice: Number(item.unitPrice) || 0,
                        description: item.description || ''
                    }))
                },
                 evaluationCriteria: originalRequisition.evaluationCriteria ? {
                    create: {
                        financialWeight: originalRequisition.evaluationCriteria.financialWeight,
                        technicalWeight: originalRequisition.evaluationCriteria.technicalWeight,
                        financialCriteria: {
                            create: originalRequisition.evaluationCriteria.financialCriteria.map((c:any) => ({ name: c.name, weight: Number(c.weight) }))
                        },
                        technicalCriteria: {
                            create: originalRequisition.evaluationCriteria.technicalCriteria.map((c:any) => ({ name: c.name, weight: Number(c.weight) }))
                        }
                    }
                } : undefined,
            },
            include: { items: true, customQuestions: true, evaluationCriteria: true }
        });
        
        const finalReq = await tx.purchaseRequisition.update({
            where: { id: createdReq.id },
            data: { transactionId: createdReq.id }
        });

        await tx.auditLog.create({
            data: {
                transactionId: finalReq.id,
                user: { connect: { id: actor.id } },
                timestamp: new Date(),
                action: 'RESTART_RFQ_NEW_REQ',
                entity: 'Requisition',
                entityId: finalReq.id,
                details: `Created new requisition for failed items from original requisition ${originalRequisition.id}.`,
            }
        });

        await tx.auditLog.create({
            data: {
                transactionId: originalRequisition.id,
                user: { connect: { id: actor.id } },
                timestamp: new Date(),
                action: 'RESTART_RFQ_NEW_REQ',
                entity: 'Requisition',
                entityId: originalRequisition.id,
                details: `Failed items were moved to a new requisition for re-tendering: ${finalReq.id}.`,
            }
        });

        // Mark the old items as handled by setting a special status or clearing award details
        await tx.requisitionItem.updateMany({
            where: { id: { in: itemIds } },
            data: {
                perItemAwardDetails: Prisma.JsonNull,
            }
        });
        
        return finalReq;
    });


    return NextResponse.json({ message: 'New requisition created for failed items.', requisition: newRequisition }, { status: 201 });

  } catch (error) {
    console.error('Failed to restart RFQ for failed items:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
