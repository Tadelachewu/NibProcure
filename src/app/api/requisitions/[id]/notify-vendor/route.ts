'use server';
import 'dotenv/config';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PerItemAwardDetail, PerItemAwardStatus, User, UserRole } from '@/lib/types';
import { sendEmail } from '@/services/email-service';
import { format, differenceInMinutes } from 'date-fns';
import { getActorFromToken } from '@/lib/auth';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
    try {
        const actor = await getActorFromToken(request);

        const requisitionId = params.id;
        console.log(`[NOTIFY-VENDOR] Received request for requisition: ${requisitionId}`);
        const body = await request.json();
        const { awardResponseDeadline } = body;
        console.log(`[NOTIFY-VENDOR] Action by User ID: ${actor.id}, Award Response Deadline: ${awardResponseDeadline}`);
        
        const userRoles = actor.roles as UserRole[];
        const isAuthorized = userRoles.includes('Admin') || userRoles.includes('Procurement_Officer');


        if (!isAuthorized) {
            console.error(`[NOTIFY-VENDOR] User ${actor.id} is not authorized to notify vendors.`);
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const requisition = await prisma.purchaseRequisition.findUnique({ 
            where: { id: requisitionId },
            include: { items: true }
        });
        if (!requisition) {
        console.error(`[NOTIFY-VENDOR] Requisition ${requisitionId} not found.`);
        return NextResponse.json({ error: 'Requisition not found.' }, { status: 404 });
        }
        
        if (requisition.status !== 'PostApproved') {
            console.error(`[NOTIFY-VENDOR] Requisition ${requisitionId} is not in PostApproved state. Current state: ${requisition.status}`);
            return NextResponse.json({ error: 'This requisition is not ready for vendor notification.' }, { status: 400 });
        }

        console.log('[NOTIFY-VENDOR] Starting transaction...');
        const transactionResult = await prisma.$transaction(async (tx) => {
            const rfqSettings = requisition.rfqSettings as any;
            let finalUpdatedRequisition;

            if (rfqSettings?.awardStrategy === 'item') {
                console.log('[NOTIFY-VENDOR] Handling per-item award strategy.');
                const winningVendorIds = new Set<string>();
                const itemsToUpdate = [];

                for (const item of requisition.items) {
                    const perItemDetails = (item.perItemAwardDetails as PerItemAwardDetail[] | null) || [];
                    let hasUpdate = false;
                    
                    const updatedDetails = perItemDetails.map(detail => {
                        if (detail.status === 'Pending_Award') {
                            hasUpdate = true;
                            winningVendorIds.add(detail.vendorId);
                            return { ...detail, status: 'Awarded' as PerItemAwardStatus };
                        }
                        return detail;
                    });

                    if (hasUpdate) {
                        itemsToUpdate.push({
                            id: item.id,
                            details: updatedDetails
                        });
                    }
                }
                
                if (winningVendorIds.size === 0) {
                    throw new Error("No vendors found in 'Pending Award' status across all items. The requisition might be in an inconsistent state.");
                }
                console.log(`[NOTIFY-VENDOR] Found ${winningVendorIds.size} winning vendors to notify.`);

                const allWinningVendors = await tx.vendor.findMany({ 
                    where: { id: { in: Array.from(winningVendorIds) } }
                });
                const vendorMap = new Map(allWinningVendors.map(v => [v.id, v]));
                
                for (const itemUpdate of itemsToUpdate) {
                    await tx.requisitionItem.update({
                        where: { id: itemUpdate.id },
                        data: { perItemAwardDetails: itemUpdate.details as any }
                    });
                }
                console.log(`[NOTIFY-VENDOR] Updated ${itemsToUpdate.length} requisition items with 'Awarded' status.`);

                finalUpdatedRequisition = await tx.purchaseRequisition.update({
                where: { id: requisitionId },
                data: {
                    status: 'Awarded',
                    awardResponseDeadline: awardResponseDeadline ? new Date(awardResponseDeadline) : requisition.awardResponseDeadline,
                }
                });

                for (const vendorId of winningVendorIds) {
                    const vendorInfo = vendorMap.get(vendorId);
                    if (vendorInfo) {
                        console.log(`[NOTIFY-VENDOR] Sending email to ${vendorInfo.name} (${vendorInfo.email})`);
                        const emailHtml = `
                            <h1>Congratulations, ${vendorInfo.name}!</h1>
                            <p>You have been awarded a contract for items in requisition <strong>${requisition.title}</strong>.</p>
                            <p>Please log in to the vendor portal to review the award details and respond.</p>
                            ${finalUpdatedRequisition.awardResponseDeadline ? `<p><strong>This award must be accepted by ${format(new Date(finalUpdatedRequisition.awardResponseDeadline), 'PPpp')}.</strong></p>` : ''}
                            <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002'}/vendor/dashboard">Go to Vendor Portal</a>
                            <p>Thank you,</p>
                            <p>Nib InternationalBank Procurement</p>
                        `;

                        await sendEmail({
                            to: vendorInfo.email,
                            subject: `Contract Awarded: ${requisition.title}`,
                            html: emailHtml
                        });
                    }
                }
            
            } else {
                console.log('[NOTIFY-VENDOR] Handling single-vendor award strategy.');
                const winningQuote = await tx.quotation.findFirst({
                    where: {
                        requisitionId: requisitionId,
                        status: 'Pending_Award'
                    },
                    include: {
                        vendor: true
                    }
                });

                if (!winningQuote) {
                    throw new Error("No winning quote in 'Pending Award' status found to notify. The requisition might be in an inconsistent state.");
                }
                console.log(`[NOTIFY-VENDOR] Found winning vendor: ${winningQuote.vendor.name}`);
                
                finalUpdatedRequisition = await tx.purchaseRequisition.update({
                    where: { id: requisitionId },
                    data: {
                        status: 'Awarded',
                        awardResponseDeadline: awardResponseDeadline ? new Date(awardResponseDeadline) : requisition.awardResponseDeadline,
                    }
                });
                
                await tx.quotation.update({
                    where: { id: winningQuote.id },
                    data: { status: 'Awarded' }
                });
                
                console.log(`[NOTIFY-VENDOR] Sending email to ${winningQuote.vendor.name} (${winningQuote.vendor.email})`);
                const emailHtml = `
                    <h1>Congratulations, ${winningQuote.vendor.name}!</h1>
                    <p>You have been awarded the contract for requisition <strong>${requisition.title}</strong>.</p>
                    <p>Please log in to the vendor portal to review the award and respond.</p>
                    ${finalUpdatedRequisition.awardResponseDeadline ? `<p><strong>This award must be accepted by ${format(new Date(finalUpdatedRequisition.awardResponseDeadline), 'PPpp')}.</strong></p>` : ''}
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
            
            await tx.auditLog.create({
                data: {
                    transactionId: requisition.transactionId,
                    user: { connect: { id: actor.id } },
                    timestamp: new Date(),
                    action: 'NOTIFY_VENDOR',
                    entity: 'Requisition',
                    entityId: requisitionId,
                    details: `Sent award notification to winning vendor(s) for requisition ${requisitionId}.`
                }
            });
            console.log('[NOTIFY-VENDOR] Audit log created.');

            return finalUpdatedRequisition;
        });

        console.log('[NOTIFY-VENDOR] Transaction complete.');
        return NextResponse.json({ message: 'Vendor(s) notified successfully.', requisition: transactionResult });

  } catch (error) {
    console.error("[NOTIFY-VENDOR] Failed to notify vendor:", error);
    if (error instanceof Error && error.message.includes('Unauthorized')) {
        return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
