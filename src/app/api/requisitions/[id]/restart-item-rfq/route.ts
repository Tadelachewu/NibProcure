
'use server';

import { NextResponse } from 'next/server';
import { Prisma, PrismaClient } from '@prisma/client';
import { PerItemAwardDetail, User, UserRole } from '@/lib/types';
import { sendEmail } from '@/services/email-service';
import { format } from 'date-fns';

const prisma = new PrismaClient();

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
    
    const rfqSenderSetting = await prisma.setting.findUnique({ where: { key: 'rfqSenderSetting' } });
    let isAuthorized = false;
    if (rfqSenderSetting && rfqSenderSetting.value && typeof rfqSenderSetting.value === 'object' && 'type' in rfqSenderSetting.value) {
        const userRoleName = (actor.role as any)?.name as UserRole;
        const setting = rfqSenderSetting.value as { type: string, userId?: string };
        if (userRoleName === 'Admin') {
            isAuthorized = true;
        } else if (setting.type === 'specific') {
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

    // Start of a new pattern: Run DB operations in a transaction, then do slow stuff after.
    const { updatedRequisition, vendorsToNotify, itemNames } = await prisma.$transaction(async (tx) => {
        // 1. Reset the award details for the specific failed items
        for (const itemId of itemIds) {
            await tx.requisitionItem.update({
                where: { id: itemId },
                data: { perItemAwardDetails: Prisma.JsonNull }
            });
        }

        // 2. Set the requisition back to an active bidding state
        const updatedRequisition = await tx.purchaseRequisition.update({
            where: { id: requisitionId },
            data: {
                status: 'Accepting_Quotes',
                deadline: new Date(newDeadline),
            }
        });
        
        // 3. Get the data needed for notifications
        const vendorsToNotify = await tx.vendor.findMany({
            where: { id: { in: vendorIds } }
        });
        
        const itemsToReTender = await tx.requisitionItem.findMany({
            where: { id: { in: itemIds } }
        });

        const itemNames = itemsToReTender.map(i => i.name).join(', ');

        // 4. Create the audit log inside the transaction
        await tx.auditLog.create({
            data: {
                transactionId: requisition.transactionId!,
                user: { connect: { id: actor.id } },
                action: 'RESTART_ITEM_RFQ',
                entity: 'Requisition',
                entityId: requisitionId,
                details: `Restarted RFQ for items: ${itemNames}. Sent to ${vendorsToNotify.length} vendors.`
            }
        });
        
        return { updatedRequisition, vendorsToNotify, itemNames };
    }, {
      maxWait: 10000,
      timeout: 15000,
    });
    
    // --- End of Transaction ---

    // 5. Send emails *after* the transaction has successfully completed
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
        // We don't await here to avoid holding up the server response. Emails can send in the background.
        sendEmail({
            to: vendor.email,
            subject: `New RFQ for items from: ${requisition.title}`,
            html: emailHtml
        }).catch(console.error); // Log email errors without crashing
    }

    return NextResponse.json({ message: 'RFQ for failed items has been successfully restarted.', requisition: updatedRequisition });

  } catch (error) {
    console.error('Failed to restart item RFQ:', error);
    if (error instanceof Error) {
        if ((error as any).code === 'P2028') {
            return NextResponse.json({ error: 'Database transaction timed out. This may happen if sending notifications takes too long. Please try again.', details: 'Transaction Timeout' }, { status: 504 });
        }
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
