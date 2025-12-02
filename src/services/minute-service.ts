
'use server';

import { PrismaClient } from '@prisma/client';
import { PurchaseRequisition, Quotation } from '@/lib/types';

/**
 * Constructs a detailed procurement minute object.
 * @param prisma - The Prisma client instance.
 * @param requisition - The full requisition object with related data.
 * @param quotations - An array of all quotations for the requisition.
 * @param winningVendorIds - An array of IDs for the winning vendors.
 * @param actor - The user finalizing the award.
 * @returns A structured minute object.
 */
export async function constructMinute(
    prisma: PrismaClient,
    requisition: any,
    quotations: any[],
    winningVendorIds: string[],
    actor: any
) {
    const minuteReference = `MINUTE-${requisition.id}-${Date.now()}`;
    const awardStrategy = requisition.rfqSettings?.awardStrategy || 'all';

    const participants = [
        ...requisition.financialCommitteeMembers,
        ...requisition.technicalCommitteeMembers,
        actor
    ].filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i) // Unique participants
     .map(p => ({ name: p.name, role: (p.roles as any[]).map(r => r.name).join(', ') }));

    const procurementSummary = {
        title: requisition.title,
        method: 'Competitive Bidding',
        invitedVendors: requisition.allowedVendorIds?.length === 0 ? 'All Verified' : `${requisition.allowedVendorIds?.length} selected`,
        submittedVendors: quotations.length,
        items: requisition.items.map((item: any) => ({
            name: item.name,
            quantity: item.quantity,
            description: item.description,
        })),
    };

    const evaluationSummary = quotations.map(q => ({
        vendorName: q.vendorName,
        totalPrice: q.totalPrice,
        finalScore: q.finalAverageScore,
        rank: q.rank,
        isDisqualified: q.status === 'Failed',
        disqualificationReason: q.status === 'Failed' ? 'Did not meet minimum requirements.' : null,
    }));
    
    const winningQuotes = quotations.filter(q => winningVendorIds.includes(q.vendorId));

    const awardRecommendation = {
        winningVendors: winningQuotes.map(q => q.vendorName),
        justification: `Awarded based on the '${awardStrategy === 'item' ? 'Best Offer Per Item' : 'Award All to Single Vendor'}' strategy, selecting the highest-scoring qualified bids.`,
        totalAwardAmount: requisition.totalPrice,
        deliveryTerms: `As per vendors' proposals, typically ${winningQuotes.map(q => q.items.reduce((max, i) => Math.max(max, i.leadTimeDays), 0) + ' days').join(', ')}.`,
    };
    
    const systemAnalysis = {
        awardStrategy,
        result: awardStrategy === 'item' 
            ? 'Each item awarded to the vendor with the highest score for that specific item.'
            : `All items awarded to the single vendor with the highest overall average score.`,
        winner: awardStrategy === 'all' ? winningQuotes[0]?.vendorName : 'Multiple',
    };

    const auditMetadata = {
        generatedBy: 'System (Automated)',
        generationTimestamp: new Date().toISOString(),
        logicVersion: '1.0.0',
        changeHistory: [],
    };

    return {
        minuteReference,
        rfqNumber: requisition.id,
        meetingDate: new Date(),
        participants,
        procurementSummary,
        evaluationSummary,
        systemAnalysis,
        awardRecommendation,
        conclusion: 'The committee recommends proceeding with the award as detailed above, subject to final approvals as per the procurement policy.',
        auditMetadata,
    };
}

/**
 * Generates and saves the procurement minute.
 * @param tx - Prisma transaction client.
 * @param requisition - The full requisition object.
 * @param quotations - All related quotations.
 * @param winningVendorIds - Array of winning vendor IDs.
 * @param actor - The user finalizing the award.
 * @returns The newly created minute object.
 */
export async function generateAndSaveMinute(tx: any, requisition: any, quotations: any[], winningVendorIds: string[], actor: any) {
    const minuteData = await constructMinute(new PrismaClient(), requisition, quotations, winningVendorIds, actor);

    const createdMinute = await tx.minute.create({
        data: {
            requisition: { connect: { id: requisition.id } },
            author: { connect: { id: actor.id } },
            ...minuteData,
        },
    });

    return createdMinute;
}
