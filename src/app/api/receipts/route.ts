
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';
import { POItem } from '@prisma/client';
import { handleAwardRejection } from '@/services/award-service';

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
              vendor: { include: { user: true } },
              invoices: true,
            }
        });

        if (!po || !po.requisition || !po.vendor) {
          throw new Error('Purchase Order, associated requisition, or vendor not found');
        }

        const defectiveItems = receivedItems.filter((item: any) => item.condition === 'Damaged' || item.condition === 'Incorrect');
        const hasDefectiveItems = defectiveItems.length > 0;
        
        // Always create the GRN to log what was physically received
        const newReceipt = await tx.goodsReceiptNote.create({
          data: {
              transactionId: po.transactionId,
              purchaseOrder: { connect: { id: purchaseOrderId } },
              receivedBy: { connect: { id: actor.id } },
              status: hasDefectiveItems ? 'Disputed' : 'Processed', // Set status based on item conditions
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
                details: `Created Goods Receipt Note ${newReceipt.id}. GRN Status: ${newReceipt.status}. PO status: ${newPOStatus.replace(/_/g, ' ')}.`,
            }
        });
        
        // If there are defective items, find the invoice and dispute it.
        if (hasDefectiveItems) {
            const firstReason = defectiveItems[0].notes || 'Goods received were damaged or incorrect.';
            
            // Find the most recent, non-paid invoice for this PO
            const invoiceToDispute = po.invoices.find(inv => inv.status !== 'Paid');

            if (invoiceToDispute) {
                await tx.invoice.update({
                    where: { id: invoiceToDispute.id },
                    data: {
                        status: 'Disputed',
                        disputeReason: firstReason,
                    }
                });

                await tx.auditLog.create({
                    data: {
                        transactionId: po.transactionId,
                        user: { connect: { id: actor.id } },
                        timestamp: new Date(),
                        action: 'AUTO_DISPUTE_INVOICE',
                        entity: 'Invoice',
                        entityId: invoiceToDispute.id,
                        details: `Invoice automatically disputed due to defective items recorded in GRN ${newReceipt.id}. Reason: ${firstReason}`,
                    }
                });
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
