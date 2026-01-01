"use server";

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';
import bcrypt from 'bcryptjs';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await getActorFromToken(request);
    const { id } = params;
    const body = await request.json();
      const { roleName, pin, confirmOnly } = body;
      if (!roleName || !pin) return NextResponse.json({ error: 'Missing roleName or pin' }, { status: 400 });

    // Find an unused pin for this requisition and role
    const pinRecord = await prisma.pin.findFirst({ where: { requisitionId: id, roleName, used: false, expiresAt: { gt: new Date() } }, orderBy: { generatedAt: 'desc' } });
    if (!pinRecord) return NextResponse.json({ error: 'No valid PIN found for this role' }, { status: 404 });

    // Ensure the verifying user is the intended recipient
    if (pinRecord.recipientId && pinRecord.recipientId !== actor.id) {
      return NextResponse.json({ error: 'PIN not issued to this user' }, { status: 403 });
    }

    const match = bcrypt.compareSync(pin, pinRecord.pinHash);
    if (!match) return NextResponse.json({ error: 'Invalid PIN' }, { status: 400 });

    // determine configured threshold and current verified count
    const DIRECTOR_ROLES = ['Finance_Director','Facility_Director','Director_Supply_Chain_and_Property_Management'];

    const requisition = await prisma.purchaseRequisition.findUnique({ where: { id } });
    const currentSettings: any = requisition?.rfqSettings || {};
    const threshold = Number(currentSettings?.unsealThreshold || DIRECTOR_ROLES.length);

    const verifiedCount = await prisma.pin.count({ where: { requisitionId: id, roleName: { in: DIRECTOR_ROLES }, used: true } });

    // If this is a preview (confirmOnly), do not mark the PIN used; just indicate outcome
    if (confirmOnly) {
      const wouldBeVerified = verifiedCount + 1;
      const wouldUnmask = wouldBeVerified >= threshold;
      const remainingAfter = Math.max(0, threshold - wouldBeVerified);
      return NextResponse.json({ wouldUnmask, remaining: remainingAfter, threshold, verifiedCount });
    }

    // mark used
    await prisma.pin.update({ where: { id: pinRecord.id }, data: { used: true, usedById: actor.id, usedAt: new Date() } });

    let unmasked = false;
    const afterVerifiedCount = verifiedCount + 1;
    if (afterVerifiedCount >= threshold) {
      const updated = { ...(typeof currentSettings === 'object' ? currentSettings : {}), masked: false };
      await prisma.purchaseRequisition.update({ where: { id }, data: { rfqSettings: updated as any } });
      unmasked = true;
    }

    const remaining = Math.max(0, threshold - afterVerifiedCount);
    return NextResponse.json({ unmasked, remaining, threshold, verifiedCount: afterVerifiedCount });
  } catch (error) {
    console.error('Failed to verify pin:', error);
    return NextResponse.json({ error: 'Failed to verify pin' }, { status: 500 });
  }
}
