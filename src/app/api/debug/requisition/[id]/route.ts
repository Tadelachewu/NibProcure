"use server";

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await getActorFromToken(request);
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    const rfqSenderSetting = await prisma.setting.findUnique({ where: { key: 'rfqSenderSetting' } });
    const requisition = await prisma.purchaseRequisition.findUnique({ where: { id }, select: { id: true, assignedRfqSenderIds: true, status: true, requesterId: true } });

    return NextResponse.json({ rfqSenderSetting: rfqSenderSetting?.value ?? null, requisition }, { status: 200 });
  } catch (e) {
    console.error('Debug endpoint error:', e);
    return NextResponse.json({ error: 'Debug endpoint failed', details: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
