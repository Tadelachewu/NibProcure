
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
    const { id } = params;
    const body = await request.json();
    const { userId, vendorIds, deadline, cpoAmount, rfqSettings } = body;

    const requisition = await prisma.purchaseRequisition.findUnique({ where: { id }});
    if (!requisition) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
    }

    const user: User | null = await prisma.user.findUnique({where: {id: userId}});
    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    const rfqSenderSetting = await prisma.setting.findUnique({ where: { key: 'rfqSenderSetting' } });
    let isAuthorized = false;
    if (user.role === 'Admin') {
        isAuthorized = true;
    } else if (rfqSenderSetting?.value?.type === 'all' && user.role === 'Procurement_Officer') {
        isAuthorized = true;
    } else if (rfqSenderSetting?.value?.type === 'specific' && rfqSenderSetting.value.userId === userId) {
        isAuthorized = true;
    }

    if (!isAuthorized) {
        return NextResponse.json({ error: 'Unauthorized: You do not have permission to send RFQs.' }, { status: 403 });
    }

    const rfqQuorumSetting = await prisma.setting.findUnique({ where: { key: 'rfqQuorum' } });
    const rfqQuorum = rfqQuorumSetting ? Number(rfqQuorumSetting.value) : 3;

    // This is the key validation logic
    if (Array.isArray(vendorIds) && vendorIds.length > 0 && vendorIds.length < rfqQuorum) {
         return NextResponse.json({ error: `Quorum not met. At least ${rfqQuorum} vendors must be selected.` }, { status: 400 });
    }


    if (requisition.status === 'Closed' || requisition.status === 'Fulfilled') {
        return NextResponse.json({ error: `Cannot start RFQ for a requisition that is already ${requisition.status}.` }, { status: 400 });
    }
    
    let finalVendorIds = vendorIds;
    // If vendorIds is an empty array, it means "send to all".
    if (Array.isArray(vendorIds) && vendorIds.length === 0) {
        const verifiedVendors = await prisma.vendor.findMany({
            where: { kycStatus: 'Verified' },
            select: { id: true }
        });
        finalVendorIds = verifiedVendors.map(v => v.id);
    }


    const updatedRequisition = await prisma.purchaseRequisition.update({
        where: { id },
        data: {
            status: 'RFQ_In_Progress',
            allowedVendorIds: finalVendorIds,
            deadline: deadline ? new Date(deadline) : undefined,
            cpoAmount: cpoAmount,
            rfqSettings: rfqSettings || {},
        }
    });

    await prisma.auditLog.create({
        data: {
            transactionId: updatedRequisition.transactionId,
            user: { connect: { id: user.id } },
            timestamp: new Date(),
            action: 'SEND_RFQ',
            entity: 'Requisition',
            entityId: id,
            details: `Sent RFQ to ${vendorIds.length === 0 ? 'all verified vendors' : `${finalVendorIds.length} selected vendors`}.`,
        }
    });

    // --- Send Email Notifications ---
    const vendorsToNotify = await prisma.vendor.findMany({
        where: {
            id: { in: finalVendorIds }
        }
    });

    for (const vendor of vendorsToNotify) {
        if (vendor.email) {
            const emailHtml = `
                <h1>New Request for Quotation</h1>
                <p>Hello ${vendor.name},</p>
                <p>A new Request for Quotation (RFQ) has been issued that you are invited to bid on.</p>
                <ul>
                    <li><strong>Requisition Title:</strong> ${requisition.title}</li>
                    <li><strong>Requisition ID:</strong> ${requisition.id}</li>
                    <li><strong>Submission Deadline:</strong> ${deadline ? new Date(deadline).toLocaleString() : 'N/A'}</li>
                </ul>
                <p>Please log in to the vendor portal to view the full details and submit your quotation.</p>
                <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002'}/vendor/dashboard">Go to Vendor Portal</a>
                <p>Thank you,</p>
                <p>Nib InternationalBank Procurement</p>
            `;
            
            await sendEmail({
                to: vendor.email,
                subject: `New Request for Quotation: ${requisition.title}`,
                html: emailHtml
            });
        }
    }


    return NextResponse.json(updatedRequisition);

  } catch (error) {
    console.error('Failed to send RFQ:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
