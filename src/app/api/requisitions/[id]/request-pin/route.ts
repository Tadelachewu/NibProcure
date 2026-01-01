"use server";

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';
import { sendEmail } from '@/services/email-service';
import bcrypt from 'bcryptjs';

function generateNumericPin(length = 6) {
  let pin = '';
  for (let i = 0; i < length; i++) pin += Math.floor(Math.random() * 10).toString();
  return pin;
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await getActorFromToken(request);
    const { id } = params;

    // Ensure actor has a director role
    const DIRECTOR_ROLES = ['Finance_Director','Facility_Director','Director_Supply_Chain_and_Property_Management'];
    const hasDirector = (actor.roles || []).some((r: any) => DIRECTOR_ROLES.includes(typeof r === 'string' ? r : r.name));
    if (!hasDirector && !(actor.roles || []).includes('Admin')) {
      return NextResponse.json({ error: 'Only directors can request their PIN' }, { status: 403 });
    }

    const pin = generateNumericPin();
    const hash = bcrypt.hashSync(pin, 10);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const created = await prisma.pin.create({ data: { requisitionId: id, roleName: (actor.roles as any[])[0] || 'Director', pinHash: hash, recipientId: actor.id, generatedById: actor.id, expiresAt } });

    // send email with PIN when possible
    if (actor.email) {
      sendEmail({ to: actor.email, subject: `Your PIN for requisition ${id}`, html: `<p>Your PIN is <strong>${pin}</strong>. Expires ${expiresAt.toLocaleString()}</p>` }).catch(e => console.error('Failed to email pin', e));
    }

    // Allow returning plaintext PIN for testing/dev when requested
    const { searchParams } = new URL(request.url);
    const includePins = searchParams.get('includePins') === '1' || process.env.NODE_ENV !== 'production';

    // mark previous unused pins for this recipient/requisition as used (so only latest remains active)
    await prisma.pin.updateMany({ where: { requisitionId: id, recipientId: actor.id, id: { not: created.id }, used: false }, data: { used: true, usedAt: new Date() } });

    if (includePins) {
      return NextResponse.json({ success: true, expiresAt, id: created.id, plainPin: pin });
    }

    return NextResponse.json({ success: true, expiresAt, id: created.id });
  } catch (error) {
    console.error('Failed to request pin:', error);
    return NextResponse.json({ error: 'Failed to generate pin' }, { status: 500 });
  }
}
