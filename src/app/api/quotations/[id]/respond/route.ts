
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PerItemAwardDetail, User, UserRole, QuoteItem } from '@/lib/types';
import { handleAwardRejection } from '@/services/award-service';


export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const quoteId = params.id;
  console.log(`[RESPOND-AWARD] Received request for Quote ID: ${quoteId}`);
  try {
    const body = await request.json();
    const { userId, action, quoteItemId, rejectionReason } = body as { userId: string; action: 'accept' | 'reject'; quoteItemId?: string, rejectionReason?: string };
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
            include: { items: true, requisition: { include: { items: true, evaluationCriteria: true } } }
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
        if (requisition.status === 'Closed' || requisition.status === 'Fulfilled') {
            console.error(`[RESPOND-AWARD] Aborting: Requisition ${requisition.id} is already in a final state (${requisition.status}).`);
            throw new Error(`Cannot accept award because the parent requisition '${requisition.id}' is already closed.`);
        }
        // **SAFEGUARD END**
        
        const isPerItemAward = (requisition.rfqSettings as any)?.awardStrategy === 'item';
        console.log(`[RESPOND-AWARD] Award strategy is: ${isPerItemAward ? 'Per-Item' : 'Single Vendor'}`);

        if (action === 'accept') {
            let awardedQuoteItems: any[] = [];
            
            if (isPerItemAward && quoteItemId) {
                console.log('[RESPOND-AWARD] Handling specific per-item award acceptance for quoteItemId:', quoteItemId);

                const reqItemToUpdate = requisition.items.find(item => 
                    (item.perItemAwardDetails as PerItemAwardDetail[] || []).some(d => d.quoteItemId === quoteItemId && d.status === 'Awarded')
                );

                if (!reqItemToUpdate) {
                    throw new Error("No item in 'Awarded' status found for you to accept with that specific ID.");
                }
                
                awardedQuoteItems = quote.items.filter(item => item.id === quoteItemId);
                if (awardedQuoteItems.length === 0) {
                     throw new Error("Could not find the corresponding item in your quotation.");
                }

                // Update the status ONLY for the specific item being accepted
                const originalDetails = reqItemToUpdate.perItemAwardDetails as PerItemAwardDetail[] | null;
                if (originalDetails) {
                    const newDetails = originalDetails.map(d => 
                        d.quoteItemId === quoteItemId ? { ...d, status: 'Accepted' as const } : d
                    );
                    await tx.requisitionItem.update({
                        where: { id: reqItemToUpdate.id },
                        data: { perItemAwardDetails: newDetails }
                    });
                     console.log(`[RESPOND-AWARD] Updated perItemAwardDetails on requisition item ${reqItemToUpdate.id}.`);
                }

            } else { // Single vendor award
                console.log('[RESPOND-AWARD] Handling single-vendor award acceptance.');
                 await tx.quotation.update({
                    where: { id: quoteId },
                    data: { status: 'Accepted' }
                });
                
                const awardedIds = new Set(requisition.awardedQuoteItemIds || []);
                if (awardedIds.size === 0) {
                  throw new Error("Could not determine champion bids for this award. Aborting PO creation.");
                }
                
                awardedQuoteItems = quote.items.filter(item => awardedIds.has(item.id));
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
            await tx.quotation.update({
              where: { id: quoteId },
              data: { rejectionReason: rejectionReason || 'No reason provided.' },
            });
            
            const declinedItemIds = quoteItemId
                ? [quote.items.find(i => i.id === quoteItemId)?.requisitionItemId].filter(Boolean) as string[]
                : requisition.items
                    .filter(item => (item.perItemAwardDetails as PerItemAwardDetail[] | undefined)?.some(d => d.vendorId === user.vendorId && d.status === 'Awarded'))
                    .map(item => item.id);
            
            console.log(`[RESPOND-AWARD] Handling award rejection. Declined item IDs: ${declinedItemIds.join(', ')}`);
            return await handleAwardRejection(tx, quote, requisition, user, declinedItemIds, 'Vendor', rejectionReason);
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
