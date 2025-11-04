

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
              requisition: { include: { items: true } } 
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
        
        if (quote.status !== 'Awarded') {
            throw new Error('This quote is not currently in an awarded state.');
        }

        if (action === 'accept') {
            await tx.quotation.update({
                where: { id: quoteId },
                data: { status: 'Accepted' }
            });

            const newPO = await tx.purchaseOrder.create({
                data: {
                    transactionId: requisition.transactionId,
                    requisition: { connect: { id: requisition.id } },
                    requisitionTitle: requisition.title,
                    vendor: { connect: { id: quote.vendorId } },
                    items: {
                        create: quote.items.map((item) => ({
                            requisitionItemId: item.requisitionItemId,
                            name: item.name,
                            quantity: item.quantity,
                            unitPrice: item.unitPrice,
                            totalPrice: item.quantity * item.unitPrice,
                            receivedQuantity: 0,
                        }))
                    },
                    totalAmount: quote.totalPrice,
                    status: 'Issued',
                }
            });

            await tx.purchaseRequisition.update({
                where: {id: requisition.id},
                data: {status: 'PO_Created'}
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
            // When a single-vendor award is rejected, the entire quote is declined.
            await tx.quotation.update({ where: { id: quoteId }, data: { status: 'Declined' }});
            
            const auditLogPromise = tx.auditLog.create({
                data: {
                    timestamp: new Date(),
                    user: { connect: { id: user.id } },
                    action: 'REJECT_AWARD',
                    entity: 'Quotation',
                    entityId: quoteId,
                    details: `Vendor declined award.`,
                    transactionId: requisition.transactionId,
                }
            });

            // Check if any other standby vendors exist for this requisition.
            const standbyCount = await tx.quotation.count({
                where: {
                    requisitionId: requisition.id,
                    status: 'Standby'
                }
            });

            if (standbyCount > 0) {
                // If standbys exist, set status to Award_Declined and wait for manual promotion.
                await tx.purchaseRequisition.update({
                    where: { id: requisition.id },
                    data: { status: 'Award_Declined' }
                });
                await auditLogPromise;
                return { message: 'Award declined. Procurement officer has been notified to promote a standby vendor.' };
            } else {
                // NO standbys exist. Automatically reset the RFQ process.
                await tx.quotation.deleteMany({where: {requisitionId: requisition.id}});
                await tx.committeeAssignment.deleteMany({where: {requisitionId: requisition.id}});

                await tx.purchaseRequisition.update({
                    where: { id: requisition.id },
                    data: {
                        status: 'PreApproved',
                        deadline: null,
                        scoringDeadline: null,
                        committeeName: null,
                        committeePurpose: null,
                        financialCommitteeMembers: { set: [] },
                        technicalCommitteeMembers: { set: [] },
                        currentApproverId: null,
                        totalPrice: requisition.items.reduce((acc, item) => acc + (item.unitPrice || 0) * item.quantity, 0),
                    }
                });

                await tx.auditLog.create({
                    data: {
                        timestamp: new Date(),
                        action: 'RESET_RFQ_NO_STANDBY',
                        entity: 'Requisition',
                        entityId: requisition.id,
                        details: `All vendors declined and no standbys remain. RFQ process has been automatically reset to 'PreApproved' (Ready for RFQ).`,
                        transactionId: requisition.transactionId,
                    }
                });
                await auditLogPromise;
                return { message: 'Award declined. No more standby vendors. Requisition has been reset for new RFQ process.' };
            }
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
        return NextResponse.json({ error: 'Failed to process award acceptance due to a data conflict. The Purchase Order could not be linked to the Requisition.', details: (error as any).meta?.relation_name || 'Unknown relation' }, { status: 500 });
      }
      return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
