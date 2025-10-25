
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { User } from '@/lib/types';
import { sendEmail } from '@/services/email-service';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const requisitionId = params.id;
    const body = await request.json();
    const { userId, newDeadline } = body;

    const user: User | null = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || (user.role !== 'Procurement_Officer' && user.role !== 'Admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
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
    const newVendorIds = newVendorsToNotify.map(v => v.id);
    
    if (newVendorIds.length === 0) {
        return NextResponse.json({ error: 'No new vendors available to re-open the RFQ to.' }, { status: 400 });
    }

    const updatedRequisition = await prisma.purchaseRequisition.update({
      where: { id: requisitionId },
      data: {
        deadline: new Date(newDeadline),
        allowedVendorIds: newVendorIds, // Target only the new vendors
        status: 'Accepting_Quotes',
      },
    });

    for (const vendor of newVendorsToNotify) {
        if (vendor.email) {
            const emailHtml = `
                <h1>Request for Quotation Re-Opened</h1>
                <p>Hello ${vendor.name},</p>
                <p>A Request for Quotation (RFQ) you were previously invited to has been re-opened for new submissions.</p>
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
        user: { connect: { id: userId } },
        action: 'REOPEN_RFQ',
        entity: 'Requisition',
        entityId: requisitionId,
        details: `RFQ re-opened due to unmet quorum. New deadline: ${format(new Date(newDeadline), 'PPp')}. Notified ${newVendorIds.length} new vendors.`,
      },
    });

    return NextResponse.json(updatedRequisition);
  } catch (error) {
    console.error('Failed to re-open RFQ:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
