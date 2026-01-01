"use server";

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { getActorFromToken } from '@/lib/auth';
import { sendEmail } from '@/services/email-service';

const DIRECTOR_ROLES = ['Finance_Director', 'Facility_Director', 'Director_Supply_Chain_and_Property_Management'];

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await getActorFromToken(request);
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const actorRoles = (actor.roles || []).map((r: any) => (typeof r === 'string' ? r : r.name));
    const matching = actorRoles.find(r => DIRECTOR_ROLES.includes(r));
    if (!matching) return NextResponse.json({ error: 'Only directors can request their PIN' }, { status: 403 });

    const { id } = params;
    const requisition = await prisma.purchaseRequisition.findUnique({ where: { id } });
    if (!requisition) return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });

    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    const hash = await bcrypt.hash(pin, 10);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60);

    await prisma.pin.create({ data: {
      requisition: { connect: { id } },
      roleName: matching,
      pinHash: hash,
      generatedById: actor.id,
      recipient: { connect: { id: actor.id } },
      expiresAt,
    }});

    // Email actor their pin if they have email
    if (actor.email) {
      try {
        await sendEmail({ to: actor.email, subject: `[NibProcure] Your verification PIN for ${requisition.id}`, html: `<p>Hello ${actor.name},</p><p>Your verification PIN for requisition <strong>${requisition.title}</strong> (${requisition.id}) is <strong>${pin}</strong>. It expires at ${expiresAt.toLocaleString()}.</p>` });
      } catch (e) {
        console.warn('Failed to send pin email', e);
      }
    }

    await prisma.auditLog.create({ data: { transactionId: requisition.transactionId, user: { connect: { id: actor.id } }, timestamp: new Date(), action: 'REQUEST_PIN', entity: 'Requisition', entityId: id, details: `Pin requested/generated for role ${matching} by ${actor.name}` } });

    return NextResponse.json({ ok: true, pin: pin, expiresAt });
  } catch (error) {
    console.error('Failed to request pin:', error);
    return NextResponse.json({ error: 'Failed to request pin' }, { status: 500 });
  }
}
