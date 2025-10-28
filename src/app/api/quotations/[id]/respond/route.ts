
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
            
            const awardedQuoteItems = quote.items.filter(item => 
                requisition.awardedQuoteItemIds.includes(item.id)
            );

            const thisVendorAwardedItems = awardedQuoteItems.length > 0 ? awardedQuoteItems : quote.items;

            const totalPriceForThisPO = thisVendorAwardedItems.reduce((acc: any, item: any) => acc + (item.unitPrice * item.quantity), 0);

            const newPO = await tx.purchaseOrder.create({
                data: {
                    transactionId: requisition.transactionId,
                    requisition: { connect: { id: requisition.id } },
                    requisitionTitle: requisition.title,
                    vendor: { connect: { id: quote.vendorId } },
                    items: {
                        create: thisVendorAwardedItems.map((item: any) => ({
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

            // Set other awarded/partially awarded quotes for this req to "Failed" since this one was accepted.
            await tx.quotation.updateMany({
                where: {
                    requisitionId: requisition.id,
                    id: { not: quote.id },
                    status: { in: ['Awarded', 'Partially_Awarded'] }
                },
                data: {
                    status: 'Failed'
                }
            })

            // Finalize the requisition status
            await tx.purchaseRequisition.update({
                where: { id: requisition.id },
                data: { status: 'PO_Created' }
            });
            
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
            // Complex rejection logic is now handled in the award service
            return await handleAwardRejection(tx, quote, requisition, user);
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
