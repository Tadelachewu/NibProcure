
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';
import bcrypt from 'bcryptjs';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await getActorFromToken(request);
    const { id: requisitionId } = params;
    const { role, pin } = await request.json();

    if (!actor.roles.includes('Procurement_Officer') && !actor.roles.includes(role)) {
      return NextResponse.json({ error: 'Unauthorized: You are not part of this unsealing process.' }, { status: 403 });
    }
    
    const sealEntry = await prisma.digitalSeal.findUnique({
      where: { requisitionId_role: { requisitionId, role } },
    });

    if (!sealEntry) {
      return NextResponse.json({ error: 'No seal record found for this role and requisition.' }, { status: 404 });
    }

    if (sealEntry.isVerified) {
      return NextResponse.json({ success: true, message: 'This PIN has already been verified.' });
    }

    const isPinValid = await bcrypt.compare(pin, sealEntry.pinHash);

    if (!isPinValid) {
      return NextResponse.json({ error: 'Invalid PIN provided.' }, { status: 400 });
    }

    await prisma.digitalSeal.update({
      where: { id: sealEntry.id },
      data: { isVerified: true },
    });

    await prisma.auditLog.create({
        data: {
            user: { connect: { id: actor.id } },
            action: 'VERIFY_SEAL_PIN',
            entity: 'Requisition',
            entityId: requisitionId,
            details: `PIN for role ${role.replace(/_/g, ' ')} has been successfully verified.`,
            transactionId: requisitionId,
        }
    });

    // Check if all seals for this requisition are now verified
    const allSeals = await prisma.digitalSeal.findMany({
      where: { requisitionId },
    });

    const allVerified = allSeals.every(s => s.isVerified);

    if (allVerified && allSeals.length > 0) {
      await prisma.purchaseRequisition.update({
        where: { id: requisitionId },
        data: { status: 'PreApproved' },
      });
       await prisma.auditLog.create({
        data: {
            user: { connect: { id: actor.id } },
            action: 'UNSEAL_QUOTATIONS',
            entity: 'Requisition',
            entityId: requisitionId,
            details: `All PINs have been verified. Quotations are now unsealed and ready for committee assignment.`,
            transactionId: requisitionId,
        }
    });
      return NextResponse.json({ success: true, allVerified: true, message: 'All PINs verified. Quotations unsealed.' });
    }

    return NextResponse.json({ success: true, allVerified: false, message: 'PIN verified successfully.' });

  } catch (error) {
    console.error('[UNSEAL-API] Error:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown server error occurred.' }, { status: 500 });
  }
}
