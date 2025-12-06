
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';
import { handleAwardRejection } from '@/services/award-service';
import { POItem } from '@prisma/client';

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
              requisition: { include: { items: true, quotations: true } },
              invoices: true
            }
        });

        if (!po || !po.requisition) {
          throw new Error('Purchase Order or associated requisition not found');
        }

        const defectiveItems = receivedItems.filter((item: any) => item.condition === 'Damaged' || item.condition === 'Incorrect');
        
        if (defectiveItems.length > 0) {
            // Find the most recent invoice to dispute
            const invoiceToDispute = po.invoices.sort((a,b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime())[0];
            
            if (invoiceToDispute) {
                await tx.invoice.update({
                    where: { id: invoiceToDispute.id },
                    data: {
                        status: 'Disputed',
                        disputeReason: `Goods received were marked as ${defectiveItems.map(i => i.condition.toLowerCase()).join(', ')}. GRN Notes: ${defectiveItems.map(i => i.notes).join('; ')}`,
                    }
                });
            }
        }
        
        // Always create the GRN to log what was physically received, even if defective
        const newReceipt = await tx.goodsReceiptNote.create({
          data: {
              transactionId: po.transactionId,
              purchaseOrder: { connect: { id: purchaseOrderId } },
              receivedBy: { connect: { id: actor.id } },
              items: {
                  create: receivedItems.map((item: any) => ({
                      poItemId: item.poItemId,
                      quantityReceived: item.quantityReceived,
                      condition: item.condition.replace(/ /g, '_'),
                      notes: item.notes,
                  }))
              },
              status: defectiveItems.length > 0 ? 'Disputed' : 'Received',
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
                details: `Created Goods Receipt Note ${newReceipt.id}. PO status: ${newPOStatus.replace(/_/g, ' ')}. ${defectiveItems.length > 0 ? `Flagged ${defectiveItems.length} defective item(s), automatically disputing related invoice.` : ''}`,
            }
        });

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
