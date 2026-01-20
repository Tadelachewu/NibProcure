
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { User } from '@/lib/types';

// This endpoint now accepts compliance checks per quote item instead of numeric scores.
// Payload: { checks: [{ quoteItemId, comply: boolean, comment?: string }], committeeComment, userId }


export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const quoteId = params.id;
  try {
    const body = await request.json();
    const { checks, committeeComment, userId } = body;

    const user: User | null = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const quoteToUpdate = await prisma.quotation.findUnique({ where: { id: quoteId } });
    if (!quoteToUpdate) {
        return NextResponse.json({ error: 'Quotation not found' }, { status: 404 });
    }
    
    const requisition = await prisma.purchaseRequisition.findUnique({ where: { id: quoteToUpdate.requisitionId } });
    if (!requisition) {
        return NextResponse.json({ error: 'Associated requisition not found.' }, { status: 404 });
    }

    const transactionResult = await prisma.$transaction(async (tx) => {
        // Prevent resubmission: if a compliance set already exists for this user & quotation, reject
        const existing = await tx.committeeComplianceSet.findUnique({ where: { quotationId_scorerId: { quotationId: quoteId, scorerId: userId } } });
        if (existing) {
            // Do not allow updates once submitted
            throw Object.assign(new Error('Compliance already submitted by this user.'), { code: 'ALREADY_SUBMITTED' });
        }

        const complianceSet = await tx.committeeComplianceSet.create({
            data: { quotation: { connect: { id: quoteId } }, scorer: { connect: { id: user.id } }, committeeComment: committeeComment }
        });

        let totalCompliant = 0;
        const totalItems = (checks || []).length;

        for (const check of (checks || [])) {
            if (!check.quoteItemId) {
                throw new Error('quoteItemId is required for each check.');
            }
            if (check.comply) totalCompliant += 1;

            await tx.itemCompliance.create({
                data: {
                    complianceSet: { connect: { id: complianceSet.id } },
                    quoteItem: { connect: { id: check.quoteItemId } },
                    comply: !!check.comply,
                    comment: check.comment || null,
                }
            });
        }

        const compliancePercent = totalItems > 0 ? (totalCompliant / totalItems) * 100 : 0;

        // Recalculate overall compliance for the quotation (average across compliance sets)
        const allComplianceSetsForQuote = await tx.committeeComplianceSet.findMany({ where: { quotationId: quoteId }, include: { itemCompliances: true } });
        const overallCompliance = allComplianceSetsForQuote.length > 0
            ? allComplianceSetsForQuote.reduce((acc, s) => {
                const compliantCount = (s.itemCompliances || []).filter(ic => ic.comply).length;
                const total = (s.itemCompliances || []).length || 1;
                return acc + (compliantCount / total) * 100;
              }, 0) / allComplianceSetsForQuote.length
            : 0;

        await tx.quotation.update({ where: { id: quoteId }, data: { finalAverageScore: overallCompliance } });

        await tx.auditLog.create({
            data: {
                timestamp: new Date(),
                user: { connect: { id: user.id } },
                action: 'COMPLIANCE_CHECK',
                entity: 'Quotation',
                entityId: quoteId,
                details: `Submitted compliance checks for quote from ${quoteToUpdate.vendorName}. Compliance: ${compliancePercent.toFixed(2)}%.`,
                transactionId: requisition.id,
            }
        });

        return complianceSet;
    });

    return NextResponse.json(transactionResult);
  } catch (error) {
    console.error('Failed to submit scores:', error);
    if (error instanceof Error) {
        // Already submitted by this user
        if ((error as any).code === 'ALREADY_SUBMITTED') {
            return NextResponse.json({ error: 'Compliance checks already submitted by this user.' }, { status: 409 });
        }
        // Check for unique constraint violation
        if ((error as any).code === 'P2002') {
             return NextResponse.json({ error: 'A unique constraint violation occurred. This might be due to a duplicate score entry.'}, { status: 409 });
        }
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
