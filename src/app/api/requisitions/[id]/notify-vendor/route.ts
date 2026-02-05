
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PerItemAwardDetail, PerItemAwardStatus, User, UserRole } from '@/lib/types';
import { sendEmail } from '@/services/email-service';
import { format, differenceInMinutes } from 'date-fns';
import { getActorFromToken, isActorAuthorizedForRequisition } from '@/lib/auth';

export async function POST(
    request: Request,
    context: { params: any }
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

    const params = await context.params;
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
                    // All winning vendors submitted manually — auto-accept and create POs per vendor
                    const manualVendorIds = winningVendorIdList.filter(id => submissionByVendorId.get(id) === 'Manual');

                    if (manualVendorIds.length > 0) {
                        // Fetch full quotations for manual vendors including their items
                        const manualQuotes = await tx.quotation.findMany({
                            where: { requisitionId: requisitionId, vendorId: { in: manualVendorIds } },
                            include: { items: true }
                        } as any);

                        // For each manual vendor, collect accepted quote item ids based on updated requisition perItemAwardDetails
                        const reqItems = await tx.requisitionItem.findMany({ where: { requisitionId: requisitionId } });

                        for (const vendorId of manualVendorIds) {
                            const acceptedQuoteItemIds: string[] = [];
                            for (const ri of reqItems) {
                                const details = (ri.perItemAwardDetails as any[]) || [];
                                for (const d of details) {
                                    if (d.vendorId === vendorId && d.status === 'Accepted' && d.quoteItemId) {
                                        acceptedQuoteItemIds.push(d.quoteItemId);
                                    }
                                }
                            }

                            const quoteForVendor = manualQuotes.find(q => q.vendorId === vendorId);
                            if (!quoteForVendor) continue;

                            const itemsForPO = (quoteForVendor.items || []).filter((it: any) => acceptedQuoteItemIds.length > 0 ? acceptedQuoteItemIds.includes(it.id) : true);
                            if (itemsForPO.length === 0) continue;

                            const totalAmount = itemsForPO.reduce((acc: number, item: any) => acc + (item.unitPrice * item.quantity), 0);

                            // Idempotency: avoid creating duplicate PO for same requisition + vendor
                            const existingPO = await tx.purchaseOrder.findFirst({
                                where: {
                                    requisition: { id: requisitionId },
                                    vendorId: vendorId,
                                    status: 'Issued'
                                }
                            } as any);

                            let newPO;
                            if (existingPO) {
                                newPO = existingPO;
                            } else {
                                newPO = await tx.purchaseOrder.create({
                                    data: {
                                        transactionId: requisition.transactionId,
                                        requisition: { connect: { id: requisitionId } },
                                        requisitionTitle: requisition.title,
                                        vendor: { connect: { id: vendorId } },
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

                                await tx.auditLog.create({
                                    data: {
                                        transactionId: requisition.transactionId,
                                        timestamp: new Date(),
                                        user: { connect: { id: actor.id } },
                                        action: 'AUTO_CREATE_PO_MANUAL_AWARD',
                                        entity: 'PurchaseOrder',
                                        entityId: newPO.id,
                                        details: `Auto-created PO ${newPO.id} for manual-awarded vendor ${vendorId} on requisition ${requisitionId}.`
                                    }
                                });
                            }

                            // Mark the vendor quotation as Accepted so vendor-accept flow won't create duplicate POs
                            await tx.quotation.update({ where: { id: quoteForVendor.id }, data: { status: 'Accepted' } } as any);
                        }
                    }

                    // Mark requisition as PO_Created since manual winners were processed
                    finalUpdatedRequisition = await tx.purchaseRequisition.update({
                        where: { id: requisitionId },
                        data: {
                            status: 'PO_Created',
                            awardResponseDeadline: null,
                        }
                    });
                    responseMessage = 'Manual winners processed; POs created.';
                } else {
                    // Queue email jobs for portal winners
                    const portalWinnerIds = winningVendorIdList.filter(id => submissionByVendorId.get(id) !== 'Manual');
                    const allWinningVendors = await tx.vendor.findMany({ where: { id: { in: portalWinnerIds } } });
                    const vendorMap = new Map(allWinningVendors.map(v => [v.id, v]));

                    for (const vendorId of portalWinnerIds) {
                        const vendorInfo = vendorMap.get(vendorId);
                        if (vendorInfo) {
                            const emailHtml = `
                                <h1>Congratulations, ${vendorInfo.name}!</h1>
                                <p>You have been awarded a contract for items in requisition <strong>${requisition.title}</strong>.</p>
                                <p>Please log in to the vendor portal to review the award details and respond.</p>
                                ${finalUpdatedRequisition.awardResponseDeadline ? `<p><strong>This award must be accepted by ${format(new Date(finalUpdatedRequisition.awardResponseDeadline), 'PPpp')}.</strong></p>` : ''}
                                <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002'}/vendor/dashboard">Go to Vendor Portal</a>
                                <p>Thank you,</p>
                                <p>Nib InternationalBank Procurement</p>
                            `;
                            await tx.emailJob.create({
                                data: {
                                    to: vendorInfo.email,
                                    subject: `Contract Awarded: ${requisition.title}`,
                                    html: emailHtml,
                                }
                            });
                        }
                    }

                    // Also ensure manual winners get POs in mixed flows (idempotent, item-level)
                    const manualVendorIdsInMixed = winningVendorIdList.filter(id => submissionByVendorId.get(id) === 'Manual');
                    if (manualVendorIdsInMixed.length > 0) {
                        const manualQuotesForMixed = await tx.quotation.findMany({
                            where: { requisitionId: requisitionId, vendorId: { in: manualVendorIdsInMixed } },
                            include: { items: true }
                        } as any);

                        const reqItemsForMixed = await tx.requisitionItem.findMany({ where: { requisitionId: requisitionId } });

                        // Helper: order-insensitive comparison of two string arrays
                        function sameItemSet(a: string[], b: string[]) {
                            if (a.length !== b.length) return false;
                            const sa = [...a].sort();
                            const sb = [...b].sort();
                            for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
                            return true;
                        }

                        for (const vendorId of manualVendorIdsInMixed) {
                            const quoteForVendor = manualQuotesForMixed.find(q => q.vendorId === vendorId);
                            if (!quoteForVendor) continue;

                            // Determine which quote items were Accepted at the requisition item level
                            const acceptedQuoteItemIds: string[] = [];
                            for (const ri of reqItemsForMixed) {
                                const details = (ri.perItemAwardDetails as any[]) || [];
                                for (const d of details) {
                                    if (d.vendorId === vendorId && d.status === 'Accepted' && d.quoteItemId) {
                                        acceptedQuoteItemIds.push(d.quoteItemId);
                                    }
                                }
                            }

                            const itemsForPO = (quoteForVendor.items || []).filter((it: any) => acceptedQuoteItemIds.length > 0 ? acceptedQuoteItemIds.includes(it.id) : true);
                            if (itemsForPO.length === 0) continue;

                            const totalAmount = itemsForPO.reduce((acc: number, item: any) => acc + (item.unitPrice * item.quantity), 0);

                            // Idempotency: fetch candidate POs and compare item sets (by requisitionItemId)
                            const candidatePOs = await tx.purchaseOrder.findMany({
                                where: { requisition: { id: requisitionId }, vendorId: vendorId, status: 'Issued' },
                                include: { items: true }
                            } as any);

                            const itemsForPOReqIds = itemsForPO.map((i: any) => i.requisitionItemId as string);

                            let existingPO = candidatePOs.find((po: any) => {
                                const poItemReqIds = (po.items || []).map((it: any) => it.requisitionItemId as string);
                                return sameItemSet(poItemReqIds, itemsForPOReqIds);
                            });

                            let newPO: any;
                            if (existingPO) {
                                newPO = existingPO;
                            } else {
                                newPO = await tx.purchaseOrder.create({
                                    data: {
                                        transactionId: requisition.transactionId,
                                        requisition: { connect: { id: requisitionId } },
                                        requisitionTitle: requisition.title,
                                        vendor: { connect: { id: vendorId } },
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

                                await tx.auditLog.create({
                                    data: {
                                        transactionId: requisition.transactionId,
                                        timestamp: new Date(),
                                        user: { connect: { id: actor.id } },
                                        action: 'AUTO_CREATE_PO_MANUAL_AWARD',
                                        entity: 'PurchaseOrder',
                                        entityId: newPO.id,
                                        details: `Auto-created PO ${newPO.id} for manual-awarded vendor ${vendorId} on requisition ${requisitionId}.`
                                    }
                                });
                            }

                            // Persist quotation status as Accepted for manual vendor
                            if (quoteForVendor?.id) {
                                await tx.quotation.update({ where: { id: quoteForVendor.id }, data: { status: 'Accepted' } } as any);
                            }
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

                    await tx.emailJob.create({
                        data: {
                            to: winningQuote.vendor.email,
                            subject: `Contract Awarded: ${requisition.title}`,
                            html: emailHtml,
                        }
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
