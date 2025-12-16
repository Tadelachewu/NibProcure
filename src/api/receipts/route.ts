
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';
import { POItem } from '@prisma/client';
import { handleAwardRejection } from '@/services/award-service';


export async function GET() {
    try {
        const receipts = await prisma.goodsReceiptNote.findMany({
            include: {
                receivedBy: true,
                items: true,
            },
            orderBy: {
                receivedDate: 'desc',
            }
        });
        return NextResponse.json(receipts);
    } catch(e) {
        console.error("Failed to fetch receipts:", e);
        return NextResponse.json({ error: "Failed to fetch receipts." }, { status: 500 });
    }
}


export async function POST(request: Request) {
  const actor = await getActorFromToken(request);
  if (!actor || !(actor.roles as string[]).includes('Receiving')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = await request.json();
  const { purchaseOrderId, items: receivedItems } = body;

  try {
    const txResult = await prisma.$transaction(async (tx) => {
        const po = await tx.purchaseOrder.findUnique({ 
            where: { id: purchaseOrderId },
            include: { 
              items: true,
              requisition: { include: { items: true, quotations: { include: { items: true } } } },
              vendor: { include: { user: true } }
            }
        });

        if (!po || !po.requisition || !po.vendor) {
          throw new Error('Purchase Order, associated requisition, or vendor not found');
        }

        const defectiveItems = receivedItems.filter((item: any) => item.condition === 'Damaged' || item.condition === 'Incorrect');
        const hasDefectiveItems = defectiveItems.length > 0;
        
        // This is the primary mechanism for handling receiving-end disputes.
        // The GRN status is 'Processed' by default unless disputed by Finance.
        const newReceipt = await tx.goodsReceiptNote.create({
          data: {
              transactionId: po.transactionId,
              purchaseOrder: { connect: { id: purchaseOrderId } },
              receivedBy: { connect: { id: actor.id } },
              status: 'Processed', 
              items: {
                  create: receivedItems.map((item: any) => ({
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
            const receivedItem = receivedItems.find((i: { poItemId: string; }) => i.poItemId === poItem.id);
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
        
        await tx.auditLog.create({
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
        
        // If there are defective items, call the award rejection service.
        if (hasDefectiveItems) {
            const quoteForVendor = po.requisition.quotations.find(q => q.vendorId === po.vendorId);
            if(quoteForVendor) {
                const declinedReqItemIds = defectiveItems.map((item: any) => {
                    const poItem = po.items.find(p => p.id === item.poItemId);
                    return poItem?.requisitionItemId;
                }).filter(Boolean);

                const firstReason = defectiveItems[0].notes || 'Goods received were damaged or incorrect.';

                await handleAwardRejection(tx, quoteForVendor, po.requisition, po.vendor.user!, declinedReqItemIds, 'Receiving', firstReason);
            }
        }

        return newReceipt;
    });

    return NextResponse.json(txResult, { status: 201 });
  } catch (error) {
    console.error('[RECEIVE-GOODS] Failed to create goods receipt:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
