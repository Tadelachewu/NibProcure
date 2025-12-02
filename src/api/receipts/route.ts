
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const actor = await getActorFromToken(request);
    if (!actor || !(actor.roles as string[]).includes('Receiving')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { purchaseOrderId, items } = body;

    const txResult = await prisma.$transaction(async (tx) => {
        const po = await tx.purchaseOrder.findUnique({ 
            where: { id: purchaseOrderId },
            include: { items: true }
        });

        if (!po) {
          throw new Error('Purchase Order not found');
        }

        const newReceipt = await tx.goodsReceiptNote.create({
          data: {
              transactionId: po.transactionId,
              purchaseOrder: { connect: { id: purchaseOrderId } },
              receivedBy: { connect: { id: actor.id } },
              items: {
                  create: items.map((item: any) => ({
                      poItemId: item.poItemId,
                      quantityReceived: item.quantityReceived,
                      condition: item.condition.replace(/ /g, '_'),
                      notes: item.notes,
                  }))
              }
          }
        });

        let allItemsDelivered = true;
        for (const poItem of po.items) {
            const receivedItem = items.find((i: { poItemId: string; }) => i.poItemId === poItem.id);
            let newReceivedQuantity = poItem.receivedQuantity;
            if (receivedItem) {
                newReceivedQuantity += receivedItem.quantityReceived;
            }

            await tx.pOItem.update({
                where: { id: poItem.id },
                data: { receivedQuantity: newReceivedQuantity }
            });

            if (newReceivedQuantity < poItem.quantity) {
                allItemsDelivered = false;
            }
        }

        const newPOStatus = allItemsDelivered ? 'Delivered' : 'Partially_Delivered';
        await tx.purchaseOrder.update({
            where: { id: purchaseOrderId },
            data: { status: newPOStatus }
        });
        
        if (newPOStatus === 'Delivered') {
            await tx.quotation.updateMany({
                where: {
                    requisitionId: po.requisitionId,
                    status: 'Standby'
                },
                data: { status: 'Rejected' }
            });
        }

        await prisma.auditLog.create({
            data: {
                transactionId: po.transactionId,
                user: { connect: { id: actor.id } },
                timestamp: new Date(),
                action: 'RECEIVE_GOODS',
                entity: 'PurchaseOrder',
                entityId: po.id,
                details: `Created Goods Receipt Note ${newReceipt.id}. PO status: ${newPOStatus.replace(/_/g, ' ')}.`,
            }
        });

        return newReceipt;
    });

    return NextResponse.json(txResult, { status: 201 });
  } catch (error) {
    console.error('[RECEIVE-GOODS] Failed to create goods receipt:', error);
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
