

'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { User, Quotation, PurchaseRequisition } from '@/lib/types';
import { handleAwardRejection } from '@/services/award-service';

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
              requisition: { include: { items: true, quotations: true } } 
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
        
        if (quote.status !== 'Awarded' && quote.status !== 'Partially_Awarded') {
            throw new Error('This quote is not currently in an awarded state.');
        }

        if (action === 'accept') {
            await tx.quotation.update({
                where: { id: quoteId },
                data: { status: 'Accepted' }
            });

            // In a per-item scenario, items are already marked.
            // In a single-vendor scenario, all items in the quote are effectively awarded.
            await tx.quoteItem.updateMany({
                where: { quotationId: quoteId, status: 'Pending_Award' },
                data: { status: 'Accepted' }
            });

            const acceptedItems = await tx.quoteItem.findMany({
                where: { quotationId: quoteId, status: 'Accepted' }
            });

            const totalPriceForThisPO = acceptedItems.reduce((acc, item) => acc + (item.unitPrice * item.quantity), 0);

            const newPO = await tx.purchaseOrder.create({
                data: {
                    transactionId: requisition.transactionId,
                    requisition: { connect: { id: requisition.id } },
                    requisitionTitle: requisition.title,
                    vendor: { connect: { id: quote.vendorId } },
                    items: {
                        create: acceptedItems.map((item) => ({
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
            
            // Check if all items in the requisition are now covered by an accepted quote
            const allReqItems = await tx.requisitionItem.findMany({ where: { requisitionId: requisition.id }});
            const acceptedReqItemIds = new Set(
                (await tx.quoteItem.findMany({
                    where: {
                        requisition: { id: requisition.id },
                        status: 'Accepted'
                    },
                    select: { requisitionItemId: true }
                })).map(i => i.requisitionItemId)
            );

            const allItemsAccountedFor = allReqItems.every(item => acceptedReqItemIds.has(item.id));

            if (allItemsAccountedFor) {
                await tx.purchaseRequisition.update({
                    where: {id: requisition.id},
                    data: {status: 'PO_Created'}
                });
            } else {
                 await tx.purchaseRequisition.update({
                    where: {id: requisition.id},
                    data: {status: 'Partially_Awarded'}
                });
            }

            
            await tx.auditLog.create({
                data: {
                    timestamp: new Date(),
                    user: { connect: { id: user.id } },
                    action: 'ACCEPT_AWARD',
                    entity: 'Quotation',
                    entityId: quoteId,
                    details: `Vendor accepted award. PO ${newPO.id} auto-generated.`,
                    transactionId: requisition.transactionId,
                }
            });
            
            return { message: 'Award accepted. PO has been generated.' };

        } else if (action === 'reject') {
             // Handle the rejection using the centralized service
            return await handleAwardRejection(tx, quote, requisition, actor);
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
      return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
