
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { EvaluationCriterion, ItemScore, User } from '@/lib/types';

function calculateFinalItemScore(itemScore: any, criteria: any): { finalScore: number, allScores: any[] } {
    let totalScore = 0;
    
    // Combine financial and technical scores into one array for easier processing
    const allScores = [
        ...(itemScore.financialScores || []).map((s: any) => ({...s, type: 'FINANCIAL'})),
        ...(itemScore.technicalScores || []).map((s: any) => ({...s, type: 'TECHNICAL'}))
    ];

    const allCriteria: {id: string, weight: number, type: 'FINANCIAL' | 'TECHNICAL'}[] = [
        ...criteria.financialCriteria.map((c: any) => ({...c, type: 'FINANCIAL'})),
        ...criteria.technicalCriteria.map((c: any) => ({...c, type: 'TECHNICAL'}))
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
        const scoreSet = await tx.committeeScoreSet.upsert({
            where: {
                quotationId_scorerId: {
                    quotationId: quoteId,
                    scorerId: userId,
                }
            },
            update: {
                committeeComment: scores.committeeComment,
            },
            create: {
                quotation: { connect: { id: quoteId } },
                scorer: { connect: { id: user.id } },
                committeeComment: scores.committeeComment,
                finalScore: 0, // Will be updated later
            }
        });

        await tx.itemScore.deleteMany({ where: { scoreSetId: scoreSet.id }});

        let totalWeightedScore = 0;
        const totalItems = scores.itemScores.length;

        for (const itemScoreData of scores.itemScores) {
            const { finalScore, allScores } = calculateFinalItemScore(itemScoreData, requisition.evaluationCriteria);
            totalWeightedScore += finalScore;

            if (!itemScoreData.quoteItemId) {
              throw new Error(`quoteItemId is missing for an item score. Data: ${JSON.stringify(itemScoreData)}`);
            }
            
            await tx.itemScore.create({
                data: {
                    scoreSet: { connect: { id: scoreSet.id } },
                    quoteItem: { connect: { id: itemScoreData.quoteItemId } },
                    finalScore: finalScore,
                    scores: {
                        create: allScores.map((s: any) => ({
                            criterionId: s.criterionId,
                            score: s.score,
                            comment: s.comment,
                            type: requisition.evaluationCriteria?.financialCriteria.some(c => c.id === s.criterionId) ? 'FINANCIAL' : 'TECHNICAL'
                        }))
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
                timestamp: new Date(),
                user: { connect: { id: user.id } },
                action: 'SCORE_QUOTE',
                entity: 'Quotation',
                entityId: quoteId,
                details: `Submitted scores for quote from ${quoteToUpdate.vendorName}. Final Score: ${finalAverageScoreForThisScorer.toFixed(2)}.`,
            }
        });

        return scoreSet;
    });


    return NextResponse.json(transactionResult);
  } catch (error) {
    console.error('Failed to submit scores:', error);
    if (error instanceof Error) {
        // Check for unique constraint violation
        if ((error as any).code === 'P2002') {
             return NextResponse.json({ error: 'A unique constraint violation occurred. This might be due to a duplicate score entry.'}, { status: 409 });
        }
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
