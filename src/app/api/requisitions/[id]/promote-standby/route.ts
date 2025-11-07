
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { promoteStandbyVendor } from '@/services/award-service';
import { User } from '@/lib/types';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const requisitionId = params.id;
  try {
    const body = await request.json();
    const { userId } = body;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || (user.role !== 'Procurement_Officer' && user.role !== 'Admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const result = await prisma.$transaction(async (tx) => {
      return await promoteStandbyVendor(tx, requisitionId, user as User);
    });

    return NextResponse.json(result);

  } catch (error) {
    console.error(`Failed to promote standby for requisition ${requisitionId}:`, error);
    if (error instanceof Error) {
      return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
