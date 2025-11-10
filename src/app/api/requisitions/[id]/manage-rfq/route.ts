
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { User, UserRole } from '@/lib/types';


type RFQAction = 'update' | 'cancel' | 'restart';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const requisitionId = params.id;
    const body = await request.json();
    const { userId, action, reason, newDeadline } = body as {
      userId: string;
      action: RFQAction;
      reason: string;
      newDeadline?: string;
    };

    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { role: true }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Correct Authorization Logic
    const rfqSenderSetting = await prisma.setting.findUnique({ where: { key: 'rfqSenderSetting' } });
    let isAuthorized = false;
    const userRoleName = user.role.name as UserRole;

    if (rfqSenderSetting?.value?.type === 'specific') {
        isAuthorized = rfqSenderSetting.value.userId === userId;
    } else { // 'all' case
        isAuthorized = userRoleName === 'Procurement_Officer' || userRoleName === 'Admin';
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized to manage this RFQ based on system settings.' }, { status: 403 });
    }


    const requisition = await prisma.purchaseRequisition.findUnique({ where: { id: requisitionId }});
    if (!requisition) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
    }

    const validStatusesForAction: string[] = ['Accepting_Quotes', 'Scoring_In_Progress', 'Scoring_Complete'];
    if (!validStatusesForAction.includes(requisition.status) && action !== 'restart') {
        return NextResponse.json({ error: 'This action is only available for requisitions with an active RFQ.' }, { status: 400 });
    }

    let updatedRequisition;
    let auditAction: string = '';
    let auditDetails: string = '';

    switch (action) {
      case 'update':
        if (!newDeadline) {
          return NextResponse.json({ error: 'A new deadline is required for an update.' }, { status: 400 });
        }
        updatedRequisition = await prisma.purchaseRequisition.update({
            where: { id: requisitionId },
            data: { deadline: new Date(newDeadline) }
        });
        auditAction = 'UPDATE_RFQ_DEADLINE';
        auditDetails = `Updated RFQ deadline for requisition ${requisitionId} to ${new Date(newDeadline).toLocaleDateString()}. Reason: ${reason}`;
        break;
      case 'cancel':
      case 'restart':
        await prisma.quotation.deleteMany({ where: { requisitionId }});
        updatedRequisition = await prisma.purchaseRequisition.update({
            where: { id: requisitionId },
            data: { status: 'PreApproved', deadline: null }
        });
        auditAction = action === 'cancel' ? 'CANCEL_RFQ' : 'RESTART_RFQ';
        auditDetails = `${action === 'cancel' ? 'Cancelled' : 'Restarted'} RFQ for requisition ${requisitionId}. Reason: ${reason}`;
        break;
      default:
        return NextResponse.json({ error: 'Invalid action specified.' }, { status: 400 });
    }

    await prisma.auditLog.create({
        data: {
            transactionId: requisition.transactionId,
            timestamp: new Date(),
            user: { connect: { id: user.id } },
            action: auditAction,
            entity: 'Requisition',
            entityId: requisitionId,
            details: auditDetails,
        }
    });

    return NextResponse.json({ message: 'RFQ successfully modified.', requisition: updatedRequisition });
  } catch (error) {
    console.error('Failed to manage RFQ:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
