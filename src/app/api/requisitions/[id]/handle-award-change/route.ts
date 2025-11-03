
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleAwardRejection } from '@/services/award-service';

type AwardAction = 'promote_second' | 'promote_third' | 'restart_rfq';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const requisitionId = params.id;
  try {
    const body = await request.json();
    const { userId, action } = body as { userId: string; action: AwardAction };

    const user = await prisma.user.findUnique({where: {id: userId}});
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // The logic is complex and state-dependent, so we wrap it in a transaction
    // and use our dedicated service.
    const transactionResult = await prisma.$transaction(async (tx) => {
        const requisition = await tx.purchaseRequisition.findUnique({ where: { id: requisitionId }});
        if (!requisition) {
          throw new Error('Requisition not found');
        }

        // The "award change" is always triggered because a vendor declined or failed.
        // We find the quote that caused the "Award_Declined" state.
        const failedQuote = await tx.quotation.findFirst({
            where: {
                requisitionId: requisitionId,
                status: 'Declined'
            },
            orderBy: {
                updatedAt: 'desc'
            }
        });

        if (failedQuote) {
            // We use the rejection logic, as promoting is a consequence of the current winner "failing"
            return await handleAwardRejection(tx, failedQuote, requisition, user);
        } else {
            // Fallback for cases where status is Award_Declined but no quote is marked 'Declined'
             await tx.purchaseRequisition.update({
                where: { id: requisition.id },
                data: { status: 'Scoring_Complete' }
            });
            await tx.auditLog.create({
                data: {
                    transactionId: requisition.id,
                    user: { connect: { id: user.id }},
                    action: 'RESET_AWARD_STATE',
                    entity: 'Requisition',
                    entityId: requisition.id,
                    details: 'Award status was reset to Scoring Complete due to an inconsistent state.'
                }
            })
            return { message: 'Requisition award status was inconsistent and has been reset. Please re-award.'};
        }
    });

    return NextResponse.json({ message: 'Award change handled successfully.', details: transactionResult });
  } catch (error) {
    console.error('Failed to handle award change:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
