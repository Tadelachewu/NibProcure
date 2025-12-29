
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';
import { UserRole } from '@/lib/types';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
    try {
        const actor = await getActorFromToken(request);
        if (!actor) {
            return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
        }

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
            return NextResponse.json({ error: 'Unauthorized to edit criteria.' }, { status: 403 });
        }

        const requisitionId = params.id;
        const body = await request.json();
        const { financialWeight, technicalWeight, financialCriteria, technicalCriteria } = body;

        const requisition = await prisma.purchaseRequisition.findUnique({ where: { id: requisitionId } });
        if (!requisition) {
            return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
        }
        
        if (requisition.status !== 'PreApproved') {
            return NextResponse.json({ error: 'Evaluation criteria can only be edited before the RFQ is sent.' }, { status: 400 });
        }
        
        // Validation
        if (financialWeight + technicalWeight !== 100) return NextResponse.json({ error: 'Overall weights must sum to 100.' }, { status: 400 });
        if (financialCriteria.reduce((acc: number, c: any) => acc + c.weight, 0) !== 100) return NextResponse.json({ error: 'Financial criteria weights must sum to 100.' }, { status: 400 });
        if (technicalCriteria.reduce((acc: number, c: any) => acc + c.weight, 0) !== 100) return NextResponse.json({ error: 'Technical criteria weights must sum to 100.' }, { status: 400 });


        const transactionResult = await prisma.$transaction(async (tx) => {
            const oldCriteria = await tx.evaluationCriteria.findUnique({ where: { requisitionId } });
            if (oldCriteria) {
                await tx.financialCriterion.deleteMany({ where: { evaluationCriteriaId: oldCriteria.id }});
                await tx.technicalCriterion.deleteMany({ where: { evaluationCriteriaId: oldCriteria.id }});
                await tx.evaluationCriteria.delete({ where: { id: oldCriteria.id }});
            }

            const newCriteria = await tx.evaluationCriteria.create({
                data: {
                    requisitionId,
                    financialWeight,
                    technicalWeight,
                    financialCriteria: {
                        create: financialCriteria.map((c: any) => ({ name: c.name, weight: c.weight }))
                    },
                    technicalCriteria: {
                        create: technicalCriteria.map((c: any) => ({ name: c.name, weight: c.weight }))
                    }
                }
            });

            await tx.auditLog.create({
                data: {
                    transactionId: requisition.transactionId,
                    user: { connect: { id: actor.id } },
                    action: 'UPDATE_EVALUATION_CRITERIA',
                    entity: 'Requisition',
                    entityId: requisitionId,
                    timestamp: new Date(),
                    details: 'Updated the evaluation criteria for the requisition.',
                }
            });

            return newCriteria;
        });

        return NextResponse.json(transactionResult);

    } catch (error) {
        console.error('Failed to update evaluation criteria:', error);
        if (error instanceof Error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
    }
}
