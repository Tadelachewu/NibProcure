"use server";

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';
import { sendEmail } from '@/services/email-service';
import bcrypt from 'bcryptjs';

const DIRECTOR_ROLES = ['Finance_Director','Facility_Director','Director_Supply_Chain_and_Property_Management'];

function generateNumericPin(length = 6) {
  let pin = '';
  for (let i = 0; i < length; i++) pin += Math.floor(Math.random() * 10).toString();
  return pin;
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await getActorFromToken(request);
    const userRoles = (actor.roles || []) as string[];
    if (!userRoles.includes('Procurement_Officer') && !userRoles.includes('Admin')) {
      return NextResponse.json({ error: 'Unauthorized to generate pins' }, { status: 403 });
    }

    const { id } = params;

    const requisition = await prisma.purchaseRequisition.findUnique({ where: { id } });
    if (!requisition) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
    }

    let currentSettings: any = requisition.rfqSettings || {};
    if (typeof currentSettings === 'string') {
      try { currentSettings = JSON.parse(currentSettings); } catch { currentSettings = {}; }
    }

    const directorPresenceVerified = currentSettings?.directorPresenceVerified === true || currentSettings?.masked === false;
    if (directorPresenceVerified) {
      return NextResponse.json({ error: 'Director presence already verified for this requisition.' }, { status: 409 });
    }

    // If some personnel already verified, do not generate/email new PINs for them.
    // Verification is tracked by USED director pins with a distinct usedById.
    const verifiedPins = await prisma.pin.findMany({
      where: {
        requisitionId: id,
        roleName: { in: DIRECTOR_ROLES },
        used: true,
        OR: [{ usedById: { not: null } }, { recipientId: { not: null } }],
      },
      select: { usedById: true, recipientId: true },
    });
    const verifiedUserIds = new Set(
      verifiedPins
        .map((p) => p.usedById || p.recipientId)
        .filter(Boolean)
        .map(String)
    );

    // Delete only UNUSED pins for these director roles for this requisition.
    // Keep used pins as the permanent verification record.
    await prisma.pin.deleteMany({ where: { requisitionId: id, roleName: { in: DIRECTOR_ROLES }, used: false } });

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    // For each director role, create a unique PIN per user and email only that user.
    // Never return plaintext PINs from this endpoint.
    const createdPins: Array<{ id: string; roleName: string; recipientId: string; expiresAt: Date }> = [];
    const skippedVerifiedRecipientIds = new Set<string>();

    for (const roleName of DIRECTOR_ROLES) {
      const users = await prisma.user.findMany({ where: { roles: { some: { name: roleName } } } });
      for (const u of users) {
        if (verifiedUserIds.has(u.id)) {
          skippedVerifiedRecipientIds.add(u.id);
          continue;
        }
        const pin = generateNumericPin();
        const hash = bcrypt.hashSync(pin, 10);
        const created = await prisma.pin.create({ data: { requisitionId: id, roleName, pinHash: hash, recipientId: u.id, generatedById: actor.id, expiresAt } });
        if (u.email) {
          sendEmail({
            to: u.email,
            subject: `Verification PIN for requisition ${id}`,
            html: `<p>Your verification PIN for requisition <strong>${id}</strong> is <strong>${pin}</strong>. It expires at ${expiresAt.toLocaleString()}.</p>`
          }).catch(e => console.error('Failed to send PIN email', e));
        }
        createdPins.push({ id: created.id, roleName, recipientId: u.id, expiresAt });
      }
    }

    return NextResponse.json({ success: true, pins: createdPins, skippedVerifiedRecipientIds: Array.from(skippedVerifiedRecipientIds) });
  } catch (error) {
    // getActorFromToken throws Error('Unauthorized') when token is missing/invalid.
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Failed to generate pins:', error);
    return NextResponse.json({ error: 'Failed to generate pins' }, { status: 500 });
  }
}
