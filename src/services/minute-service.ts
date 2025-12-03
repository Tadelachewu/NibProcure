
'use server';

import { Prisma, PrismaClient } from '@prisma/client';
import { PurchaseRequisition, Quotation } from '@/lib/types';

/**
 * Constructs a detailed, formal procurement minute object for database storage,
 * adhering to a banking document standard.
 * @param prisma - The Prisma client instance.
 * @param requisition - The full requisition object with related data.
 * @param quotations - An array of all quotations for the requisition.
 * @param winningVendorIds - An array of IDs for the winning vendors.
 * @param actor - The user finalizing the award.
 * @returns A structured set of objects for the minute record.
 */
export async function constructMinuteData(
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
    ].filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i)
     .map(p => ({ name: p.name, role: (p.roles as any[]).map(r => r.name.replace(/_/g, ' ')).join(', ') }));

    const procurementDetails = {
        requisitionId: requisition.id,
        title: requisition.title,
        procurementMethod: 'Competitive Bidding',
        itemsRequested: requisition.items.map((item: any) => ({
            name: item.name,
            quantity: item.quantity,
            description: item.description || 'N/A',
        })),
    };

    const invitedVendorCount = requisition.allowedVendorIds?.length === 0
        ? (await prisma.vendor.count({ where: { kycStatus: 'Verified' } }))
        : requisition.allowedVendorIds?.length;

    const bidders = {
        vendorsInvited: invitedVendorCount,
        vendorsSubmitted: quotations.length,
        submissions: quotations.map(q => ({
            vendorName: q.vendorName,
            totalQuotedPrice: q.totalPrice,
            items: q.items.map((item: any) => ({
                requestedItem: requisition.items.find((i: any) => i.id === item.requisitionItemId)?.name || 'Unknown',
                proposedItem: item.name,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalPrice: item.quantity * item.unitPrice,
            })),
        })),
    };

    const evaluationSummary = quotations.map(q => ({
        vendorName: q.vendorName,
        totalPrice: q.totalPrice,
        isDisqualified: q.status === 'Failed',
        disqualificationReason: q.status === 'Failed' ? 'Did not meet minimum requirements.' : null,
        finalScore: q.finalAverageScore || null,
        rank: q.rank || null,
    })).sort((a,b) => (a.rank || 99) - (b.rank || 99));
    
    const winningQuotes = quotations.filter(q => winningVendorIds.includes(q.vendorId));

    const awardRecommendation = {
        winningVendors: winningQuotes.map(q => q.vendorName),
        justification: `Awarded based on the '${awardStrategy === 'item' ? 'Best Offer Per Item' : 'Award All to Single Vendor'}' strategy, selecting the highest-scoring qualified bids.`,
        totalAwardAmount: requisition.totalPrice,
        deliveryTerms: `As per vendors' proposals, typically ${winningQuotes.map(q => q.items.reduce((max: number, i: any) => Math.max(max, i.leadTimeDays), 0) + ' days').join(', ')}.`,
    };
    
    const systemAnalysis = {
        awardStrategy: awardStrategy === 'item' ? 'Best Offer (Per Item)' : 'Award All to Single Vendor',
        result: awardStrategy === 'item' 
            ? 'Each item awarded to the vendor with the highest score for that specific item.'
            : `All items awarded to the single vendor with the highest overall average score.`,
        winner: awardStrategy === 'all' && winningQuotes.length > 0 ? winningQuotes[0]?.vendorName : 'Multiple',
    };
    
    const conclusion = 'The committee recommends proceeding with the award as detailed above, subject to final approvals as per the procurement policy.';

    const auditMetadata = {
        generatedBy: 'System (Automated)',
        generationTimestamp: new Date().toISOString(),
        logicVersion: '1.0.0',
        changeHistory: [],
    };
    
    const minuteData: Prisma.JsonObject = {
        minuteReference,
        meetingDate: new Date().toISOString(),
        participants,
        procurementDetails,
        bidders,
    };
    
    return {
        procurementSummary: procurementDetails,
        evaluationSummary: evaluationSummary,
        systemAnalysis,
        awardRecommendation,
        conclusion,
        auditMetadata,
        minuteData,
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
export async function generateAndSaveMinute(tx: any, requisition: any, quotations: any[], winningVendorIds: string[], actor: any, filePath?: string) {
    
    if (filePath) {
        // If a file is uploaded, create a minimal minute record
        const createdMinute = await tx.minute.create({
            data: {
                requisition: { connect: { id: requisition.id } },
                author: { connect: { id: actor.id } },
                decision: 'APPROVED', // Assume approval if a minute is being finalized
                decisionBody: 'Award Finalization Committee',
                justification: 'Manual minute uploaded by procurement officer.',
                filePath: filePath,
                attendees: {
                    connect: [
                        ...requisition.financialCommitteeMembers.map((m: any) => ({ id: m.id })),
                        ...requisition.technicalCommitteeMembers.map((m: any) => ({ id: m.id })),
                        { id: actor.id },
                    ].filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i)
                },
                // Set default/empty values for required JSON fields
                procurementSummary: {},
                evaluationSummary: [],
                systemAnalysis: {},
                awardRecommendation: {},
                conclusion: "See attached document.",
                auditMetadata: { uploadedBy: actor.name, uploadTimestamp: new Date().toISOString() },
                minuteData: { manualUpload: true, path: filePath }
            }
        });
        return createdMinute;
    }
    
    // If no file, generate the full minute data
    const { 
        procurementSummary, 
        evaluationSummary, 
        systemAnalysis,
        awardRecommendation,
        conclusion,
        auditMetadata,
        minuteData 
    } = await constructMinuteData(new PrismaClient(), requisition, quotations, winningVendorIds, actor);

    const createdMinute = await tx.minute.create({
        data: {
            requisition: { connect: { id: requisition.id } },
            author: { connect: { id: actor.id } },
            decision: 'APPROVED',
            decisionBody: 'Award Finalization Committee',
            justification: (awardRecommendation as any).justification,
            attendees: {
                connect: [
                    ...requisition.financialCommitteeMembers.map((m: any) => ({ id: m.id })),
                    ...requisition.technicalCommitteeMembers.map((m: any) => ({ id: m.id })),
                    { id: actor.id },
                ].filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i)
            },
            // Assign all the required top-level JSON fields
            procurementSummary: procurementSummary as any,
            evaluationSummary: evaluationSummary as any,
            systemAnalysis: systemAnalysis as any,
            awardRecommendation: awardRecommendation as any,
            conclusion: conclusion,
            auditMetadata: auditMetadata,
            minuteData: minuteData,
        },
    });

    return createdMinute;
}
