
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PerItemAwardDetail, PerItemAwardStatus, User, UserRole } from '@/lib/types';
import { sendEmail } from '@/services/email-service';
import { format, differenceInMinutes } from 'date-fns';
import { getActorFromToken, isActorAuthorizedForRequisition } from '@/lib/auth';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
    let actor;
    try {
        actor = await getActorFromToken(request);
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!actor) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const requisitionId = params.id;
    console.log(`[NOTIFY-VENDOR] Received request for requisition: ${requisitionId}`);
    try {
        const body = await request.json();
        const { awardResponseDeadline } = body;
        console.log(`[NOTIFY-VENDOR] Action by User ID: ${actor.id}, Award Response Deadline: ${awardResponseDeadline}`);
        
        const isAuthorized = await isActorAuthorizedForRequisition(actor, requisitionId as string);
        if (!isAuthorized) {
            console.error(`[NOTIFY-VENDOR] User ${actor.id} is not authorized to notify vendors for requisition ${requisitionId}.`);
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
            let responseMessage = 'Vendor(s) notified successfully.';

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

                const winningVendorIdList = Array.from(winningVendorIds);
                const quotesForVendors = await tx.quotation.findMany({
                    where: { requisitionId: requisitionId, vendorId: { in: winningVendorIdList } },
                    select: { vendorId: true, submissionMethod: true }
                } as any);
                const submissionByVendorId = new Map<string, string>((quotesForVendors || []).map((q: any) => [q.vendorId, q.submissionMethod]));

                // Rebuild updates with correct Awarded vs Accepted based on submission method
                itemsToUpdate.length = 0;
                for (const item of requisition.items) {
                    const perItemDetails = (item.perItemAwardDetails as PerItemAwardDetail[] | null) || [];
                    let hasUpdate = false;
                    const updatedDetails = perItemDetails.map(detail => {
                        if (detail.status === 'Pending_Award') {
                            hasUpdate = true;
                            const method = submissionByVendorId.get(detail.vendorId);
                            const nextStatus: PerItemAwardStatus = method === 'Manual' ? 'Accepted' : 'Awarded';
                            return { ...detail, status: nextStatus };
                        }
                        return detail;
                    });
                    if (hasUpdate) {
                        itemsToUpdate.push({ id: item.id, details: updatedDetails });
                    }
                }

                // Update requisition items
                for (const itemUpdate of itemsToUpdate) {
                    await tx.requisitionItem.update({
                        where: { id: itemUpdate.id },
                        data: { perItemAwardDetails: itemUpdate.details as any }
                    });
                }
                console.log(`[NOTIFY-VENDOR] Updated ${itemsToUpdate.length} requisition items with award statuses.`);

                const anyPortalWinners = winningVendorIdList.some(id => submissionByVendorId.get(id) !== 'Manual');
                finalUpdatedRequisition = await tx.purchaseRequisition.update({
                    where: { id: requisitionId },
                    data: {
                        status: anyPortalWinners ? 'Awarded' : 'PO_Created',
                        awardResponseDeadline: anyPortalWinners
                            ? (awardResponseDeadline ? new Date(awardResponseDeadline) : requisition.awardResponseDeadline)
                            : null,
                    }
                });

                if (!anyPortalWinners) {
                    // Auto-create POs for manual winners (no vendor portal acceptance needed)
                    const manualVendorIds = winningVendorIdList.filter(id => submissionByVendorId.get(id) === 'Manual');
                    for (const vendorId of manualVendorIds) {
                        const awardedQuoteItemIdsForVendor = new Set<string>();
                        for (const itemUpdate of itemsToUpdate) {
                            for (const detail of itemUpdate.details as any[]) {
                                if (detail.vendorId === vendorId && (detail.status === 'Accepted' || detail.status === 'Awarded')) {
                                    if (detail.quoteItemId) awardedQuoteItemIdsForVendor.add(String(detail.quoteItemId));
                                }
                            }
                        }

                        const quoteItems = await tx.quoteItem.findMany({
                            where: { id: { in: Array.from(awardedQuoteItemIdsForVendor) } },
                            select: {
                                requisitionItemId: true,
                                name: true,
                                quantity: true,
                                unitPrice: true,
                            }
                        });

                        if (quoteItems.length === 0) continue;
                        const totalAmount = quoteItems.reduce((acc, it) => acc + it.unitPrice * it.quantity, 0);

                        await tx.purchaseOrder.create({
                            data: {
                                transactionId: requisition.transactionId,
                                requisition: { connect: { id: requisitionId } },
                                requisitionTitle: requisition.title,
                                vendor: { connect: { id: vendorId } },
                                items: {
                                    create: quoteItems.map((it) => ({
                                        requisitionItemId: it.requisitionItemId,
                                        name: it.name,
                                        quantity: it.quantity,
                                        unitPrice: it.unitPrice,
                                        totalPrice: it.quantity * it.unitPrice,
                                        receivedQuantity: 0,
                                    })),
                                },
                                totalAmount,
                                status: 'Issued',
                            }
                        });
                    }

                    responseMessage = 'Notification coming soon.';
                } else {
                    // Email only portal winners
                    const portalWinnerIds = winningVendorIdList.filter(id => submissionByVendorId.get(id) !== 'Manual');
                    const allWinningVendors = await tx.vendor.findMany({ where: { id: { in: portalWinnerIds } } });
                    const vendorMap = new Map(allWinningVendors.map(v => [v.id, v]));

                    for (const vendorId of portalWinnerIds) {
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
                }
            
            } else {
                console.log('[NOTIFY-VENDOR] Handling single-vendor award strategy.');
                const winningQuote = await tx.quotation.findFirst({
                    where: {
                        requisitionId: requisitionId,
                        status: 'Pending_Award'
                    },
                    include: {
                        vendor: true,
                        items: true,
                    }
                } as any);

                if (!winningQuote) {
                    throw new Error("No winning quote in 'Pending Award' status found to notify. The requisition might be in an inconsistent state.");
                }
                console.log(`[NOTIFY-VENDOR] Found winning vendor: ${winningQuote.vendor.name}`);

                const submissionMethod = (winningQuote as any).submissionMethod;
                const isManual = submissionMethod === 'Manual';

                if (isManual) {
                    // Manual quotation: no vendor portal/email; auto-accept and create PO immediately.
                    await tx.quotation.update({
                        where: { id: winningQuote.id },
                        data: { status: 'Accepted' }
                    });

                    const awardedQuoteItems = (winningQuote.items || []).filter((item: any) =>
                        (requisition.awardedQuoteItemIds || []).includes(item.id)
                    );
                    const itemsForPO = awardedQuoteItems.length > 0 ? awardedQuoteItems : (winningQuote.items || []);
                    const totalAmount = itemsForPO.reduce((acc: number, item: any) => acc + (item.unitPrice * item.quantity), 0);

                    await tx.purchaseOrder.create({
                        data: {
                            transactionId: requisition.transactionId,
                            requisition: { connect: { id: requisitionId } },
                            requisitionTitle: requisition.title,
                            vendor: { connect: { id: winningQuote.vendorId } },
                            items: {
                                create: itemsForPO.map((item: any) => ({
                                    requisitionItemId: item.requisitionItemId,
                                    name: item.name,
                                    quantity: item.quantity,
                                    unitPrice: item.unitPrice,
                                    totalPrice: item.quantity * item.unitPrice,
                                    receivedQuantity: 0,
                                }))
                            },
                            totalAmount,
                            status: 'Issued',
                        }
                    });

                    finalUpdatedRequisition = await tx.purchaseRequisition.update({
                        where: { id: requisitionId },
                        data: {
                            status: 'PO_Created',
                            awardResponseDeadline: null,
                        }
                    });

                    responseMessage = 'Notification coming soon.';
                } else {
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

            return { requisition: finalUpdatedRequisition, message: responseMessage };
        });

        console.log('[NOTIFY-VENDOR] Transaction complete.');
        return NextResponse.json({ message: transactionResult.message, requisition: transactionResult.requisition });

  } catch (error) {
    console.error("[NOTIFY-VENDOR] Failed to notify vendor:", error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
