

'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { promoteStandbyVendor } from '@/services/award-service';
import { UserRole } from '@/lib/types';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const requisitionId = params.id;
  try {
    const body = await request.json();
    const { userId } = body;

    const user = await prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Correct Authorization Logic
    const rfqSenderSetting = await prisma.setting.findUnique({ where: { key: 'rfqSenderSetting' } });
    let isAuthorized = false;
    const userRoleName = user.role.name as UserRole;

    if (userRoleName === 'Admin') {
        isAuthorized = true;
    } else if (rfqSenderSetting?.value && typeof rfqSenderSetting.value === 'object' && 'type' in rfqSenderSetting.value) {
        const setting = rfqSenderSetting.value as { type: string, userId?: string };
        if (setting.type === 'specific') {
            isAuthorized = setting.userId === userId;
        } else { // 'all' case
            isAuthorized = userRoleName === 'Procurement_Officer';
        }
    }

    if (!isAuthorized) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const result = await prisma.$transaction(async (tx) => {
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

