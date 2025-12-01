
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { UserRole } from '@/lib/types';
import { sendEmail } from '@/services/email-service';
import { format } from 'date-fns';
import { getActorFromToken } from '@/lib/auth';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const actor = await getActorFromToken(request);
    if (!actor) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const requisitionId = params.id;
    const body = await request.json();
    const { newDeadline } = body;

    // Correct Authorization Logic
    const rfqSenderSetting = await prisma.setting.findUnique({ where: { key: 'rfqSenderSetting' } });
    let isAuthorized = false;
    const userRoles = actor.roles as UserRole[];

    if (userRoles.includes('Admin')) {
        isAuthorized = true;
    } else if (rfqSenderSetting?.value && typeof rfqSenderSetting.value === 'object' && 'type' in rfqSenderSetting.value) {
        const setting = rfqSenderSetting.value as { type: string, userId?: string };
        if (setting.type === 'specific') {
            isAuthorized = setting.userId === actor.id;
        } else { // 'all' case
            isAuthorized = userRoles.includes('Procurement_Officer');
        }
    }

    if (!isAuthorized) {
        return NextResponse.json({ error: 'Unauthorized to manage this RFQ based on system settings.' }, { status: 403 });
    }

    if (!newDeadline) {
      return NextResponse.json({ error: 'A new deadline is required.' }, { status: 400 });
    }
    
    const requisition = await prisma.purchaseRequisition.findUnique({ where: { id: requisitionId }, include: { quotations: true }});
    if (!requisition) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
    }
    
    const existingVendorIds = new Set(requisition.quotations.map(q => q.vendorId));

    const allVerifiedVendors = await prisma.vendor.findMany({
        where: { kycStatus: 'Verified' },
        select: { id: true, name: true, email: true }
    });

    const newVendorsToNotify = allVerifiedVendors.filter(v => !existingVendorIds.has(v.id));
    
    if (newVendorsToNotify.length === 0) {
        return NextResponse.json({ error: 'No new vendors available to re-open the RFQ to.' }, { status: 400 });
    }

    // Set allowedVendorIds to [] to signify it's open to all verified vendors
    const updatedRequisition = await prisma.purchaseRequisition.update({
      where: { id: requisitionId },
      data: {
        deadline: new Date(newDeadline),
        allowedVendorIds: [],
        status: 'Accepting_Quotes',
      },
    });

    for (const vendor of newVendorsToNotify) {
        if (vendor.email) {
            const emailHtml = `
                <h1>Request for Quotation Re-Opened</h1>
                <p>Hello ${vendor.name},</p>
                <p>A Request for Quotation (RFQ) has been re-opened for new submissions.</p>
                <ul>
                    <li><strong>Requisition Title:</strong> ${requisition.title}</li>
                    <li><strong>Requisition ID:</strong> ${requisition.id}</li>
                    <li><strong>New Submission Deadline:</strong> ${new Date(newDeadline).toLocaleString()}</li>
                </ul>
                <p>Please log in to the vendor portal to view the full details and submit your quotation.</p>
                <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002'}/vendor/dashboard">Go to Vendor Portal</a>
                <p>Thank you,</p>
                <p>Nib InternationalBank Procurement</p>
            `;
            
            await sendEmail({
                to: vendor.email,
                subject: `RFQ Re-Opened: ${requisition.title}`,
                html: emailHtml
            });
        }
    }

    await prisma.auditLog.create({
      data: {
        transactionId: requisition.transactionId,
        timestamp: new Date(),
        user: { connect: { id: actor.id } },
        action: 'REOPEN_RFQ',
        entity: 'Requisition',
        entityId: requisitionId,
        details: `RFQ re-opened due to unmet quorum. New deadline: ${format(new Date(newDeadline), 'PPp')}. Notified ${newVendorsToNotify.length} new vendors.`,
      },
    });

    return NextResponse.json(updatedRequisition);
  } catch (error) {
    console.error('Failed to re-open RFQ:');
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
