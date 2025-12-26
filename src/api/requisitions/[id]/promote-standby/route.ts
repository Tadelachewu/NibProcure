
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { promoteStandbyVendor } from '@/services/award-service';
import { UserRole } from '@/lib/types';
import { getActorFromToken } from '@/lib/auth';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const actor = await getActorFromToken(request);
    if (!actor) {
        return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
    }

  const requisitionId = params.id;
  try {
    const rfqSenderSetting = await prisma.setting.findUnique({ where: { key: 'rfqSenderSetting' } });
    let isAuthorized = false;
    const userRoles = actor.roles as UserRole[];

    if (userRoles.includes('Admin')) {
        isAuthorized = true;
    } else if (rfqSenderSetting?.value && typeof rfqSenderSetting.value === 'object' && 'type' in rfqSenderSetting.value) {
        const setting = rfqSenderSetting.value as { type: string, userIds?: string[] };
        if (setting.type === 'all' && userRoles.includes('Procurement_Officer')) {
            isAuthorized = true;
        } else if (setting.type === 'specific' && setting.userIds?.includes(actor.id)) {
            isAuthorized = true;
        }
    }

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
    console.error(`Failed to promote standby for requisition ${requisitionId}:`, error);
    if (error instanceof Error) {
      return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
