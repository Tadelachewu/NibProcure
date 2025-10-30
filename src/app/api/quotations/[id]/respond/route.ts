
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { User } from '@/lib/types';
import { handleAwardRejection } from '@/services/award-service';
import { Prisma } from '@prisma/client';


export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const quoteId = params.id;
  try {
    const body = await request.json();
    const { userId, action } = body as { userId: string; action: 'accept' | 'reject' };

    const user: User | null = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== 'Vendor') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    if (action === 'accept') {
        let newPO;
        // Step 1: Atomic transaction for PO creation and Quote update
        try {
            newPO = await prisma.$transaction(async (tx) => {
                const quote = await tx.quotation.findUnique({ 
                    where: { id: quoteId },
                    include: { requisition: true, items: true }
                });

                if (!quote || quote.vendorId !== user.vendorId) throw new Error('Quotation not found or not owned by this vendor');
                if (!quote.requisition) throw new Error(`Associated requisition with ID ${quote.requisitionId} not found.`);
                if (quote.status !== 'Awarded' && quote.status !== 'Partially_Awarded' && quote.status !== 'Pending_Award') throw new Error('This quote is not currently in an awarded state.');
                
                const requisition = quote.requisition;

                await tx.quotation.update({ where: { id: quoteId }, data: { status: 'Accepted' } });

                const awardedItemsForThisVendor = quote.items.filter((item: any) => 
                    requisition.awardedQuoteItemIds.includes(item.id)
                );

                const itemsForPO = awardedItemsForThisVendor.length > 0 ? awardedItemsForThisVendor : quote.items;
                const totalPriceForThisPO = itemsForPO.reduce((acc: any, item: any) => acc + (item.unitPrice * item.quantity), 0);

                const createdPO = await tx.purchaseOrder.create({
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

                await tx.auditLog.create({
                    data: {
                        timestamp: new Date(),
                        user: { connect: { id: user.id } },
                        action: 'ACCEPT_AWARD',
                        entity: 'Quotation',
                        entityId: quoteId,
                        details: `Vendor accepted award. PO ${createdPO.id} auto-generated.`,
                        transactionId: requisition.transactionId,
                    }
                });
                return createdPO;
            });
        } catch (e) {
            // This will now catch the error inside the transaction and allow us to handle it
            // before re-throwing it to the main catch block.
            console.error("Error during award acceptance transaction:", e);
            throw e;
        }

        // Step 2: Post-transaction check to update the parent requisition status
        const quote = await prisma.quotation.findUnique({ where: { id: quoteId }, select: { requisitionId: true }});
        if (quote?.requisitionId) {
            const otherPendingAwards = await prisma.quotation.count({
                where: {
                    requisitionId: quote.requisitionId,
                    status: { in: ['Awarded', 'Partially_Awarded', 'Pending_Award'] }
                }
            });

            if (otherPendingAwards === 0) {
                 await prisma.purchaseRequisition.update({
                    where: { id: quote.requisitionId },
                    data: { status: 'PO_Created' }
                });
            }
        }
        
        return NextResponse.json({ message: 'Award accepted. PO has been generated.' });
        
    } else if (action === 'reject') {
        const transactionResult = await prisma.$transaction(async (tx) => {
             const quote = await tx.quotation.findUnique({ 
                where: { id: quoteId },
                include: { items: true, requisition: true }
            });
            if (!quote || quote.vendorId !== user.vendorId) throw new Error('Quotation not found or not owned by this vendor');
            if (quote.status !== 'Awarded' && quote.status !== 'Partially_Awarded' && quote.status !== 'Pending_Award') throw new Error('This quote is not currently in an awarded state.');
            const requisition = quote.requisition;
            if (!requisition) throw new Error('Associated requisition not found');

            const declinedItemIds = quote.items
                .filter((item: any) => requisition.awardedQuoteItemIds.includes(item.id))
                .map((item: any) => item.requisitionItemId);
                
            return await handleAwardRejection(tx, quote, requisition, user, declinedItemIds);
        }, {
          maxWait: 15000,
          timeout: 30000,
        });

        return NextResponse.json(transactionResult);
    } else {
        throw new Error('Invalid action.');
    }

  } catch (error) {
    console.error('Failed to respond to award:', error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2014') {
             return NextResponse.json({ error: 'Database relation conflict. The action could not be completed because it would break a required link between records. Please try again.', details: (error as any).meta?.relation_name || 'Unknown relation' }, { status: 500 });
        }
        if (error.code === 'P2003') {
             return NextResponse.json({ error: 'Foreign key constraint failed. A related record could not be found.', details: (error as any).meta?.field_name || 'Unknown field' }, { status: 404 });
        }
         if (error.code === 'P2025') {
             return NextResponse.json({ error: 'Record not found. The quotation or requisition you are trying to update does not exist.', details: (error as any).meta?.cause || 'No cause provided' }, { status: 404 });
        }
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
