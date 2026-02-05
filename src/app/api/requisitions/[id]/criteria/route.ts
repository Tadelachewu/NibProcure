
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';
import { UserRole } from '@/lib/types';

export async function PATCH(request: Request, context: { params: any }) {
    try {
        const actor = await getActorFromToken(request);
        if (!actor) {
            return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
        }
        // `params` can be a Promise in some Next.js runtimes (Turbopack/edge).
        // Await it to ensure we have the resolved params object before accessing properties.
        const params = await context.params;

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
            } else if (setting.type === 'assigned') {
                // Check if user is assigned for this requisition
                const requisition = await prisma.purchaseRequisition.findUnique({ where: { id: params.id } });
                if (requisition && Array.isArray(requisition.assignedRfqSenderIds) && requisition.assignedRfqSenderIds.includes(actor.id)) {
                    isAuthorized = true;
                }
            }
        }

        if (!isAuthorized) {
            return NextResponse.json({ error: 'Unauthorized to edit criteria.' }, { status: 403 });
        }

        const requisitionId = params?.id as string;
        const body = await request.json();
        const { financialWeight, technicalWeight, financialCriteria, technicalCriteria } = body;

        const requisition = await prisma.purchaseRequisition.findUnique({ where: { id: requisitionId } });
        if (!requisition) {
            return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
        }

        if (requisition.status !== 'PreApproved') {
            return NextResponse.json({ error: 'Evaluation criteria can only be edited before the RFQ is sent.' }, { status: 400 });
        }

        // Note: weight-based validations were removed to support a compliance-only flow
        // (criteria weights and financial/technical splits are kept for compatibility
        // but are no longer strictly validated on the server).


        const transactionResult = await prisma.$transaction(async (tx) => {
            const oldCriteria = await tx.evaluationCriteria.findUnique({ where: { requisitionId } });
            if (oldCriteria) {
                await tx.financialCriterion.deleteMany({ where: { evaluationCriteriaId: oldCriteria.id } });
                await tx.technicalCriterion.deleteMany({ where: { evaluationCriteriaId: oldCriteria.id } });
                await tx.evaluationCriteria.delete({ where: { id: oldCriteria.id } });
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
