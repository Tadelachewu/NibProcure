"use server";

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await getActorFromToken(request);
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = params;
    const pins = await prisma.pin.findMany({ where: { requisitionId: id }, select: { id: true, roleName: true, used: true, expiresAt: true, generatedAt: true } });

    // If actor is Admin or Procurement_Officer allow full view, otherwise only return the actor's role pin
    const actorRoles = (actor.roles || []).map((r:any) => (typeof r === 'string' ? r : r.name));
    const isAdmin = actorRoles.includes('Admin') || actorRoles.includes('Procurement_Officer');

    if (isAdmin) {
      return NextResponse.json(pins);
    }

    const filtered = pins.filter(p => actorRoles.includes(p.roleName));
    return NextResponse.json(filtered);
  } catch (error) {
    console.error('Failed to fetch pins:', error);
    return NextResponse.json({ error: 'Failed to fetch pins' }, { status: 500 });
  }
}
