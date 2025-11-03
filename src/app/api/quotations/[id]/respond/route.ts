
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { User } from '@/lib/types';
import { handleItemAwardRejection } from '@/services/award-service';


export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const quoteId = params.id;
  try {
    const body = await request.json();
    const { userId, action, declinedItemIds } = body as { userId: string; action: 'accept' | 'reject', declinedItemIds?: string[] };

    const user: User | null = await prisma.user.findUnique({where: {id: userId}});
    if (!user || user.role !== 'Vendor') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    const transactionResult = await prisma.$transaction(async (tx) => {
        const quote = await tx.quotation.findUnique({ 
            where: { id: quoteId },
            include: { 
              items: true, 
              requisition: { include: { items: true } } 
            }
        });

        if (!quote || quote.vendorId !== user.vendorId) {
          throw new Error('Quotation not found or not owned by this vendor');
        }
        
        const requisition = quote.requisition;
        if (!requisition) {
           throw new Error('Associated requisition not found');
        }

        if (requisition.status === 'Closed' || requisition.status === 'Fulfilled') {
            throw new Error(`Cannot accept award because the parent requisition '${requisition.id}' is already closed.`);
        }

        if (action === 'accept') {
            const itemsToAccept = await tx.quoteItem.findMany({
                where: { quotationId: quote.id, status: 'Pending_Award' }
            });
            
            if (itemsToAccept.length === 0) {
                throw new Error("No items are currently pending award for this quote.");
            }

            await tx.quoteItem.updateMany({
                where: { id: { in: itemsToAccept.map(i => i.id) } },
                data: { status: 'Accepted' }
            });
            
            await tx.requisitionItem.updateMany({
                where: { id: { in: itemsToAccept.map(i => i.requisitionItemId) } },
                data: { status: 'Awarded' }
            });

            const totalPriceForThisPO = itemsToAccept.reduce((acc, item) => acc + (item.unitPrice * item.quantity), 0);

            const newPO = await tx.purchaseOrder.create({
                data: {
                    transactionId: requisition.transactionId,
                    requisition: { connect: { id: requisition.id } },
                    requisitionTitle: requisition.title,
                    vendor: { connect: { id: quote.vendorId } },
                    items: {
                        create: itemsToAccept.map((item) => ({
                            requisitionItemId: item.requisitionItemId,
                            name: item.name,
                            quantity: item.quantity,
                            unitPrice: item.unitPrice,
                            totalPrice: item.quantity * item.unitPrice,
                            receivedQuantity: 0,
                        }))
                    },
                    totalAmount: totalPriceForThisPO,
                    status: 'Issued',
                }
            });

            await tx.purchaseRequisition.update({
                where: {id: requisition.id},
                data: {status: 'Partially_PO_Created'}
            });
            
            await tx.auditLog.create({
                data: {
                    timestamp: new Date(),
                    user: { connect: { id: user.id } },
                    action: 'ACCEPT_AWARD',
                    entity: 'Quotation',
                    entityId: quoteId,
                    details: `Vendor accepted award for ${itemsToAccept.length} item(s). PO ${newPO.id} auto-generated.`,
                    transactionId: requisition.transactionId,
                }
            });
            
            return { message: 'Award accepted. PO has been generated.' };

        } else if (action === 'reject') {
            if (!declinedItemIds || declinedItemIds.length === 0) {
                throw new Error("Specific item IDs must be provided for rejection.");
            }
            return await handleItemAwardRejection(tx, quote, requisition, user, declinedItemIds);
        }
        
        throw new Error('Invalid action.');
    }, {
      maxWait: 15000,
      timeout: 30000,
    });
    
    return NextResponse.json(transactionResult);

  } catch (error) {
    console.error('Failed to respond to award:', error);
    if (error instanceof Error) {
      if ((error as any).code === 'P2014') {
        return NextResponse.json({ error: 'Failed to process award acceptance due to a data conflict. The Purchase Order could not be linked to the Requisition.', details: (error as any).meta?.relation_name || 'Unknown relation' }, { status: 500 });
      }
      return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
