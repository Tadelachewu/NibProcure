
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
        
        if (quote.status !== 'Awarded' && quote.status !== 'Partially_Awarded') {
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
            
            // This logic now correctly uses the awardedQuoteItemIds from the requisition
            // to ensure only the items that were actually awarded are included in the PO.
            const awardedQuoteItems = quote.items.filter(item => 
                requisition.awardedQuoteItemIds.includes(item.id)
            );

            // If awardedQuoteItemIds is empty (e.g., in a simple 'award all' scenario),
            // it defaults to using all items from the accepted quote.
            const itemsForPO = awardedQuoteItems.length > 0 ? awardedQuoteItems : quote.items;

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

            // Check if there are any other outstanding awards for this requisition.
            // If not, the main requisition status can be moved to PO_Created.
            const allAwardedQuotes = await tx.quotation.findMany({
                where: {
                    requisitionId: requisition.id,
                    status: { in: ['Awarded', 'Partially_Awarded'] }
                }
            });
            
            if (allAwardedQuotes.length === 0) {
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
            // The improved logic is now in the award service
            return await handleAwardRejection(tx, quote, requisition, user);
        }
        
        throw new Error('Invalid action.');
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
