"use server";

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';
import { isAdmin, isActorAuthorizedForRequisition } from '@/lib/auth';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await getActorFromToken(request);
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = params;

    const admin = isAdmin(actor);
    const authorizedRfqSender = admin ? true : await isActorAuthorizedForRequisition(actor as any, id);

    // RFQ senders need visibility into who has verified (status only).
    // Pin recipients should only see their own pin records.
    const where = authorizedRfqSender
      ? { requisitionId: id, roleName: { in: ['Finance_Director', 'Facility_Director', 'Director_Supply_Chain_and_Property_Management'] } }
      : { requisitionId: id, recipientId: actor.id };

    const pinsRaw = await prisma.pin.findMany({
      where,
      orderBy: { generatedAt: 'desc' },
      include: {
        recipient: { select: { id: true, name: true, email: true } },
        requisition: { select: { id: true, title: true } },
      }
    });

    const usedByIds = Array.from(
      new Set(pinsRaw.map((p) => p.usedById).filter((id): id is string => Boolean(id)))
    );

    const usedByUsers = usedByIds.length
      ? await prisma.user.findMany({
          where: { id: { in: usedByIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const usedByById = new Map(usedByUsers.map((u) => [u.id, u]));

    // Never expose hashes or plaintext.
    const pins = pinsRaw.map((p) => ({
      id: p.id,
      requisition: p.requisition,
      roleName: p.roleName,
      generatedAt: p.generatedAt,
      expiresAt: p.expiresAt,
      used: p.used,
      usedAt: p.usedAt,
      usedById: p.usedById,
      usedBy: p.usedById ? usedByById.get(p.usedById) : undefined,
      recipient: p.recipient ? { id: p.recipient.id, name: p.recipient.name, email: p.recipient.email } : undefined,
    }));

    return NextResponse.json({ pins });
  } catch (error) {
    console.error('Failed to fetch requisition pins:', error);
    return NextResponse.json({ error: 'Failed to fetch pins' }, { status: 500 });
  }
}
