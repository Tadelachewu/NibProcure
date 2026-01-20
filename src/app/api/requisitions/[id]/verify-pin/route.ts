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

    // determine configured threshold and current verified count for directors
    const DIRECTOR_ROLES = ['Finance_Director','Facility_Director','Director_Supply_Chain_and_Property_Management'];
    const DEPT_HEAD_ROLE = 'Department_Head';

    const threshold = Number(currentSettings?.unsealThreshold ?? DIRECTOR_ROLES.length);

    // Count unique verified director personnel, not number of used pins.
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

    // Department head (requester) verification status: check rfqSettings or used pins for DEPT_HEAD_ROLE
    const deptHeadVerifiedInSettings = currentSettings?.departmentHeadVerified === true;
    const deptHeadVerifiedPins = await prisma.pin.findFirst({ where: { requisitionId: id, roleName: DEPT_HEAD_ROLE, used: true } });
    const departmentHeadVerified = deptHeadVerifiedInSettings || !!deptHeadVerifiedPins;
    const actorIsDeptHead = actor.id === requisition.requesterId;

    // If this is a preview (confirmOnly), do not mark the PIN used; just indicate outcome
    if (confirmOnly) {
      const actorIsDirectorPreview = DIRECTOR_ROLES.includes(roleName);
      const wouldBeDirectorVerified = actorAlreadyVerified ? verifiedDistinctCount : (verifiedDistinctCount + (actorIsDirectorPreview ? 1 : 0));
      const deptVerifiedAfter = departmentHeadVerified || actorIsDeptHead || roleName === DEPT_HEAD_ROLE;
      const wouldUnmask = alreadyVerified ? true : (wouldBeDirectorVerified >= threshold && deptVerifiedAfter);
      const remainingAfter = alreadyVerified ? 0 : Math.max(0, threshold - wouldBeDirectorVerified);
      return NextResponse.json({ wouldUnmask, remaining: remainingAfter, threshold, verifiedCount: verifiedDistinctCount, actorAlreadyVerified, alreadyVerified, departmentHeadVerified: deptVerifiedAfter });
    }

    // If actor already verified before, don't consume more pins.
    if (actorAlreadyVerified) {
      const remaining = alreadyVerified ? 0 : Math.max(0, threshold - verifiedDistinctCount);
      const deptVerifiedAfter = departmentHeadVerified || actorIsDeptHead;
      const unmaskedNow = alreadyVerified ? true : (verifiedDistinctCount >= threshold && deptVerifiedAfter);
      return NextResponse.json({ unmasked: unmaskedNow, remaining, threshold, verifiedCount: verifiedDistinctCount, actorAlreadyVerified: true, alreadyVerified, departmentHeadVerified: deptVerifiedAfter });
    }

    // Mark used (this is the per-person audit trail)
    await prisma.pin.update({ where: { id: pinRecord.id }, data: { used: true, usedById: actor.id, usedAt: new Date() } });

    // If the used PIN is from the department head role, record that in rfqSettings.
    if (pinRecord.roleName === DEPT_HEAD_ROLE) {
      const updated = { ...(typeof currentSettings === 'object' ? currentSettings : {}), departmentHeadVerified: true, departmentHeadVerifiedAt: new Date().toISOString() };
      await prisma.purchaseRequisition.update({ where: { id }, data: { rfqSettings: updated as any } });
    }

    // If requisition is already unmasked, we still record verification but don't touch rfqSettings.
    if (alreadyVerified) {
      return NextResponse.json({ unmasked: true, remaining: 0, threshold, verifiedCount: verifiedDistinctCount + 1, actorAlreadyVerified: false, alreadyVerified: true });
    }

    let unmasked = false;
    const actorIsDirector = DIRECTOR_ROLES.includes(pinRecord.roleName);
    const afterDirectorVerifiedCount = verifiedDistinctCount + (actorIsDirector ? 1 : 0);

    // Department head verified after this operation?
    const deptVerifiedAfter = departmentHeadVerified || pinRecord.roleName === DEPT_HEAD_ROLE || actorIsDeptHead;

    if (afterDirectorVerifiedCount >= threshold && deptVerifiedAfter) {
      const updated = {
        ...(typeof currentSettings === 'object' ? currentSettings : {}),
        masked: false,
        directorPresenceVerified: true,
        directorPresenceVerifiedAt: new Date().toISOString(),
        departmentHeadVerified: deptVerifiedAfter,
      };
      await prisma.purchaseRequisition.update({ where: { id }, data: { rfqSettings: updated as any } });
      unmasked = true;
    }

    const remaining = Math.max(0, threshold - afterDirectorVerifiedCount);
    return NextResponse.json({ unmasked, remaining, threshold, verifiedCount: afterDirectorVerifiedCount, actorAlreadyVerified: false, alreadyVerified: false, departmentHeadVerified: deptVerifiedAfter });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Failed to verify pin:', error);
    return NextResponse.json({ error: 'Failed to verify pin' }, { status: 500 });
  }
}
