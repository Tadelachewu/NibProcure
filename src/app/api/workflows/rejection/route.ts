
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';
import { getPreviousApprovalStep, resetAwardToScoring } from '@/services/award-service';

export async function POST(request: Request) {
    try {
        const actor = await getActorFromToken(request);
        const { requisitionId, comment } = await request.json();

        if (!requisitionId) {
            return NextResponse.json({ error: 'Requisition ID is required.' }, { status: 400 });
        }

        const result = await prisma.$transaction(async (tx) => {
            const requisition = await tx.purchaseRequisition.findUnique({
                where: { id: requisitionId },
                include: { department: true, requester: true, items: true, quotations: true, minutes: true }
            });

            if (!requisition) {
                throw new Error('Requisition not found.');
            }

            const { previousStatus, previousApproverId, auditDetails, resetToScoring } = await getPreviousApprovalStep(tx, requisition, actor, comment);

            if (resetToScoring) {
                return await resetAwardToScoring(tx, requisitionId, actor.id, comment);
            } else {
                 const updatedReq = await tx.purchaseRequisition.update({
                    where: { id: requisitionId },
                    data: {
                        status: previousStatus,
                        currentApproverId: previousApproverId,
                        approverComment: comment,
                    }
                });

                await tx.auditLog.create({
                    data: {
                        transactionId: requisition.transactionId,
                        user: { connect: { id: actor.id } },
                        timestamp: new Date(),
                        action: 'REJECT_AWARD_STEP',
                        entity: 'Requisition',
                        entityId: requisitionId,
                        details: auditDetails,
                    }
                });

                return updatedReq;
            }
        });
        
        return NextResponse.json({ message: 'Rejection processed successfully.', requisition: result });

    } catch (error) {
        console.error('[WORKFLOWS/REJECTION] Error:', error);
        if (error instanceof Error) {
            return NextResponse.json({ error: 'Failed to process rejection workflow', details: error.message }, { status: 500 });
        }
        return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
    }
}
