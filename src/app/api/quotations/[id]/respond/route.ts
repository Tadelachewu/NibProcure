
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { User } from '@/lib/types';
import { handleAwardRejection } from '@/services/award-service';


export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const quoteId = params.id;
  try {
    const body = await request.json();
    const { userId, action } = body as { userId: string; action: 'accept' | 'reject' };

    const user: User | null = await prisma.user.findUnique({where: {id: userId}});
    if (!user || user.role !== 'Vendor') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    const transactionResult = await prisma.$transaction(async (tx) => {
        const quote = await tx.quotation.findUnique({ 
            where: { id: quoteId },
            include: { items: true, requisition: true }
        });

        if (!quote || quote.vendorId !== user.vendorId) {
          throw new Error('Quotation not found or not owned by this vendor');
        }
        
        if (quote.status !== 'Awarded' && quote.status !== 'Partially_Awarded' && quote.status !== 'Pending_Award') {
            throw new Error('This quote is not currently in an awarded state.');
        }
        
        const requisition = quote.requisition;
        if (!requisition) {
           throw new Error('Associated requisition not found');
        }

        if (action === 'accept') {
            await tx.quotation.update({
                where: { id: quoteId },
                data: { status: 'Accepted' }
            });
            
            // This logic correctly handles split awards by only including items that were actually awarded to this vendor.
            // The `awardedQuoteItemIds` on the requisition is the source of truth for what was awarded.
            const awardedItemsForThisVendor = quote.items.filter((item: any) => 
                requisition.awardedQuoteItemIds.includes(item.id)
            );

            // If the awardedQuoteItemIds is empty (which happens in a single-vendor award), fall back to all items in the quote.
            const itemsForPO = awardedItemsForThisVendor.length > 0 ? awardedItemsForThisVendor : quote.items;
            const totalPriceForThisPO = itemsForPO.reduce((acc: any, item: any) => acc + (item.unitPrice * item.quantity), 0);

            const newPO = await tx.purchaseOrder.create({
                data: {
                    transactionId: requisition.transactionId,
                    requisition: { connect: { id: requisition.id } },
                    requisitionTitle: requisition.title,
                    vendor: { connect: { id: quote.vendorId } },
                    items: {
                        create: itemsForPO.map((item: any) => ({
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

            // After accepting, check if any other awards are still pending for this requisition.
            const otherPendingAwards = await tx.quotation.count({
                where: {
                    requisitionId: requisition.id,
                    id: { not: quote.id },
                    status: { in: ['Awarded', 'Partially_Awarded', 'Pending_Award'] }
                }
            });

            // If there are no more pending awards, the entire requisition's PO process is complete.
            if (otherPendingAwards === 0) {
                 await tx.purchaseRequisition.update({
                    where: { id: requisition.id },
                    data: { status: 'PO_Created' }
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
            // Identify which specific items are being declined by this action.
            const declinedItemIds = quote.items
                .filter((item: any) => requisition.awardedQuoteItemIds.includes(item.id))
                .map((item: any) => item.requisitionItemId);
                
            return await handleAwardRejection(tx, quote, requisition, user, declinedItemIds);
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
        // More specific error for foreign key violation
        return NextResponse.json({ error: 'Failed to process award acceptance due to a data conflict. The Purchase Order could not be linked to the Requisition.', details: (error as any).meta?.relation_name || 'Unknown relation' }, { status: 500 });
      }
      return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
