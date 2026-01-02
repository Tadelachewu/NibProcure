"use server";

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await getActorFromToken(request);
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // only procurement officer or admin can change threshold
    const roles = (actor.roles || []) as string[];
    if (!roles.includes('Procurement_Officer') && !roles.includes('Admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = params;
    const body = await request.json();
    const { threshold } = body;
    if (!threshold || typeof threshold !== 'number' || threshold < 1) return NextResponse.json({ error: 'Invalid threshold' }, { status: 400 });

    const requisition = await prisma.purchaseRequisition.findUnique({ where: { id } });
    if (!requisition) return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });

    let current: any = requisition.rfqSettings || {};
    if (typeof current === 'string') {
      try { current = JSON.parse(current); } catch { current = {}; }
    }
    const updated = { ...(typeof current === 'object' ? current : {}), unsealThreshold: threshold };

    await prisma.purchaseRequisition.update({ where: { id }, data: { rfqSettings: updated as any } });

    // If current verified count already meets threshold, unmask immediately
    const DIRECTOR_ROLES = ['Finance_Director','Facility_Director','Director_Supply_Chain_and_Property_Management'];
    const verifiedPins = await prisma.pin.findMany({
      where: { requisitionId: id, roleName: { in: DIRECTOR_ROLES }, used: true, usedById: { not: null } },
      select: { usedById: true },
    });
    const verifiedCount = new Set(verifiedPins.map(p => p.usedById).filter(Boolean)).size;
    if (verifiedCount >= threshold) {
      await prisma.purchaseRequisition.update({
        where: { id },
        data: {
          rfqSettings: {
            ...(updated as any),
            masked: false,
            directorPresenceVerified: true,
            directorPresenceVerifiedAt: new Date().toISOString(),
          },
        },
      });
    }

    return NextResponse.json({ ok: true, threshold, verifiedCount });
  } catch (error) {
    console.error('Failed to set unseal threshold:', error);
    return NextResponse.json({ error: 'Failed to set threshold' }, { status: 500 });
  }
}
