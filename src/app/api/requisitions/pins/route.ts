"use server";

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);
    const skip = (page - 1) * pageSize;

    let actor: any = null;
    try {
      actor = await getActorFromToken(request);
    } catch (e) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Admins can see all pins; others only see pins issued to them
    const isAdmin = (actor.roles || []).includes('Admin');

    // Only return active pins: not used and not expired
    const now = new Date();
    const activeWhere: any = {
      used: false,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: now } }
      ]
    };
    if (!isAdmin) activeWhere.recipientId = actor.id;

    const [pinsRaw, total] = await prisma.$transaction([
      prisma.pin.findMany({
        where: activeWhere,
        include: { requisition: { select: { id: true, title: true } }, recipient: { select: { id: true, name: true, email: true } } },
        skip,
        take: pageSize,
        orderBy: { generatedAt: 'desc' }
      }),
      prisma.pin.count({ where: activeWhere })
    ]);

    const pins = pinsRaw.map(p => ({
      id: p.id,
      requisition: p.requisition,
      roleName: p.roleName,
      generatedAt: p.generatedAt,
      expiresAt: p.expiresAt,
      used: p.used,
      usedById: p.usedById,
      generatedById: p.generatedById,
      recipient: p.recipient ? { id: p.recipient.id, name: p.recipient.name, email: p.recipient.email } : undefined
    }));

    return NextResponse.json({ pins, total, page });
  } catch (error) {
    console.error('Failed to fetch pins:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to fetch pins' }, { status: 500 });
  }
}
