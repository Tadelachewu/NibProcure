
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PurchaseOrderStatus } from '@/lib/types';
import { getActorFromToken } from '@/lib/auth';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const actor = await getActorFromToken(request);
    if (!actor || !(actor.roles as string[]).includes('Procurement_Officer')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const poId = params.id;
    const body = await request.json();
    const { status } = body;

    const validStatuses: PurchaseOrderStatus[] = ['On_Hold', 'Cancelled'];
    if (!validStatuses.includes(status.replace(/ /g, '_'))) {
      return NextResponse.json({ error: 'Invalid or unsupported status for manual update.' }, { status: 400 });
    }
    
    const poToUpdate = await prisma.purchaseOrder.findUnique({ where: { id: poId }});
    if (!poToUpdate) {
        return NextResponse.json({ error: 'Purchase Order not found' }, { status: 404 });
    }

    const oldStatus = poToUpdate.status;
    const updatedPO = await prisma.purchaseOrder.update({
        where: { id: poId },
        data: { status: status.replace(/ /g, '_') as any }
    });
    
    await prisma.auditLog.create({
        data: {
            user: { connect: { id: actor.id } },
            timestamp: new Date(),
            action: 'UPDATE_PO_STATUS',
            entity: 'PurchaseOrder',
            entityId: poId,
            details: `Updated PO status from "${oldStatus}" to "${status}".`,
        }
    });

    return NextResponse.json(updatedPO);
  } catch (error) {
    console.error('Failed to update PO status:', error instanceof Error ? error.message : 'An unknown error occurred');
    return NextResponse.json({ error: 'An internal server error occurred' }, { status: 500 });
  }
}
