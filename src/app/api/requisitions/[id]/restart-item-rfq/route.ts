
'use server';

import { NextResponse } from 'next/server';
import { prisma, Prisma } from '@prisma/client';
import { PerItemAwardDetail, User, UserRole } from '@/lib/types';
import { sendEmail } from '@/services/email-service';
import { format } from 'date-fns';


export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const requisitionId = params.id;
    const body = await request.json();
    const { userId, itemIds, vendorIds, newDeadline } = body;

    const actor: User | null = await prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized: User not found' }, { status: 403 });
    }
    
    // Correct Authorization Logic
    const rfqSenderSetting = await prisma.setting.findUnique({ where: { key: 'rfqSenderSetting' } });
    let isAuthorized = false;
    const userRoleName = (actor.role as any)?.name as UserRole;

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
        return NextResponse.json({ error: 'Unauthorized to restart this RFQ.' }, { status: 403 });
    }


    if (!itemIds || itemIds.length === 0 || !vendorIds || vendorIds.length === 0 || !newDeadline) {
      return NextResponse.json({ error: 'Missing required parameters: itemIds, vendorIds, and newDeadline.' }, { status: 400 });
    }

    const requisition = await prisma.purchaseRequisition.findUnique({ where: { id: requisitionId } });
    if (!requisition) {
      return NextResponse.json({ error: 'Requisition not found.' }, { status: 404 });
    }

    const transactionResult = await prisma.$transaction(async (tx) => {
        // Reset the award details for the specific failed items
        for (const itemId of itemIds) {
            await tx.requisitionItem.update({
                where: { id: itemId },
                data: { perItemAwardDetails: Prisma.JsonNull }
            });
        }

        // Set the requisition back to an active bidding state
        const updatedRequisition = await tx.purchaseRequisition.update({
            where: { id: requisitionId },
            data: {
                status: 'Accepting_Quotes',
                deadline: new Date(newDeadline),
            }
        });
        
        const vendorsToNotify = await tx.vendor.findMany({
            where: { id: { in: vendorIds } }
        });
        
        const itemsToReTender = await tx.requisitionItem.findMany({
            where: { id: { in: itemIds } }
        });

        const itemNames = itemsToReTender.map(i => i.name).join(', ');

        for (const vendor of vendorsToNotify) {
            const emailHtml = `
                <h1>New Request for Quotation for Specific Items</h1>
                <p>Hello ${vendor.name},</p>
                <p>A new Request for Quotation (RFQ) has been issued for specific items from requisition <strong>${requisition.title}</strong>.</p>
                <p><strong>Items:</strong> ${itemNames}</p>
                <p><strong>New Submission Deadline:</strong> ${format(new Date(newDeadline), 'PPpp')}</p>
                <p>Please log in to the vendor portal to view the full details and submit your quotation.</p>
                <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002'}/vendor/dashboard">Go to Vendor Portal</a>
            `;
            await sendEmail({
                to: vendor.email,
                subject: `New RFQ for items from: ${requisition.title}`,
                html: emailHtml
            });
        }
        
        await tx.auditLog.create({
            data: {
                transactionId: requisition.transactionId,
                user: { connect: { id: actor.id } },
                action: 'RESTART_ITEM_RFQ',
                entity: 'Requisition',
                entityId: requisitionId,
                details: `Restarted RFQ for items: ${itemNames}. Sent to ${vendorsToNotify.length} vendors.`
            }
        });

        return updatedRequisition;
    });

    return NextResponse.json({ message: 'RFQ for failed items has been successfully restarted.', requisition: transactionResult });

  } catch (error) {
    console.error('Failed to restart item RFQ:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
