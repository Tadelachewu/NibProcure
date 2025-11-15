

'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PerItemAwardDetail, PerItemAwardStatus, User, UserRole } from '@/lib/types';
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

    const user: User | null = await prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const rfqSenderSetting = await prisma.setting.findUnique({ where: { key: 'rfqSenderSetting' } });
    let isAuthorized = false;
    const userRoleName = user.role.name as UserRole;

    if (userRoleName === 'Admin') {
        isAuthorized = true;
    } else if (rfqSenderSetting?.value && typeof rfqSenderSetting.value === 'object' && 'type' in rfqSenderSetting.value) {
        const setting = rfqSenderSetting.value as { type: string, userId?: string };
        if (setting.type === 'specific') {
            isAuthorized = setting.userId === userId;
        } else { // 'all' case
            isAuthorized = userRoleName === 'Procurement_Officer';
        }
    }


    if (!isAuthorized) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const requisition = await prisma.purchaseRequisition.findUnique({ 
        where: { id: requisitionId },
        include: { items: true }
    });
    if (!requisition) {
      return NextResponse.json({ error: 'Requisition not found.' }, { status: 404 });
    }
    
    if (requisition.status !== 'PostApproved') {
        return NextResponse.json({ error: 'This requisition is not ready for vendor notification.' }, { status: 400 });
    }

    const transactionResult = await prisma.$transaction(async (tx) => {
        const rfqSettings = requisition.rfqSettings as any;
        let finalUpdatedRequisition;

        if (rfqSettings?.awardStrategy === 'item') {
            // --- LOGIC FOR PER-ITEM AWARDS ---
            const winningVendorIds = new Set<string>();
            const itemsToUpdate = [];

            // 1. First pass: Collect IDs and prepare updates
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

            // 2. Fetch all winning vendors' details in one query
            const allWinningVendors = await tx.vendor.findMany({ 
                where: { id: { in: Array.from(winningVendorIds) } }
            });
            const vendorMap = new Map(allWinningVendors.map(v => [v.id, v]));
            
            // 3. Update all items in the database
            for (const itemUpdate of itemsToUpdate) {
                await tx.requisitionItem.update({
                    where: { id: itemUpdate.id },
                    data: { perItemAwardDetails: itemUpdate.details as any }
                });
            }

            // 4. Update the main requisition status
            finalUpdatedRequisition = await tx.purchaseRequisition.update({
              where: { id: requisitionId },
              data: {
                  status: 'Awarded',
                  awardResponseDeadline: awardResponseDeadline ? new Date(awardResponseDeadline) : requisition.awardResponseDeadline,
              }
            });

            // 5. Send notifications
            for (const vendorId of winningVendorIds) {
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

                    await sendEmail({
                        to: vendorInfo.email,
                        subject: `Contract Awarded: ${requisition.title}`,
                        html: emailHtml
                    });
                }
            }
        
        } else {
            // --- LOGIC FOR SINGLE VENDOR AWARD ---
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
                user: { connect: { id: userId } },
                timestamp: new Date(),
                action: 'NOTIFY_VENDOR',
                entity: 'Requisition',
                entityId: requisitionId,
                details: `Sent award notification to winning vendor(s) for requisition ${requisitionId}.`
            }
        });

        return finalUpdatedRequisition;
    });

    return NextResponse.json({ message: 'Vendor(s) notified successfully.', requisition: transactionResult });

  } catch (error) {
    console.error("Failed to notify vendor:", error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}

    