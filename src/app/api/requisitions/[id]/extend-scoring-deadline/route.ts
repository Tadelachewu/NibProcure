
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { UserRole } from '@/lib/types';
import { format } from 'date-fns';
import { getActorFromToken, isActorAuthorizedForRequisition } from '@/lib/auth';

export async function POST(request: Request, context: { params: any }) {
    try {
        const actor = await getActorFromToken(request);
        if (!actor) {
            return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
        }

        const params = await context.params;
        const id = params?.id as string | undefined;
        if (!id || typeof id !== 'string') {
            console.error('POST /app/api/requisitions/[id]/extend-scoring-deadline missing or invalid id', { method: request.method, url: (request as any).url, params });
            return NextResponse.json({ error: 'Missing or invalid id' }, { status: 400 });
        }
        const body = await request.json();
        const { newDeadline } = body;

        const isAuthorized = await isActorAuthorizedForRequisition(actor, id as string);
        if (!isAuthorized) {
            return NextResponse.json({ error: 'Unauthorized: You do not have permission to extend deadlines for this requisition.' }, { status: 403 });
        }

        if (!newDeadline) {
            return NextResponse.json({ error: 'New deadline is required.' }, { status: 400 });
        }

        const requisition = await prisma.purchaseRequisition.findUnique({ where: { id } });
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
