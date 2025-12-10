
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';


export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  console.log(`POST /api/requisitions/${params.id}/reset-award`);
  try {
    const actor = await getActorFromToken(request);
    if (!actor || !(actor.roles as string[]).some(r => ['Admin', 'Procurement_Officer'].includes(r))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const requisitionId = params.id;
    
    const requisition = await prisma.purchaseRequisition.findUnique({ where: { id: requisitionId } });
    if (!requisition) {
      console.error('Requisition not found for ID:', requisitionId);
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
    }
    console.log('Found requisition to reset:', requisition);

    await prisma.$transaction(async (tx) => {
        await tx.quotation.updateMany({
            where: { requisitionId: requisitionId },
            data: { status: 'Submitted', rank: null }
        });

        await tx.purchaseRequisition.update({
            where: { id: requisitionId },
            data: { status: 'Approved' }
        });

        await tx.auditLog.create({
            data: {
                user: { connect: { id: actor.id } },
                timestamp: new Date(),
                action: 'RESET_AWARD',
                entity: 'Requisition',
                entityId: requisitionId,
                details: 'Award decision has been reset, returning all quotes to Submitted status.',
                transactionId: requisitionId
            }
        });
    });

    console.log(`Reset award for requisition ${requisitionId}`);
    return NextResponse.json({ message: 'Award reset successfully' });
    
  } catch (error) {
    console.error('Failed to reset award:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
