
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
  console.log(`[RESPOND-AWARD] Received request for Quote ID: ${quoteId}`);
  try {
    const body = await request.json();
    const { userId, action, quoteItemId } = body as { userId: string; action: 'accept' | 'reject'; quoteItemId?: string };
    console.log(`[RESPOND-AWARD] Action: ${action} by User ID: ${userId}. Item-specific: ${!!quoteItemId}`);

    const user = await prisma.user.findUnique({
        where: {id: userId},
        include: { roles: true }
    });
    
    if (!user || !user.roles.some(r => r.name === 'Vendor')) {
      console.error(`[RESPOND-AWARD] Unauthorized attempt by User ID: ${userId}`);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    console.log(`[RESPOND-AWARD] Starting transaction for Quote ID: ${quoteId}`);
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
        console.log(`[RESPOND-AWARD] Found Requisition ID: ${requisition.id} with status ${requisition.status}`);

        // **SAFEGUARD START**
        // Prevent creating a PO for a requisition that is already closed.
        if (requisition.status === 'Closed' || requisition.status === 'Fulfilled') {
            console.error(`[RESPOND-AWARD] Aborting: Requisition ${requisition.id} is already in a final state (${requisition.status}).`);
            throw new Error(`Cannot accept award because the parent requisition '${requisition.id}' is already closed.`);
        }
        // **SAFEGUARD END**
        
        const isPerItemAward = (requisition.rfqSettings as any)?.awardStrategy === 'item';
        console.log(`[RESPOND-AWARD] Award strategy is: ${isPerItemAward ? 'Per-Item' : 'Single Vendor'}`);

        if (action === 'accept') {
            let awardedQuoteItems: any[] = [];
            
            if (isPerItemAward) {
                console.log('[RESPOND-AWARD] Handling per-item award acceptance.');
                const awardedItemDetails = requisition.items.flatMap(i => (i.perItemAwardDetails as PerItemAwardDetail[] || []).filter(d => d.vendorId === user.vendorId && d.status === 'Awarded'));
                
                let itemsToAccept = awardedItemDetails;
                if (quoteItemId) {
                    itemsToAccept = awardedItemDetails.filter(d => d.quoteItemId === quoteItemId);
                }

                if (itemsToAccept.length === 0) {
                    throw new Error("No items in 'Awarded' status found for you to accept.");
                }
                console.log(`[RESPOND-AWARD] Found ${itemsToAccept.length} item(s) to accept.`);
                
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
                console.log(`[RESPOND-AWARD] Updated perItemAwardDetails on requisition items.`);

            } else { // Single vendor award
                console.log('[RESPOND-AWARD] Handling single-vendor award acceptance.');
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
            console.log(`[RESPOND-AWARD] Total price for new PO: ${totalPriceForThisPO}`);

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
            console.log(`[RESPOND-AWARD] Created new Purchase Order: ${newPO.id}`);

            // **MODIFIED LOGIC**: Check if ALL possible awards for this requisition have been actioned (accepted or declined/failed).
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
                 console.log(`[RESPOND-AWARD] All awards for Req ${requisition.id} have been actioned. Updating status to PO_Created.`);
                 await tx.purchaseRequisition.update({
                    where: { id: requisition.id },
                    data: { status: 'PO_Created' }
                });
            } else {
                console.log(`[RESPOND-AWARD] Not all awards for Req ${requisition.id} have been actioned yet. Status remains active.`);
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
            const declinedItemIds = quoteItemId
                ? [quote.items.find((i: any) => i.id === quoteItemId)?.requisitionItemId].filter(Boolean) as string[]
                : requisition.items
                    .filter((item: any) => (item.perItemAwardDetails as PerItemAwardDetail[] | undefined)?.some(d => d.vendorId === user.vendorId && d.status === 'Awarded'))
                    .map((item: any) => item.id);
            
            console.log(`[RESPOND-AWARD] Handling award rejection. Declined item IDs: ${declinedItemIds.join(', ')}`);
            return await handleAwardRejection(tx, quote, requisition, user, declinedItemIds, quoteItemId);
        }
        
        throw new Error('Invalid action.');
    }, {
      maxWait: 15000,
      timeout: 30000,
    });
    
    console.log(`[RESPOND-AWARD] Transaction complete for Quote ID: ${quoteId}`);
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
