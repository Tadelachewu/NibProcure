
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken, isActorAuthorizedForRequisition } from '@/lib/auth';
import { UserRole } from '@/lib/types';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
    try {
        const actor = await getActorFromToken(request);
        if (!actor) {
            return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
        }

        const userRoles = actor.roles as UserRole[];
        let isAuthorized = false;
        if (userRoles.includes('Admin')) {
            isAuthorized = true;
        } else {
            isAuthorized = await isActorAuthorizedForRequisition(actor, params.id);
        }

        if (!isAuthorized) {
            return NextResponse.json({ error: 'Unauthorized to edit questions.' }, { status: 403 });
        }

        const requisitionId = params.id;
        const body = await request.json();
        const { customQuestions } = body;

        const requisition = await prisma.purchaseRequisition.findUnique({ where: { id: requisitionId } });
        if (!requisition) {
            return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
        }

        if (requisition.status !== 'PreApproved') {
            return NextResponse.json({ error: 'Custom questions can only be edited before the RFQ is sent.' }, { status: 400 });
        }

        const transactionResult = await prisma.$transaction(async (tx) => {
            // Delete old questions
            await tx.customQuestion.deleteMany({ where: { requisitionId } });

            // Create new questions
            if (customQuestions && customQuestions.length > 0) {
                await tx.customQuestion.createMany({
                    data: customQuestions.map((q: any) => ({
                        requisitionId,
                        questionText: q.questionText,
                        questionType: q.questionType.replace(/-/g, '_'),
                        isRequired: q.isRequired,
                        options: q.options || [],
                        requisitionItemId: q.requisitionItemId && q.requisitionItemId !== 'general' ? q.requisitionItemId : null,
                    }))
                });
            }

            await tx.auditLog.create({
                data: {
                    transactionId: requisition.transactionId,
                    user: { connect: { id: actor.id } },
                    action: 'UPDATE_CUSTOM_QUESTIONS',
                    entity: 'Requisition',
                    entityId: requisitionId,
                    timestamp: new Date(),
                    details: 'Updated the custom questions for vendors.',
                }
            });

            return { success: true };
        });

        return NextResponse.json(transactionResult);

    } catch (error) {
        console.error('Failed to update custom questions:', error);
        if (error instanceof Error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
    }
}
