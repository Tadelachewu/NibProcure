
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PerItemAwardDetail } from '@/lib/types';
import { getActorFromToken } from '@/lib/auth';
import { sendEmail } from '@/services/email-service';
import { format } from 'date-fns';

export async function POST(
  request: Request
) {
  try {
    const actor = await getActorFromToken(request);
    if (!actor || !(actor.roles as string[]).includes('Finance')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { invoiceId, paymentEvidenceUrl } = body;
    
    if (!paymentEvidenceUrl) {
      return NextResponse.json({ error: 'Payment evidence document is required.' }, { status: 400 });
    }

    const invoiceToUpdate = await prisma.invoice.findUnique({ 
        where: { id: invoiceId },
        include: { 
            po: { 
                include: { 
                    receipts: true,
                    vendor: true, // Fetch vendor details
                    requisition: true, // Fetch requisition details
                } 
            }
        }
    });
    if (!invoiceToUpdate) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    
    if (invoiceToUpdate.status !== 'Approved_for_Payment') {
        return NextResponse.json({ error: 'Invoice must be approved before payment.' }, { status: 400 });
    }

    if (invoiceToUpdate.po?.receipts?.some(r => r.status === 'Disputed')) {
        return NextResponse.json({ error: 'Cannot process payment: associated goods receipt is disputed.' }, { status: 400 });
    }
    
    const transactionResult = await prisma.$transaction(async (tx) => {

        const paymentReference = `PAY-${Date.now()}`;
        const updatedInvoice = await tx.invoice.update({
            where: { id: invoiceId },
            data: {
                status: 'Paid',
                paymentDate: new Date(),
                paymentReference: paymentReference,
                paymentEvidenceUrl: paymentEvidenceUrl,
            }
        });
        
        let requisition;
        if (invoiceToUpdate.po?.requisitionId) {
            requisition = await tx.purchaseRequisition.findUnique({
                where: { id: invoiceToUpdate.po.requisitionId },
                include: { 
                    items: true, 
                    purchaseOrders: { 
                        include: { 
                            invoices: true,
                            items: true,
                        }
                    }
                }
            });
            
            if (requisition) {
                const isPerItem = (requisition.rfqSettings as any)?.awardStrategy === 'item';
                let isFullyComplete = false;

                if (isPerItem) {
                    isFullyComplete = requisition.items.every(item => {
                        const details = (item.perItemAwardDetails as PerItemAwardDetail[] | undefined) || [];
                        if (details.length === 0) return true;

                        const acceptedDetail = details.find(d => d.status === 'Accepted');
                        if (acceptedDetail) {
                            const poForItem = requisition.purchaseOrders.find(po => po.items.some(poi => poi.requisitionItemId === item.id));
                            if (!poForItem) return false;
                            
                            const invoiceForItem = poForItem.invoices.find(inv => inv.purchaseOrderId === poForItem.id);
                            return !!invoiceForItem && invoiceForItem.status === 'Paid';
                        }
                        
                        const isRestarted = details.some(d => d.status === 'Restarted');
                        return isRestarted;
                    });

                } else {
                    const allPOsForRequisition = await tx.purchaseOrder.findMany({
                        where: { requisitionId: requisition.id },
                        include: { invoices: true }
                    });
                    
                    const allPOsClosed = allPOsForRequisition.length > 0 && allPOsForRequisition.every(po => 
                        ['Delivered', 'Closed', 'Cancelled'].includes(po.status.replace(/_/g, ' '))
                    );
                    
                    const allInvoicesPaidOrNotRequired = allPOsForRequisition.every(po => {
                         if (!po.invoices || po.invoices.length === 0) return true; // No invoice needed
                         return po.invoices.every(inv => inv.status === 'Paid');
                    });

                    isFullyComplete = allPOsClosed && allInvoicesPaidOrNotRequired;
                }

                if (isFullyComplete) {
                    await tx.purchaseRequisition.update({
                        where: { id: requisition.id },
                        data: { status: 'Closed' }
                    });
                }
            }
        }
        
        await tx.auditLog.create({
            data: {
                user: { connect: { id: actor.id } },
                timestamp: new Date(),
                action: 'PROCESS_PAYMENT',
                entity: 'Invoice',
                entityId: invoiceId,
                details: `Processed payment for invoice ${invoiceId}. Ref: ${paymentReference}.`,
                transactionId: invoiceToUpdate.transactionId,
            }
        });
        
        const isSingleVendorAward = invoiceToUpdate.po?.requisition && (invoiceToUpdate.po.requisition.rfqSettings as any)?.awardStrategy !== 'item';
        if (isSingleVendorAward && invoiceToUpdate.po?.vendor) {
            const vendor = invoiceToUpdate.po.vendor;
            const emailHtml = `
                <h1>Payment Confirmation</h1>
                <p>Hello ${vendor.name},</p>
                <p>We are pleased to inform you that your invoice for requisition <strong>${invoiceToUpdate.po.requisition.title}</strong> has been paid.</p>
                <ul>
                    <li><strong>Invoice ID:</strong> ${updatedInvoice.id}</li>
                    <li><strong>Payment Reference:</strong> ${paymentReference}</li>
                    <li><strong>Payment Date:</strong> ${format(new Date(updatedInvoice.paymentDate!), 'PPp')}</li>
                </ul>
                <p>You can view the payment evidence in the vendor portal. Thank you for your business.</p>
                <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002'}/vendor/dashboard">Go to Vendor Portal</a>
            `;
            
            await sendEmail({
                to: vendor.email,
                subject: `Payment Processed for Requisition: ${invoiceToUpdate.po.requisition.title}`,
                html: emailHtml
            });
        }


        return updatedInvoice;
    });
    
    return NextResponse.json(transactionResult);
  } catch (error) {
    console.error('[PROCESS-PAYMENT] Failed to process payment:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
