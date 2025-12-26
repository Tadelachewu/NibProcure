
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { UserRole } from '@/lib/types';
import { sendEmail } from '@/services/email-service';
import { getActorFromToken } from '@/lib/auth';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const actor = await getActorFromToken(request);

    const { id } = params;
    const body = await request.json();
    const { vendorIds, deadline, cpoAmount, rfqSettings } = body;

    const requisition = await prisma.purchaseRequisition.findUnique({ where: { id }});
    if (!requisition) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
    }
    
    const isAuthorized = actor.effectiveRoles.includes('Procurement_Officer') || actor.effectiveRoles.includes('Admin');

    if (!isAuthorized) {
        return NextResponse.json({ error: 'Unauthorized: You do not have permission to send RFQs.' }, { status: 403 });
    }

    const rfqQuorumSetting = await prisma.setting.findUnique({ where: { key: 'rfqQuorum' } });
    const rfqQuorum = rfqQuorumSetting ? Number(rfqQuorumSetting.value) : 3;

    let finalVendorIds = vendorIds;

    if (Array.isArray(vendorIds) && vendorIds.length === 0) {
        const verifiedVendors = await prisma.vendor.findMany({
            where: { kycStatus: 'Verified' },
            select: { id: true }
        });
        
        if (verifiedVendors.length < rfqQuorum) {
            return NextResponse.json({ error: `Quorum not met. There are only ${verifiedVendors.length} verified vendors available, but the minimum required is ${rfqQuorum}.` }, { status: 400 });
        }
        
        finalVendorIds = verifiedVendors.map(v => v.id);
    } else if (Array.isArray(vendorIds) && vendorIds.length > 0) {
        if (vendorIds.length < rfqQuorum) {
             return NextResponse.json({ error: `Quorum not met. At least ${rfqQuorum} vendors must be selected.` }, { status: 400 });
        }
    }
    
    const validInitialStatuses = ['PreApproved', 'Accepting_Quotes'];
    if (!validInitialStatuses.includes(requisition.status)) {
        return NextResponse.json({ error: `Cannot start RFQ for a requisition that is not in a valid state.` }, { status: 400 });
    }
    
    const updatedRequisition = await prisma.purchaseRequisition.update({
        where: { id },
        data: {
            status: 'Accepting_Quotes',
            allowedVendorIds: finalVendorIds,
            deadline: deadline ? new Date(deadline) : undefined,
            cpoAmount: cpoAmount,
            rfqSettings: rfqSettings || {},
        }
    });

    await prisma.auditLog.create({
        data: {
            transactionId: updatedRequisition.transactionId,
            user: { connect: { id: actor.id } },
            timestamp: new Date(),
            action: 'SEND_RFQ',
            entity: 'Requisition',
            entityId: id,
            details: `Sent RFQ to ${finalVendorIds.length === 0 ? 'all verified vendors' : `${finalVendorIds.length} selected vendors`}.`,
        }
    });

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
    if (error instanceof Error && error.message.includes('Unauthorized')) {
        return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
