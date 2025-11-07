
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { EvaluationCriterion, ItemScore, User } from '@/lib/types';

function calculateFinalItemScore(itemScoreData: any, criteria: any): { finalScore: number, allScores: any[] } {
    let totalScore = 0;
    
    const allScores = [
        ...(itemScoreData.financialScores || []).map((s: any) => ({...s, type: 'FINANCIAL'})),
        ...(itemScoreData.technicalScores || []).map((s: any) => ({...s, type: 'TECHNICAL'}))
    ];

    const allCriteria: {id: string, weight: number, type: 'FINANCIAL' | 'TECHNICAL'}[] = [
        ...(criteria.financialCriteria || []).map((c: any) => ({...c, type: 'FINANCIAL'})),
        ...(criteria.technicalCriteria || []).map((c: any) => ({...c, type: 'TECHNICAL'}))
    ];
    
    allScores.forEach((s: any) => {
        const criterion = allCriteria.find(c => c.id === s.criterionId);
        if (criterion) {
            const overallWeight = criterion.type === 'FINANCIAL' ? criteria.financialWeight : criteria.technicalWeight;
            totalScore += s.score * (criterion.weight / 100) * (overallWeight / 100);
        }
    });

    return { finalScore: totalScore, allScores };
}


export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const quoteId = params.id;
  try {
    const body = await request.json();
    const { scores, userId } = body;

    const user: User | null = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const quoteToUpdate = await prisma.quotation.findUnique({ where: { id: quoteId } });
    if (!quoteToUpdate) {
        return NextResponse.json({ error: 'Quotation not found' }, { status: 404 });
    }
    
    const requisition = await prisma.purchaseRequisition.findUnique({
      where: { id: quoteToUpdate.requisitionId },
      include: { evaluationCriteria: { include: { financialCriteria: true, technicalCriteria: true } } }
    });
    if (!requisition || !requisition.evaluationCriteria) {
        return NextResponse.json({ error: 'Associated requisition or its evaluation criteria not found.' }, { status: 404 });
    }
    
    const transactionResult = await prisma.$transaction(async (tx) => {
        // 1. Delete previous scores from this user for this quote to ensure clean update.
        const previousScoreSet = await tx.committeeScoreSet.findUnique({
            where: { quotationId_scorerId: { quotationId: quoteId, scorerId: userId } },
            include: { itemScores: true }
        });

        if (previousScoreSet) {
            const itemScoreIds = previousScoreSet.itemScores.map(is => is.id);
            if (itemScoreIds.length > 0) {
                await tx.score.deleteMany({ where: { itemScoreId: { in: itemScoreIds } } });
                await tx.itemScore.deleteMany({ where: { id: { in: itemScoreIds } } });
            }
            await tx.committeeScoreSet.delete({ where: { id: previousScoreSet.id } });
        }


        let totalWeightedScore = 0;
        const totalItems = scores.itemScores.length;

        // 2. Create the main score set for this user and this quote.
        const scoreSet = await tx.committeeScoreSet.create({
            data: {
                quotation: { connect: { id: quoteId } },
                scorer: { connect: { id: user.id } },
                committeeComment: scores.committeeComment,
                finalScore: 0, // Placeholder, will be updated later
            }
        });

        for (const itemScoreData of scores.itemScores) {
            const { finalScore, allScores } = calculateFinalItemScore(itemScoreData, requisition.evaluationCriteria);
            totalWeightedScore += finalScore;

            // 3. Create the ItemScore record linked to the main CommitteeScoreSet.
            const itemScoreRecord = await tx.itemScore.create({
                data: {
                    quoteItem: { connect: { id: itemScoreData.quoteItemId } },
                    scoreSet: { connect: { id: scoreSet.id } },
                    finalScore: finalScore,
                    // 4. Create individual scores nested within this ItemScore.
                    scores: {
                        create: allScores.map((s: any) => {
                            const isFinancial = requisition.evaluationCriteria?.financialCriteria.some(c => c.id === s.criterionId);
                            return {
                                score: s.score,
                                comment: s.comment,
                                type: isFinancial ? 'FINANCIAL' as const : 'TECHNICAL' as const,
                                financialCriterionId: isFinancial ? s.criterionId : null,
                                technicalCriterionId: !isFinancial ? s.criterionId : null,
                            };
                        })
                    }
                }
            });
        }
        
        const finalAverageScoreForThisScorer = totalItems > 0 ? totalWeightedScore / totalItems : 0;
    
        await tx.committeeScoreSet.update({
            where: { id: scoreSet.id },
            data: { finalScore: finalAverageScoreForThisScorer }
        });

        const allScoreSetsForQuote = await tx.committeeScoreSet.findMany({ where: { quotationId: quoteId } });
        const overallAverage = allScoreSetsForQuote.length > 0 
            ? allScoreSetsForQuote.reduce((acc, s) => acc + s.finalScore, 0) / allScoreSetsForQuote.length
            : 0;

        await tx.quotation.update({ where: { id: quoteId }, data: { finalAverageScore: overallAverage } });

        await tx.auditLog.create({
            data: {
                transactionId: requisition.transactionId,
                timestamp: new Date(),
                user: { connect: { id: user.id } },
                action: 'SCORE_QUOTE',
                entity: 'Quotation',
                entityId: quoteId,
                details: `Submitted scores for quote from ${quoteToUpdate.vendorName}. Scorer's average: ${finalAverageScoreForThisScorer.toFixed(2)}.`,
            }
        });

        return scoreSet;
    });


    return NextResponse.json(transactionResult);
  } catch (error) {
    console.error('Failed to submit scores:', error);
    if (error instanceof Error) {
        if ((error as any).code === 'P2002') {
             return NextResponse.json({ error: 'A unique constraint violation occurred. This might be due to a duplicate score entry.'}, { status: 409 });
        }
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
