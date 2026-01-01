"use server";

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await getActorFromToken(request);
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = params;
    const isAdmin = (actor.roles || []).includes('Admin');

    const pins = await prisma.pin.findMany({
      where: isAdmin ? { requisitionId: id } : { requisitionId: id, recipientId: actor.id },
      orderBy: { generatedAt: 'desc' },
      include: { recipient: { select: { id: true, name: true, email: true } }, requisition: { select: { id: true, title: true } } }
    });
    return NextResponse.json({ pins });
  } catch (error) {
    console.error('Failed to fetch requisition pins:', error);
    return NextResponse.json({ error: 'Failed to fetch pins' }, { status: 500 });
  }
}
