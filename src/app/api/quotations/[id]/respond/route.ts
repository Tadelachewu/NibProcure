
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PerItemAwardDetail, User, UserRole } from '@/lib/types';
import { handleAwardRejection } from '@/services/award-service';


export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const quoteId = params.id;
  try {
    const body = await request.json();
    const { userId, action } = body as { userId: string; action: 'accept' | 'reject' };

    const user = await prisma.user.findUnique({
        where: {id: userId},
        include: { role: true }
    });
    
    if (!user || user.role.name !== 'Vendor') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    const transactionResult = await prisma.$transaction(async (tx) => {
        const quote = await tx.quotation.findUnique({ 
            where: { id: quoteId },
            include: { items: true, requisition: { include: { items: true } } }
        });

        if (!quote || quote.vendorId !== user.vendorId) {
          throw new Error('Quotation not found or not owned by this vendor');
        }
        
        const requisition = quote.requisition;
        if (!requisition) {
           throw new Error('Associated requisition not found');
        }

        // **SAFEGUARD START**
        // Prevent creating a PO for a requisition that is already closed.
        if (requisition.status === 'Closed' || requisition.status === 'Fulfilled') {
            throw new Error(`Cannot accept award because the parent requisition '${requisition.id}' is already closed.`);
        }
        // **SAFEGUARD END**
        
        const isPerItemAward = (requisition.rfqSettings as any)?.awardStrategy === 'item';

        if (action === 'accept') {
            let awardedQuoteItems: any[] = [];
            
            if (isPerItemAward) {
                const awardedItemDetails = requisition.items.flatMap(i => (i.perItemAwardDetails as PerItemAwardDetail[] || []).filter(d => d.vendorId === user.vendorId && d.status === 'Awarded'));
                
                const awardedQuoteItemIds = new Set(awardedItemDetails.map(d => d.quoteItemId));
                awardedQuoteItems = quote.items.filter(item => awardedQuoteItemIds.has(item.id));
                
                // Update the status in the JSONB field
                for (const item of requisition.items) {
                    const originalDetails = item.perItemAwardDetails as PerItemAwardDetail[] | null;
                    if (originalDetails) {
                        const newDetails = originalDetails.map(d => 
                            (d.vendorId === user.vendorId && d.status === 'Awarded') ? { ...d, status: 'Accepted' as const } : d
                        );
                        await tx.requisitionItem.update({
                            where: { id: item.id },
                            data: { perItemAwardDetails: newDetails }
                        });
                    }
                }
            } else { // Single vendor award
                 await tx.quotation.update({
                    where: { id: quoteId },
                    data: { status: 'Accepted' }
                });
                const allAwardedItems = quote.items.filter(item => 
                    requisition.awardedQuoteItemIds.includes(item.id)
                );
                awardedQuoteItems = allAwardedItems.length > 0 ? allAwardedItems : quote.items;
            }

            if (awardedQuoteItems.length === 0) {
              throw new Error("No awarded items found for this vendor to accept.");
            }

            const totalPriceForThisPO = awardedQuoteItems.reduce((acc: any, item: any) => acc + (item.unitPrice * item.quantity), 0);

            const newPO = await tx.purchaseOrder.create({
                data: {
                    transactionId: requisition.transactionId,
                    requisition: { connect: { id: requisition.id } },
                    requisitionTitle: requisition.title,
                    vendor: { connect: { id: quote.vendorId } },
                    items: {
                        create: awardedQuoteItems.map((item: any) => ({
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

            // Check if ALL possible awards for this requisition have been actioned (accepted or declined).
            let allAwardsActioned = false;
            if (isPerItemAward) {
                 const updatedRequisition = await tx.purchaseRequisition.findUnique({
                    where: { id: requisition.id },
                    include: { items: true }
                });
                 allAwardsActioned = !updatedRequisition?.items.some(item =>
                    (item.perItemAwardDetails as PerItemAwardDetail[] | undefined)?.some(d => d.status === 'Awarded')
                );
            } else {
                 const otherPendingAwards = await tx.quotation.count({
                    where: {
                        requisitionId: requisition.id,
                        status: 'Awarded'
                    }
                });
                allAwardsActioned = otherPendingAwards === 0;
            }

            if (allAwardsActioned) {
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
                    details: `Vendor accepted award. PO ${newPO.id} auto-generated for ${awardedQuoteItems.length} item(s).`,
                    transactionId: requisition.transactionId,
                }
            });
            
            return { message: 'Award accepted. PO has been generated.' };

        } else if (action === 'reject') {
            const declinedItemIds = isPerItemAward 
                ? requisition.items
                    .filter(item => (item.perItemAwardDetails as PerItemAwardDetail[] | undefined)?.some(d => d.vendorId === user.vendorId && d.status === 'Awarded'))
                    .map(item => item.id)
                : quote.items.map(item => item.requisitionItemId);
                
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
