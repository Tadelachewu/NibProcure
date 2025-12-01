
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PerItemAwardDetail, User, UserRole } from '@/lib/types';
import { handleAwardRejection } from '@/services/award-service';
import { getActorFromToken } from '@/lib/auth';


export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const quoteId = params.id;
  try {
    const actor = await getActorFromToken(request);
    if (!actor) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, quoteItemId } = body as { action: 'accept' | 'reject'; quoteItemId?: string };

    if (!actor.roles.includes('Vendor')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    const transactionResult = await prisma.$transaction(async (tx) => {
        const quote = await tx.quotation.findUnique({ 
            where: { id: quoteId },
            include: { items: true, requisition: { include: { items: true } } }
        });

        if (!quote || quote.vendorId !== actor.vendorId) {
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
                const awardedItemDetails = requisition.items.flatMap(i => (i.perItemAwardDetails as PerItemAwardDetail[] || []).filter(d => d.vendorId === actor.vendorId && d.status === 'Awarded'));
                
                let itemsToAccept = awardedItemDetails;
                if (quoteItemId) {
                    itemsToAccept = awardedItemDetails.filter(d => d.quoteItemId === quoteItemId);
                }

                if (itemsToAccept.length === 0) {
                    throw new Error("No items in 'Awarded' status found for you to accept.");
                }
                
                const awardedQuoteItemIds = new Set(itemsToAccept.map(d => d.quoteItemId));
                awardedQuoteItems = quote.items.filter(item => awardedQuoteItemIds.has(item.id));
                
                for (const item of requisition.items) {
                    const originalDetails = item.perItemAwardDetails as PerItemAwardDetail[] | null;
                    if (originalDetails) {
                        const newDetails = originalDetails.map(d => 
                            awardedQuoteItemIds.has(d.quoteItemId) ? { ...d, status: 'Accepted' as const } : d
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
                
                const awardedIds = new Set(requisition.awardedQuoteItemIds || []);
                if (awardedIds.size > 0) {
                  awardedQuoteItems = quote.items.filter(item => awardedIds.has(item.id));
                } else {
                  awardedQuoteItems = quote.items;
                }
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

            let allAwardsActioned = false;
            const updatedRequisitionAfterPO = await tx.purchaseRequisition.findUnique({
                where: { id: requisition.id },
                include: { items: true, quotations: true }
            });
            if (!updatedRequisitionAfterPO) throw new Error("Could not refetch requisition to check completion status.");


            if (isPerItemAward) {
                 allAwardsActioned = !updatedRequisitionAfterPO.items.some(item =>
                    (item.perItemAwardDetails as PerItemAwardDetail[] | undefined)?.some(d => d.status === 'Awarded' || d.status === 'Standby')
                );
            } else {
                 allAwardsActioned = !updatedRequisitionAfterPO.quotations.some(q => q.status === 'Awarded' || q.status === 'Standby');
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
                    user: { connect: { id: actor.id } },
                    action: 'ACCEPT_AWARD',
                    entity: 'Quotation',
                    entityId: quoteId,
                    details: `Vendor accepted award. PO ${newPO.id} auto-generated for ${awardedQuoteItems.length} item(s).`,
                    transactionId: requisition.transactionId,
                }
            });
            
            return { message: 'Award accepted. PO has been generated.' };

        } else if (action === 'reject') {
            const declinedItemIds = quoteItemId
                ? [quote.items.find(i => i.id === quoteItemId)?.requisitionItemId].filter(Boolean) as string[]
                : requisition.items
                    .filter(item => (item.perItemAwardDetails as PerItemAwardDetail[] | undefined)?.some(d => d.vendorId === actor.vendorId && d.status === 'Awarded'))
                    .map(item => item.id);
            
            return await handleAwardRejection(tx, quote, requisition, actor, declinedItemIds, quoteItemId);
        }
        
        throw new Error('Invalid action.');
    }, {
      maxWait: 15000,
      timeout: 30000,
    });
    
    return NextResponse.json(transactionResult);

  } catch (error) {
    console.error('Failed to respond to award:');
    if (error instanceof Error) {
      if ((error as any).code === 'P2014') {
        return NextResponse.json({ error: 'Failed to process award acceptance due to a data conflict. The Purchase Order could not be linked to the Requisition.', details: (error as any).meta?.relation_name || 'Unknown relation' }, { status: 500 });
      }
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
