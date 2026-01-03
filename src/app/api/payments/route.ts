
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
        let actor;
        try {
                actor = await getActorFromToken(request);
        } catch {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
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

    const paymentReference = `PAY-${Date.now()}`;

    // Keep DB transaction small and fast (no email / heavy reads inside).
    const updatedInvoice = await prisma.$transaction(async (tx) => {
        const invoice = await tx.invoice.update({
            where: { id: invoiceId },
            data: {
                status: 'Paid',
                paymentDate: new Date(),
                paymentReference,
                paymentEvidenceUrl,
            }
        });

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

        return invoice;
    });

    // After commit: check if requisition can be closed.
    if (invoiceToUpdate.po?.requisitionId) {
        const requisition = await prisma.purchaseRequisition.findUnique({
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
                        const invoiceForPo = poForItem.invoices.find(inv => inv.purchaseOrderId === poForItem.id);
                        return !!invoiceForPo && invoiceForPo.status === 'Paid';
                    }

                    const isRestarted = details.some(d => d.status === 'Restarted');
                    return isRestarted;
                });
            } else {
                const allPOsClosed = requisition.purchaseOrders.length > 0 && requisition.purchaseOrders.every(po =>
                    ['Delivered', 'Closed', 'Cancelled'].includes(po.status.replace(/_/g, ' '))
                );

                const allInvoicesPaidOrNotRequired = requisition.purchaseOrders.every(po => {
                    if (!po.invoices || po.invoices.length === 0) return true;
                    return po.invoices.every(inv => inv.status === 'Paid');
                });

                isFullyComplete = allPOsClosed && allInvoicesPaidOrNotRequired;
            }

            if (isFullyComplete) {
                await prisma.purchaseRequisition.update({
                    where: { id: requisition.id },
                    data: { status: 'Closed' }
                });
            }
        }
    }

    // After commit: email notification (never block payment success on email).
    const isSingleVendorAward = invoiceToUpdate.po?.requisition && (invoiceToUpdate.po.requisition.rfqSettings as any)?.awardStrategy !== 'item';
    let message: string | undefined;
    if (isSingleVendorAward && invoiceToUpdate.po?.vendorId && invoiceToUpdate.po?.requisitionId) {
        const awardedQuote = await prisma.quotation.findFirst({
            where: {
                requisitionId: invoiceToUpdate.po.requisitionId,
                vendorId: invoiceToUpdate.po.vendorId,
                status: { in: ['Accepted', 'Awarded', 'Partially_Awarded', 'Invoice_Submitted', 'Matched', 'Mismatched', 'Paid'] }
            } as any,
            select: { submissionMethod: true }
        } as any);

        const isManual = awardedQuote?.submissionMethod === 'Manual';

        if (isManual) {
            message = 'Notification coming soon.';
        } else if (invoiceToUpdate.po?.vendor?.email) {
            const vendor = invoiceToUpdate.po.vendor;
            const requisitionTitle = invoiceToUpdate.po.requisition?.title || 'Requisition';

            const emailHtml = `
                <h1>Payment Confirmation</h1>
                <p>Hello ${vendor.name},</p>
                <p>We are pleased to inform you that your invoice for requisition <strong>${requisitionTitle}</strong> has been paid.</p>
                <ul>
                    <li><strong>Invoice ID:</strong> ${updatedInvoice.id}</li>
                    <li><strong>Payment Reference:</strong> ${paymentReference}</li>
                    <li><strong>Payment Date:</strong> ${updatedInvoice.paymentDate ? format(new Date(updatedInvoice.paymentDate), 'PPp') : ''}</li>
                </ul>
                <p>You can view the payment evidence in the vendor portal. Thank you for your business.</p>
                <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002'}/vendor/dashboard">Go to Vendor Portal</a>
            `;

            sendEmail({
                to: vendor.email,
                subject: `Payment Processed for Requisition: ${requisitionTitle}`,
                html: emailHtml
            }).catch(e => console.error('[PROCESS-PAYMENT] Failed to send email:', e));
        }
    }

    return NextResponse.json({ invoice: updatedInvoice, message });
  } catch (error) {
    console.error('[PROCESS-PAYMENT] Failed to process payment:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
