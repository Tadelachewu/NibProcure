
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleAwardRejection } from '@/services/award-service';
import { UserRole } from '@/lib/types';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const requisitionId = params.id;
  try {
    const body = await request.json();
    const { userId } = body as { userId: string };

    const user = await prisma.user.findUnique({ where: { id: userId }, include: { roles: true } });
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const rfqSenderSetting = await prisma.setting.findUnique({ where: { key: 'rfqSenderSetting' } });
    let isAuthorized = false;
    const userRoles = (user.roles as any[]).map(r => r.name);

    if (userRoles.includes('Admin')) {
        isAuthorized = true;
    } else if (rfqSenderSetting?.value && typeof rfqSenderSetting.value === 'object' && 'type' in rfqSenderSetting.value) {
        const setting = rfqSenderSetting.value as { type: string, userId?: string };
        if (setting.type === 'specific') {
            isAuthorized = setting.userId === userId;
        } else {
            isAuthorized = userRoles.includes('Procurement_Officer');
        }
    }

    if (!isAuthorized) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const requisition = await tx.purchaseRequisition.findUnique({
          where: { id: requisitionId },
          include: { quotations: { where: { status: 'Declined' } } }
      });

      if (!requisition) {
          throw new Error('Requisition not found or not in a state to promote standby.');
      }
      
      const lastDeclinedQuote = requisition.quotations.sort((a,b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];

      if (!lastDeclinedQuote) {
          throw new Error("Could not find a declined quote to trigger a promotion. The requisition may be in an inconsistent state.");
      }

      // The logic for promotion is now part of the rejection handler
      return await handleAwardRejection(tx, lastDeclinedQuote, requisition, user);
    }, {
      maxWait: 15000,
      timeout: 30000,
    });

    return NextResponse.json(result);

  } catch (error) {
    console.error(`Failed to promote standby for requisition ${requisitionId}:`, error);
    if (error instanceof Error) {
      if ((error as any).code === 'P2025') {
        return NextResponse.json({ error: 'Record to update not found. The requisition state may have changed.', details: (error as any).meta }, { status: 404 });
      }
      return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
