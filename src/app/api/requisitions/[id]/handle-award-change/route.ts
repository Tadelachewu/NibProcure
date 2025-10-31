
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleAwardRejection } from '@/services/award-service';
import { promoteStandbyVendor } from '@/services/award-service';


export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const requisitionId = params.id;
  try {
    const body = await request.json();
    const { userId } = body as { userId: string };

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
            // We use the rejection logic, which now correctly sets the stage for promotion
            return await handleAwardRejection(tx, failedQuote, requisition, user);
        } else {
            // Fallback for cases where status is Award_Declined but no quote is marked 'Declined'
            // This might happen if a deadline is missed. Promote the next in line.
            return await promoteStandbyVendor(tx, requisitionId, user);
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
