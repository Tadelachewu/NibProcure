

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

    const user = await prisma.user.findUnique({ where: { id: userId }, include: { roles: true } });
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Correct Authorization Logic
    const rfqSenderSetting = await prisma.setting.findUnique({ where: { key: 'rfqSenderSetting' } });
    let isAuthorized = false;
    const userRoles = user.roles.map(r => r.name as UserRole);

    if (userRoles.includes('Admin')) {
        isAuthorized = true;
    } else if (rfqSenderSetting?.value && typeof rfqSenderSetting.value === 'object' && 'type' in rfqSenderSetting.value) {
        const setting = rfqSenderSetting.value as { type: string, userId?: string };
        if (setting.type === 'specific') {
            isAuthorized = setting.userId === userId;
        } else { // 'all' case
            isAuthorized = userRoles.includes('Procurement_Officer');
        }
    }

    if (!isAuthorized) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // The `handleAwardRejection` logic now implicitly handles promotion, so we call that instead.
      // We find the most recently declined quote to trigger the logic.
      const lastDeclinedQuote = await tx.quotation.findFirst({
        where: {
          requisitionId,
          status: 'Declined',
        },
        orderBy: {
          updatedAt: 'desc',
        },
      });

      if (lastDeclinedQuote) {
        const requisition = await tx.purchaseRequisition.findUnique({ where: { id: requisitionId }, include: { items: true } });
        if (!requisition) throw new Error("Requisition not found during promotion.");
        
        // Find which items were associated with this declined quote
        const declinedItemIds = lastDeclinedQuote.items.map(i => i.requisitionItemId);

        // Call the rejection handler, which will now handle the promotion correctly.
        return await handleAwardRejection(tx, lastDeclinedQuote, requisition, user, declinedItemIds);
      } else {
        // As a fallback, if no 'Declined' quote is found (e.g., manual trigger), call promoteStandby directly.
        return await promoteStandbyVendor(tx, requisitionId, user);
      }
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
