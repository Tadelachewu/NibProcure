
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';
import { z } from 'zod';

const reviewSchema = z.object({
  decision: z.enum(['Approved', 'Rejected']),
  comment: z.string().min(1, 'A comment is required for the review.'),
});

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
    const requisitionId = params.id;
    try {
        const actor = await getActorFromToken(request);
        if (!actor) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        
        const body = await request.json();
        const validation = reviewSchema.safeParse(body);
        if(!validation.success) {
            return NextResponse.json({ error: 'Invalid request data', details: validation.error.flatten() }, { status: 400 });
        }
        const { decision, comment } = validation.data;

        const requisition = await prisma.purchaseRequisition.findUnique({
             where: { id: requisitionId }
        });
        if (!requisition) {
            return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
        }
        
        // This is a simplified logic. In a real-world scenario, you'd check
        // if the actor is part of the correct committee (A or B) based on the requisition status.
        const canReview = (actor.roles as string[]).some(r => r.includes('Committee'));
        if (!canReview) {
            return NextResponse.json({ error: 'You are not authorized to review this award.' }, { status: 403 });
        }

        const newReview = await prisma.review.create({
            data: {
                requisitionId: requisitionId,
                reviewerId: actor.id,
                decision: decision,
                comment: comment,
            }
        });
        
        // This is where you would put the complex logic to advance the workflow
        // to the next person in the chain (e.g., from Committee B to Manager).
        // For now, we just log it.

        await prisma.auditLog.create({
            data: {
                transactionId: requisition.transactionId,
                user: { connect: { id: actor.id } },
                action: 'SUBMIT_AWARD_REVIEW',
                entity: 'Requisition',
                entityId: requisitionId,
                details: `Submitted award review: ${decision}. Comment: "${comment}"`,
                timestamp: new Date(),
            }
        });

        return NextResponse.json(newReview, { status: 201 });
    } catch (error) {
        console.error("Failed to submit review:");
        return NextResponse.json({ error: 'An unknown error occurred.' }, { status: 500 });
    }
}
