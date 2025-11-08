
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { promoteStandbyVendor } from '@/services/award-service';

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
      // The logic here should not just be about one vendor, but the whole req.
      // The logic is moved to the award-service to be more robust.
      return await promoteStandbyVendor(tx, requisitionId, user);
    }, {
      maxWait: 15000,
      timeout: 30000,
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
