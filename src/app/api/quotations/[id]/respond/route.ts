
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { User } from '@/lib/types';


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
            include: { items: true, requisition: { include: { quotations: { include: { items: true } } } } }
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
            
            // Logic to handle both full and partial awards when creating a PO
            const awardedQuoteItems = quote.items.filter(item => 
                requisition.awardedQuoteItemIds.includes(item.id)
            );

            const thisVendorAwardedItems = awardedQuoteItems.length > 0 ? awardedQuoteItems : quote.items;

            const totalPriceForThisPO = thisVendorAwardedItems.reduce((acc, item) => acc + (item.unitPrice * item.quantity), 0);

            const newPO = await tx.purchaseOrder.create({
                data: {
                    transactionId: requisition.transactionId,
                    requisition: { connect: { id: requisition.id } },
                    requisitionTitle: requisition.title,
                    vendor: { connect: { id: quote.vendorId } },
                    items: {
                        create: thisVendorAwardedItems.map(item => ({
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

            // Check if all awards are accepted to update the main requisition status
            const allAwardedQuotes = await tx.quotation.findMany({
                where: {
                    requisitionId: requisition.id,
                    status: { in: ['Awarded', 'Partially_Awarded'] }
                }
            });
            
            if (allAwardedQuotes.length === 0) {
                 await tx.purchaseRequisition.update({
                    where: { id: requisition.id },
                    data: {
                        status: 'PO_Created',
                    }
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
                }
            });
            
            return { message: 'Award accepted. PO has been generated.' };

        } else if (action === 'reject') {
            await tx.quotation.update({ where: { id: quoteId }, data: { status: 'Declined' }});

            await tx.auditLog.create({
                data: {
                    timestamp: new Date(),
                    user: { connect: { id: user.id } },
                    action: 'REJECT_AWARD',
                    entity: 'Quotation',
                    entityId: quoteId,
                    details: `Vendor declined award.`,
                }
            });

            const nextRank = (quote.rank || 0) + 1;
            const nextQuote = await tx.quotation.findFirst({
                where: { requisitionId: quote.requisitionId, rank: nextRank }
            });

            if (nextQuote) {
                await tx.quotation.update({ where: { id: nextQuote.id }, data: { status: 'Awarded' } });
                
                await tx.auditLog.create({
                    data: {
                        timestamp: new Date(),
                        action: 'PROMOTE_STANDBY',
                        entity: 'Quotation',
                        entityId: nextQuote.id,
                        details: `Promoted standby vendor ${nextQuote.vendorName} to Awarded.`,
                    }
                });
                return { message: `Award declined. Next vendor (${nextQuote.vendorName}) has been notified.` };
            } else {
                 await tx.purchaseRequisition.update({
                    where: { id: requisition.id },
                    data: { status: 'Approved', deadline: null }
                });
                 await tx.quotation.updateMany({
                    where: { requisitionId: requisition.id },
                    data: { status: 'Submitted', rank: null }
                });
                 await tx.auditLog.create({
                    data: {
                        timestamp: new Date(),
                        action: 'RESTART_RFQ',
                        entity: 'Requisition',
                        entityId: requisition.id,
                        details: `All vendors declined award. RFQ process has been reset.`,
                    }
                });
                return { message: 'Award declined. No more standby vendors. Requisition has been reset for new RFQ process.' };
            }
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
