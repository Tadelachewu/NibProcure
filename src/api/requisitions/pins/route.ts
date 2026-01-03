"use server";

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    let actor: any = null;
    try {
      actor = await getActorFromToken(request);
    } catch (e) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page') || '1');
    const pageSize = Number(url.searchParams.get('pageSize') || '10');

    const actorRoles = (actor.roles || []).map((r:any) => (typeof r === 'string' ? r : r.name));

    // Admins can view all pins; others only see pins matching their role
    const whereClause: any = actorRoles.includes('Admin') ? {} : { roleName: { in: actorRoles } };

    const [total, pins] = await Promise.all([
      prisma.pin.count({ where: whereClause }),
      prisma.pin.findMany({
        where: whereClause,
        include: {
          requisition: { select: { id: true, title: true } }
        },
        orderBy: { generatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      })
    ]);

    return NextResponse.json({ total, page, pageSize, pins });
  } catch (error) {
    console.error('Failed to fetch director pins:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to fetch pins' }, { status: 500 });
  }
}
