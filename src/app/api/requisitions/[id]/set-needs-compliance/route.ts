"use server";

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken, isActorAuthorizedForRequisition } from '@/lib/auth';

export async function POST(request: Request, context: { params: any }) {
  try {
    const actor = await getActorFromToken(request);
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const params = await context.params;
    const requisitionId = params?.id;
    const body = await request.json();
    const { needsCompliance } = body;

    const isAuthorized = await isActorAuthorizedForRequisition(actor, requisitionId as string);
    if (!isAuthorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const requisition = await prisma.purchaseRequisition.findUnique({ where: { id: requisitionId } });
    if (!requisition) return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });

    // Merge rfqSettings and set needsCompliance
    const current = requisition.rfqSettings || {};
    const merged = { ...(typeof current === 'object' ? current : {}), needsCompliance };

    // Persist rfqSettings.needsCompliance.
    // If the RFQ sender chose to skip compliance, mark the requisition as Scoring_Complete
    // so it can proceed to award/finalize immediately.
    const data: any = { rfqSettings: merged };
    if (needsCompliance === false) {
      data.status = 'Scoring_Complete';
    }

    const updated = await prisma.purchaseRequisition.update({ where: { id: requisitionId }, data });

    // If the RFQ sender chose to skip compliance, create compliance records
    // marking all quote items as compliant so the finalize flow can proceed.
    if (needsCompliance === false) {
      try {
        await prisma.$transaction(async (tx) => {
          const quotes = await tx.quotation.findMany({ where: { requisitionId }, include: { items: true } });
          for (const q of quotes) {
            const complianceSet = await tx.committeeComplianceSet.upsert({
              where: { quotationId_scorerId: { quotationId: q.id, scorerId: actor.id } },
              update: { committeeComment: 'Auto: compliance skipped by RFQ sender' },
              create: { quotation: { connect: { id: q.id } }, scorer: { connect: { id: actor.id } }, committeeComment: 'Auto: compliance skipped by RFQ sender' }
            });

            await tx.itemCompliance.deleteMany({ where: { complianceSetId: complianceSet.id } });

            for (const item of q.items || []) {
              await tx.itemCompliance.create({
                data: {
                  complianceSet: { connect: { id: complianceSet.id } },
                  quoteItem: { connect: { id: item.id } },
                  comply: true,
                  comment: 'Auto-marked compliant (skip compliance)'
                }
              });
            }

            // set quotation compliance to 100% for auditing
            await tx.quotation.update({ where: { id: q.id }, data: { finalAverageScore: 100 } });
          }
        });
      } catch (e) {
        console.error('Failed to auto-create compliance entries:', e);
        // proceed without failing the whole request; the flag is still saved
      }
    }

    await prisma.auditLog.create({
      data: {
        transactionId: updated.transactionId,
        user: { connect: { id: actor.id } },
        timestamp: new Date(),
        action: 'SET_NEEDS_COMPLIANCE',
        entity: 'Requisition',
        entityId: requisitionId,
        details: `Set needsCompliance=${needsCompliance}${needsCompliance === false ? ' and marked Scoring_Complete' : ''}`,
      }
    });

    return NextResponse.json({ requisition: updated });
  } catch (error) {
    console.error('Failed to set needsCompliance:', error);
    if (error instanceof Error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ error: 'Unknown error' }, { status: 500 });
  }
}
