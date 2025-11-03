
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { User, Quotation } from '@/lib/types';
import { getNextApprovalStep } from '@/services/award-service';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const requisitionId = params.id;
  try {
    const body = await request.json();
    const { userId } = body;

    const user: User | null = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || (user.role !== 'Procurement_Officer' && user.role !== 'Admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const result = await prisma.$transaction(async (tx) => {
        const requisition = await tx.purchaseRequisition.findUnique({
            where: { id: requisitionId },
            include: { quotations: { include: { items: true } } }
        });

        if (!requisition || (requisition.status !== 'Award_Declined' && requisition.status !== 'Partially_Award_Declined')) {
            throw new Error("This requisition is not in a state where a standby vendor can be promoted.");
        }

        const standbyQuote = await tx.quotation.findFirst({
            where: { requisitionId: requisitionId, status: 'Standby' },
            orderBy: { rank: 'asc' },
            include: { items: true }
        });

        if (!standbyQuote) {
            throw new Error("No standby vendor found to promote.");
        }
        
        await tx.quotation.update({ where: { id: standbyQuote.id }, data: { status: 'Pending_Award', rank: 1 }});

        const newTotalPrice = standbyQuote.totalPrice;
        const newAwardedItemIds = standbyQuote.items.map((i: any) => i.id);

        const { nextStatus, nextApproverId, auditDetails } = await getNextApprovalStep(tx, newTotalPrice);
        
        const updatedRequisition = await tx.purchaseRequisition.update({
            where: { id: requisition.id },
            data: { 
                status: nextStatus as any,
                totalPrice: newTotalPrice,
                awardedQuoteItemIds: newAwardedItemIds,
                currentApproverId: nextApproverId
            }
        });

        await tx.auditLog.create({
            data: {
                timestamp: new Date(),
                user: { connect: { id: userId } },
                action: 'PROMOTE_STANDBY',
                entity: 'Requisition',
                entityId: requisition.id,
                details: `Manually promoted standby vendor ${standbyQuote.vendorName}. ${auditDetails}`,
                transactionId: requisition.transactionId,
            }
        });
        
        return updatedRequisition;
    });

    return NextResponse.json({ message: "Standby vendor promoted successfully.", requisition: result });

  } catch (error) {
    console.error(`Failed to promote standby for requisition ${requisitionId}:`, error);
    if (error instanceof Error) {
      return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
