
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { User } from '@/lib/types';
import { format } from 'date-fns';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const requisitionId = params.id;
    const body = await request.json();
    const { actorUserId, memberId, newDeadline } = body;

    const actor: User | null = await prisma.user.findUnique({ where: { id: actorUserId } });
    if (!actor) {
      return NextResponse.json({ error: 'Action performer not found' }, { status: 404 });
    }
    
    // Authorization check (e.g., only procurement officers or admins)
    if (actor.role !== 'Procurement_Officer' && actor.role !== 'Admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    if (!memberId || !newDeadline) {
      return NextResponse.json({ error: 'Member ID and new deadline are required.' }, { status: 400 });
    }
    
    const assignment = await prisma.committeeAssignment.findUnique({
        where: { userId_requisitionId: { userId: memberId, requisitionId } }
    });

    if (!assignment) {
       return NextResponse.json({ error: 'Committee assignment not found for this user and requisition.' }, { status: 404 });
    }

    const updatedAssignment = await prisma.committeeAssignment.update({
        where: { userId_requisitionId: { userId: memberId, requisitionId } },
        data: {
            individualDeadline: new Date(newDeadline)
        }
    });

    const memberUser = await prisma.user.findUnique({ where: { id: memberId } });

    await prisma.auditLog.create({
        data: {
            transactionId: requisitionId,
            user: { connect: { id: actorUserId } },
            action: 'EXTEND_MEMBER_DEADLINE',
            entity: 'Requisition',
            entityId: requisitionId,
            timestamp: new Date(),
            details: `Extended scoring deadline for committee member ${memberUser?.name || 'Unknown'} to ${format(new Date(newDeadline), 'PPp')}.`,
        }
    });


    return NextResponse.json(updatedAssignment);

  } catch (error) {
    console.error('Failed to extend member scoring deadline:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
