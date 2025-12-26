'use server';
import 'dotenv/config';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { UserRole } from '@/lib/types';
import { format } from 'date-fns';
import { getActorFromToken } from '@/lib/auth';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const actor = await getActorFromToken(request);
    if (!actor) {
        return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
    }

    const { id } = params;
    const body = await request.json();
    const { newDeadline } = body;

    // Authorization check
    const isAuthorized = actor.effectiveRoles.includes('Procurement_Officer') || actor.effectiveRoles.includes('Admin');

    if (!isAuthorized) {
        return NextResponse.json({ error: 'Unauthorized: You do not have permission to extend deadlines.' }, { status: 403 });
    }

    if (!newDeadline) {
        return NextResponse.json({ error: 'New deadline is required.' }, { status: 400 });
    }
    
    const requisition = await prisma.purchaseRequisition.findUnique({ where: { id }});
    if (!requisition) {
       return NextResponse.json({ error: 'Requisition not found.' }, { status: 404 });
    }

    const oldDeadline = requisition.scoringDeadline;
    const updatedRequisition = await prisma.purchaseRequisition.update({
        where: { id },
        data: {
            scoringDeadline: new Date(newDeadline)
        }
    });

    await prisma.auditLog.create({
        data: {
            transactionId: requisition.transactionId,
            user: { connect: { id: actor.id } },
            action: 'EXTEND_SCORING_DEADLINE',
            entity: 'Requisition',
            entityId: id,
            timestamp: new Date(),
            details: `Extended committee scoring deadline from ${oldDeadline ? format(new Date(oldDeadline), 'PPp') : 'N/A'} to ${format(new Date(newDeadline), 'PPp')}.`,
        }
    });


    return NextResponse.json(updatedRequisition);

  } catch (error) {
    console.error('Failed to extend scoring deadline:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
