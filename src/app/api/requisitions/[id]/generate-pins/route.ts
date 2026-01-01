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

    // Delete existing pins for these director roles for this requisition
    await prisma.pin.deleteMany({ where: { requisitionId: id, roleName: { in: DIRECTOR_ROLES } } });

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    // For each director role, create a unique PIN per user and email only that user
    const createdPins: Array<{ roleName: string; recipientId: string; expiresAt: Date; plainPin?: string }> = [];
    const url = new URL(request.url);
    const includePins = url.searchParams.get('includePins') === '1' || process.env.NODE_ENV === 'development';

    for (const roleName of DIRECTOR_ROLES) {
      const users = await prisma.user.findMany({ where: { roles: { some: { name: roleName } } } });
      for (const u of users) {
        const pin = generateNumericPin();
        const hash = bcrypt.hashSync(pin, 10);
        await prisma.pin.create({ data: { requisitionId: id, roleName, pinHash: hash, recipientId: u.id, generatedById: actor.id, expiresAt } });
        if (u.email) {
          sendEmail({
            to: u.email,
            subject: `Verification PIN for requisition ${id}`,
            html: `<p>Your verification PIN for requisition <strong>${id}</strong> is <strong>${pin}</strong>. It expires at ${expiresAt.toLocaleString()}.</p>`
          }).catch(e => console.error('Failed to send PIN email', e));
        }
        createdPins.push({ roleName, recipientId: u.id, expiresAt, plainPin: includePins ? pin : undefined });
      }
    }

    return NextResponse.json({ success: true, pins: createdPins });
  } catch (error) {
    console.error('Failed to generate pins:', error);
    return NextResponse.json({ error: 'Failed to generate pins' }, { status: 500 });
  }
}
