

'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { User } from '@/lib/types';
import { sendEmail } from '@/services/email-service';
import { format, differenceInMinutes } from 'date-fns';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const requisitionId = params.id;
  try {
    const body = await request.json();
    const { userId, awardResponseDeadline } = body;

    const user: User | null = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || (user.role !== 'Procurement_Officer' && user.role !== 'Admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const requisition = await prisma.purchaseRequisition.findUnique({ where: { id: requisitionId } });
    if (!requisition) {
      return NextResponse.json({ error: 'Requisition not found.' }, { status: 404 });
    }
    
    // This is the crucial gate. Only requisitions in PostApproved can be notified.
    if (requisition.status !== 'PostApproved') {
        return NextResponse.json({ error: 'This requisition is not ready for vendor notification.' }, { status: 400 });
    }

    const transactionResult = await prisma.$transaction(async (tx) => {
        // Update the main requisition status from PostApproved to Awarded, which signifies the offers are out.
        const updatedRequisition = await tx.purchaseRequisition.update({
            where: { id: requisitionId },
            data: {
                status: 'Awarded',
                awardResponseDeadline: awardResponseDeadline ? new Date(awardResponseDeadline) : requisition.awardResponseDeadline,
            }
        });

        // Find all quotes that are ready for award (either for a full or partial award)
        const winningQuotes = await tx.quotation.findMany({
            where: {
                requisitionId: requisitionId,
                status: { in: ['Pending_Award', 'Partially_Awarded'] }
            },
            include: {
                vendor: true
            }
        });

        if (winningQuotes.length === 0) {
            throw new Error("No winning quote in 'Pending Award' or 'Partially Awarded' status found to notify. The requisition might be in an inconsistent state.");
        }
        
        // Notify all winning vendors (for single or split awards)
        for (const winningQuote of winningQuotes) {
            
            // CRITICAL FIX: Update the quote status to 'Awarded'. This is the official offer.
            await tx.quotation.update({
                where: { id: winningQuote.id },
                data: { status: 'Awarded' }
            });

            if (winningQuote.vendor && requisition) {
                const finalDeadline = awardResponseDeadline ? new Date(awardResponseDeadline) : requisition.awardResponseDeadline;
                const emailHtml = `
                    <h1>Congratulations, ${winningQuote.vendor.name}!</h1>
                    <p>You have been awarded a contract for requisition <strong>${requisition.title}</strong>.</p>
                    <p>Please log in to the vendor portal to review the award details and respond.</p>
                    ${finalDeadline ? `<p><strong>This award must be accepted by ${format(finalDeadline, 'PPpp')}.</strong></p>` : ''}
                    <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002'}/vendor/dashboard">Go to Vendor Portal</a>
                    <p>Thank you,</p>
                    <p>Nib InternationalBank Procurement</p>
                `;

                await sendEmail({
                    to: winningQuote.vendor.email,
                    subject: `Contract Awarded: ${requisition.title}`,
                    html: emailHtml
                });
            }
        }
        
        await tx.auditLog.create({
            data: {
                transactionId: requisition.transactionId,
                user: { connect: { id: userId } },
                timestamp: new Date(),
                action: 'NOTIFY_VENDOR',
                entity: 'Requisition',
                entityId: requisitionId,
                details: `Sent award notification to winning vendor(s) for requisition ${requisitionId}.`
            }
        });

        return updatedRequisition;
    });

    return NextResponse.json({ message: 'Vendor notified successfully.', requisition: transactionResult });

  } catch (error) {
    console.error("Failed to notify vendor:", error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
