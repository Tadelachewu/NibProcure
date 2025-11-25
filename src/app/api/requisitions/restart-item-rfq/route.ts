
'use server';

import { NextResponse } from 'next/server';
import { Prisma, PrismaClient } from '@prisma/client';
import { User, UserRole, PerItemAwardDetail } from '@/lib/types';
import { sendEmail } from '@/services/email-service';
import { format } from 'date-fns';

const prisma = new PrismaClient();

export async function POST(
  request: Request
) {
  try {
    const body = await request.json();
    const { originalRequisitionId, itemIds, vendorIds, newDeadline, actorUserId } = body;

    const actor = await prisma.user.findUnique({ where: { id: actorUserId }, include: { roles: true } });
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized: User not found' }, { status: 403 });
    }
    
    // --- Authorization Check ---
    const userRoles = (actor.roles as any[]).map(r => r.name);
    const isAuthorized = userRoles.includes('Procurement_Officer') || userRoles.includes('Admin');
    if (!isAuthorized) {
        return NextResponse.json({ error: 'Unauthorized to perform this action.' }, { status: 403 });
    }

    if (!originalRequisitionId || !itemIds || itemIds.length === 0 || !vendorIds || vendorIds.length === 0 || !newDeadline) {
      return NextResponse.json({ error: 'Missing required parameters: originalRequisitionId, itemIds, vendorIds, and newDeadline.' }, { status: 400 });
    }

    const originalRequisition = await prisma.purchaseRequisition.findUnique({
      where: { id: originalRequisitionId },
      include: { items: { where: { id: { in: itemIds } } } }
    });

    if (!originalRequisition) {
      return NextResponse.json({ error: 'Original requisition not found.' }, { status: 404 });
    }

    // --- Start of Transaction ---
    const { newRequisition, vendorsToNotify } = await prisma.$transaction(async (tx) => {
        const totalValue = originalRequisition.items.reduce((acc, item) => acc + (item.unitPrice * item.quantity), 0);

        const newReq = await tx.purchaseRequisition.create({
            data: {
                title: `Restart for Items from ${originalRequisition.id}`,
                justification: `This is a re-tender process for failed items from requisition ${originalRequisition.title}. Original Justification: ${originalRequisition.justification}`,
                requester: { connect: { id: originalRequisition.requesterId } },
                department: { connect: { id: originalRequisition.departmentId } },
                status: 'Accepting_Quotes',
                urgency: 'High',
                totalPrice: totalValue,
                deadline: new Date(newDeadline),
                allowedVendorIds: vendorIds,
                parent: { 
                    connect: {
                        id: originalRequisition.id 
                    }
                },
                items: {
                    create: originalRequisition.items.map(item => ({
                        name: item.name,
                        description: item.description,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                    }))
                }
            },
        });
        
        // Update the new requisition to have its own transactionId
        const finalNewReq = await tx.purchaseRequisition.update({
            where: { id: newReq.id },
            data: { transactionId: newReq.id }
        });

        // Mark items on the original requisition as "Restarted"
        for (const itemId of itemIds) {
            const originalItem = await tx.requisitionItem.findUnique({ where: { id: itemId }});
            if (originalItem && originalItem.perItemAwardDetails) {
                const updatedDetails = (originalItem.perItemAwardDetails as PerItemAwardDetail[]).map(d => ({ ...d, status: 'Restarted' as const }));
                await tx.requisitionItem.update({
                    where: { id: itemId },
                    data: { perItemAwardDetails: updatedDetails }
                });
            }
        }

        await tx.auditLog.create({
            data: {
                transactionId: originalRequisition.transactionId,
                user: { connect: { id: actor.id } },
                action: 'RESTART_ITEM_RFQ',
                entity: 'Requisition',
                entityId: originalRequisition.id,
                details: `Restarted RFQ for ${originalRequisition.items.length} failed items. New requisition created: ${finalNewReq.id}.`
            }
        });

        await tx.auditLog.create({
            data: {
                transactionId: finalNewReq.id, // Use the new transaction ID
                user: { connect: { id: actor.id } },
                action: 'CREATE_REQUISITION',
                entity: 'Requisition',
                entityId: finalNewReq.id,
                details: `Requisition created from a restart of failed items from ${originalRequisition.id}. Sent to ${vendorIds.length} vendors.`
            }
        });

        const vendorsToNotify = await tx.vendor.findMany({
            where: { id: { in: vendorIds } }
        });
        
        return { newRequisition: finalNewReq, vendorsToNotify };
    });
    // --- End of Transaction ---

    // Send notifications after the transaction is successful
    for (const vendor of vendorsToNotify) {
        const emailHtml = `
            <h1>New Request for Quotation for Specific Items</h1>
            <p>Hello ${vendor.name},</p>
            <p>A new Request for Quotation (RFQ) has been issued for specific items from requisition <strong>${originalRequisition.title}</strong>.</p>
            <p><strong>New Requisition ID:</strong> ${newRequisition.id}</p>
            <p><strong>Items:</strong> ${originalRequisition.items.map(i => i.name).join(', ')}</p>
            <p><strong>New Submission Deadline:</strong> ${format(new Date(newDeadline), 'PPpp')}</p>
            <p>Please log in to the vendor portal to view the full details and submit your quotation.</p>
            <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002'}/vendor/dashboard">Go to Vendor Portal</a>
        `;
        
        sendEmail({
            to: vendor.email,
            subject: `New RFQ for items from: ${originalRequisition.title}`,
            html: emailHtml
        }).catch(console.error);
    }

    return NextResponse.json({ message: 'RFQ for failed items has been successfully restarted.', newRequisitionId: newRequisition.id });

  } catch (error) {
    console.error('Failed to restart item RFQ:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
