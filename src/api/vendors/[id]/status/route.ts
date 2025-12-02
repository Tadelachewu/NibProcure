
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/services/email-service';
import { getActorFromToken } from '@/lib/auth';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  console.log(`PATCH /api/vendors/${params.id}/status`);
  try {
    const actor = await getActorFromToken(request);
    if (!actor || !(actor.roles as string[]).includes('Procurement_Officer')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const vendorId = params.id;
    const body = await request.json();
    console.log('Request body:', body);
    const { status, rejectionReason } = body;

    if (!['Verified', 'Rejected'].includes(status)) {
      console.error('Invalid status provided:', status);
      return NextResponse.json({ error: 'Invalid status provided.' }, { status: 400 });
    }
    
    const vendorToUpdate = await prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendorToUpdate) {
        console.error('Vendor not found for ID:', vendorId);
        return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
    }
    console.log('Found vendor to update:', vendorToUpdate);

    const oldStatus = vendorToUpdate.kycStatus;
    const updatedVendor = await prisma.vendor.update({
        where: { id: vendorId },
        data: {
            kycStatus: status.replace(/ /g, '_') as any,
            rejectionReason: status === 'Rejected' ? rejectionReason : null,
        }
    });
    
    // --- NOTIFICATION LOGIC ---
    if (status === 'Verified') {
        await sendEmail({
            to: vendorToUpdate.email,
            subject: 'Your Vendor Application has been Approved!',
            html: `<h1>Congratulations, ${vendorToUpdate.name}!</h1>
                   <p>Your account with Nib InternationalBank Procurement has been successfully verified.</p>
                   <p>You can now log in to the vendor portal to view open requisitions and submit quotations.</p>
                   <a href="${process.env.NEXT_PUBLIC_BASE_URL}/login">Login to Vendor Portal</a>`
        });
    } else if (status === 'Rejected') {
        await sendEmail({
            to: vendorToUpdate.email,
            subject: 'Action Required: Your Vendor Application',
            html: `<h1>Action Required for Your Vendor Application</h1>
                   <p>Hello ${vendorToUpdate.name},</p>
                   <p>After reviewing your application, we require some corrections. Please see the reason below:</p>
                   <p><strong>Reason:</strong> ${rejectionReason}</p>
                   <p>Please log in to the vendor portal to update your information and resubmit your documents.</p>
                   <a href="${process.env.NEXT_PUBLIC_BASE_URL}/vendor/profile">Update Your Profile</a>`
        });
    }
    
    await prisma.auditLog.create({
        data: {
            user: { connect: { id: actor.id } },
            timestamp: new Date(),
            action: 'VERIFY_VENDOR',
            entity: 'Vendor',
            entityId: vendorId,
            details: `Updated vendor KYC status from "${oldStatus}" to "${status}". ${rejectionReason ? `Reason: ${rejectionReason}` : ''}`.trim(),
        }
    });
    console.log('Added audit log:');


    return NextResponse.json(updatedVendor);
  } catch (error) {
    console.error('Failed to update vendor status:', error);
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
