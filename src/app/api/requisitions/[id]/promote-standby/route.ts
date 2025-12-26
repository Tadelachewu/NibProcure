'use server';
import 'dotenv/config';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { promoteStandbyVendor } from '@/services/award-service';
import { UserRole } from '@/lib/types';
import { getActorFromToken } from '@/lib/auth';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const actor = await getActorFromToken(request);
    const requisitionId = params.id;
    
    const userRoles = actor.roles as UserRole[];
    const isAuthorized = userRoles.includes('Admin') || userRoles.includes('Procurement_Officer');

    if (!isAuthorized) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const result = await prisma.$transaction(async (tx) => {
      return await promoteStandbyVendor(tx, requisitionId, actor);
    }, {
      maxWait: 15000,
      timeout: 30000,
    });

    return NextResponse.json(result);

  } catch (error) {
    console.error(`Failed to promote standby for requisition:`, error);
    if (error instanceof Error && error.message.includes('Unauthorized')) {
        return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
