"use server";

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { getActorFromToken } from '@/lib/auth';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await getActorFromToken(request);
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = params;
    const body = await request.json();
    const { roleName, pin } = body;
    if (!roleName || !pin) return NextResponse.json({ error: 'roleName and pin are required' }, { status: 400 });

    const requisition = await prisma.purchaseRequisition.findUnique({ where: { id } });
    if (!requisition) return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });

    // Ensure actor has the role they claim
    const actorRoles = (actor.roles || []).map((r: any) => (typeof r === 'string' ? r : r.name));
    if (!actorRoles.includes(roleName) && !actorRoles.includes('Admin')) {
      return NextResponse.json({ error: 'You do not have the required role to verify this pin' }, { status: 403 });
    }

    const pinRecord = await prisma.pin.findFirst({ where: { requisitionId: id, roleName, used: false, expiresAt: { gt: new Date() } }, orderBy: { generatedAt: 'desc' } });
    if (!pinRecord) return NextResponse.json({ error: 'No active pin found for this role' }, { status: 404 });

    const matches = await bcrypt.compare(pin, pinRecord.pinHash);
    if (!matches) return NextResponse.json({ error: 'Invalid pin' }, { status: 401 });

    // Check if the actor has already verified this requisition
    const alreadyVerified = await prisma.pin.findFirst({
      where: {
        requisitionId: id,
        roleName,
        used: true,
        usedById: actor.id,
      },
    });

    if (alreadyVerified) {
      return NextResponse.json({ error: 'You have already verified this requisition' }, { status: 403 });
    }

    await prisma.pin.update({ where: { id: pinRecord.id }, data: { used: true, usedById: actor.id, usedAt: new Date() } });

    await prisma.auditLog.create({
      data: {
        transactionId: requisition.transactionId,
        user: { connect: { id: actor.id } },
        timestamp: new Date(),
        action: 'VERIFY_PIN',
        entity: 'Requisition',
        entityId: id,
        details: `Pin verified for role ${roleName} by ${actor.name}`,
      }
    });

    // Check if configured threshold met (default to director roles count)
    const DIRECTOR_ROLES = ['Finance_Director', 'Facility_Director', 'Director_Supply_Chain_and_Property_Management'];
    const threshold = Number((requisition.rfqSettings || {}).unsealThreshold || DIRECTOR_ROLES.length);
    const verifiedCount = await prisma.pin.count({ where: { requisitionId: id, roleName: { in: DIRECTOR_ROLES }, used: true } });

    if (verifiedCount >= threshold) {
      // Unmask the requisition
      await prisma.purchaseRequisition.update({ where: { id }, data: { rfqSettings: { ...(requisition.rfqSettings || {}), masked: false } } });
      await prisma.auditLog.create({ data: { transactionId: requisition.transactionId, user: { connect: { id: actor.id } }, timestamp: new Date(), action: 'UNMASK_RFQ', entity: 'Requisition', entityId: id, details: 'All directors verified; vendor cards unmasked.' } });
      return NextResponse.json({ ok: true, unmasked: true });
    }
    return NextResponse.json({ ok: true, unmasked: false });
  } catch (error) {
    console.error('Failed to verify pin:', error);
    return NextResponse.json({ error: 'Failed to verify pin' }, { status: 500 });
  }
}
