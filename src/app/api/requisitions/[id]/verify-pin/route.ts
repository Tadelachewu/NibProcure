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

    const requisition = await prisma.purchaseRequisition.findUnique({ where: { id } });
    if (!requisition) return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });

    let currentSettings: any = requisition.rfqSettings || {};
    if (typeof currentSettings === 'string') {
      try { currentSettings = JSON.parse(currentSettings); } catch { currentSettings = {}; }
    }

    // If presence already verified/unsealed, do not require further verification.
    const alreadyVerified = currentSettings?.directorPresenceVerified === true || currentSettings?.masked === false;

    // Find an unused pin issued to THIS user for this requisition and role
    const pinRecord = await prisma.pin.findFirst({
      where: {
        requisitionId: id,
        roleName,
        recipientId: actor.id,
        used: false,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { generatedAt: 'desc' },
    });
    if (!pinRecord) return NextResponse.json({ error: 'No valid PIN found for this role' }, { status: 404 });

    const match = bcrypt.compareSync(pin, pinRecord.pinHash);
    if (!match) return NextResponse.json({ error: 'Invalid PIN' }, { status: 400 });

    // determine configured threshold and current verified count
    const DIRECTOR_ROLES = ['Finance_Director','Facility_Director','Director_Supply_Chain_and_Property_Management'];

    const threshold = Number(currentSettings?.unsealThreshold ?? DIRECTOR_ROLES.length);

    // Count unique verified personnel, not number of used pins.
    const verifiedPins = await prisma.pin.findMany({
      where: {
        requisitionId: id,
        roleName: { in: DIRECTOR_ROLES },
        used: true,
        usedById: { not: null },
      },
      select: { usedById: true },
    });
    const verifiedUserIds = new Set(verifiedPins.map(p => p.usedById).filter(Boolean));
    const verifiedDistinctCount = verifiedUserIds.size;
    const actorAlreadyVerified = !!actor?.id && verifiedUserIds.has(actor.id);

    // If this is a preview (confirmOnly), do not mark the PIN used; just indicate outcome
    if (confirmOnly) {
      const wouldBeVerified = actorAlreadyVerified ? verifiedDistinctCount : (verifiedDistinctCount + 1);
      const wouldUnmask = alreadyVerified ? true : wouldBeVerified >= threshold;
      const remainingAfter = alreadyVerified ? 0 : Math.max(0, threshold - wouldBeVerified);
      return NextResponse.json({ wouldUnmask, remaining: remainingAfter, threshold, verifiedCount: verifiedDistinctCount, actorAlreadyVerified, alreadyVerified });
    }

    // If actor already verified before, don't consume more pins.
    if (actorAlreadyVerified) {
      const remaining = alreadyVerified ? 0 : Math.max(0, threshold - verifiedDistinctCount);
      const unmaskedNow = alreadyVerified ? true : verifiedDistinctCount >= threshold;
      return NextResponse.json({ unmasked: unmaskedNow, remaining, threshold, verifiedCount: verifiedDistinctCount, actorAlreadyVerified: true, alreadyVerified });
    }

    // Mark used (this is the per-person audit trail)
    await prisma.pin.update({ where: { id: pinRecord.id }, data: { used: true, usedById: actor.id, usedAt: new Date() } });

    // If requisition is already unmasked, we still record verification but don't touch rfqSettings.
    if (alreadyVerified) {
      return NextResponse.json({ unmasked: true, remaining: 0, threshold, verifiedCount: verifiedDistinctCount + 1, actorAlreadyVerified: false, alreadyVerified: true });
    }

    let unmasked = false;
    const afterVerifiedCount = verifiedDistinctCount + 1;
    if (afterVerifiedCount >= threshold) {
      const updated = {
        ...(typeof currentSettings === 'object' ? currentSettings : {}),
        masked: false,
        directorPresenceVerified: true,
        directorPresenceVerifiedAt: new Date().toISOString(),
      };
      await prisma.purchaseRequisition.update({ where: { id }, data: { rfqSettings: updated as any } });
      unmasked = true;
    }

    const remaining = Math.max(0, threshold - afterVerifiedCount);
    return NextResponse.json({ unmasked, remaining, threshold, verifiedCount: afterVerifiedCount, actorAlreadyVerified: false, alreadyVerified: false });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Failed to verify pin:', error);
    return NextResponse.json({ error: 'Failed to verify pin' }, { status: 500 });
  }
}
