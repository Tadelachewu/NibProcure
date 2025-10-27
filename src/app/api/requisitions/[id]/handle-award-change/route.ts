
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleAwardRejection } from '@/services/award-service';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const requisitionId = params.id;
  try {
    const body = await request.json();
    const { userId } = body as { userId: string; };

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

        const currentAwardedQuote = await tx.quotation.findFirst({
            where: {
                requisitionId: requisitionId,
                status: 'Awarded'
            }
        });
        
        // This handles the case where the PO is trying to re-award after a rejection
        if (!currentAwardedQuote) {
             await tx.purchaseRequisition.update({
                where: { id: requisition.id },
                data: { status: 'Scoring_Complete' }
            });
            return { message: 'Requisition is ready for a new award decision.'};
        }

        // We can reuse the rejection logic, as promoting is a consequence of the current winner "failing"
        return await handleAwardRejection(tx, currentAwardedQuote, requisition, user);
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
