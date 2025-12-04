
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { User, UserRole, PerItemAwardDetail, QuoteItem, Quotation } from '@/lib/types';
import { getNextApprovalStep } from '@/services/award-service';

function generateAwardJustificationReport(
    requisition: any,
    awards: any,
    awardStrategy: 'all' | 'item',
    totalAwardValue: number
): string {
    let report = `## Award Justification Report\n\n`;
    report += `**Requisition ID:** ${requisition.id}\n`;
    report += `**Title:** ${requisition.title}\n`;
    report += `**Final Award Value:** ${totalAwardValue.toLocaleString('en-US', { style: 'currency', currency: 'ETB' })}\n`;
    report += `**Award Strategy:** ${awardStrategy === 'item' ? 'Best Offer (Per Item)' : 'Award All to Single Vendor'}\n\n`;
    report += `---

`;

    report += `### Vendor Bids & Final Scores
`;
    const sortedQuotes = [...requisition.quotations].sort((a,b) => (b.finalAverageScore || 0) - (a.finalAverageScore || 0));

    report += `| Rank | Vendor Name | Final Score | Total Quoted Price |
`;
    report += `|:----:|:------------|:-----------:|-------------------:|
`;
    sortedQuotes.forEach((q: any, index: number) => {
        report += `| ${index + 1} | ${q.vendorName} | **${(q.finalAverageScore || 0).toFixed(2)}** | ${q.totalPrice.toLocaleString('en-US', { style: 'currency', currency: 'ETB' })} |
`;
    });
    report += `
---

`;

    if (awardStrategy === 'all') {
        const winnerVendorId = Object.keys(awards)[0];
        const winnerData = awards[winnerVendorId];
        report += `### Decision: Award All to Single Vendor

`;
        if (winnerData) {
            report += `Based on the highest overall average score of **${(sortedQuotes[0].finalAverageScore || 0).toFixed(2)}**, the award is recommended for **${winnerData.vendorName}**.
`;
        } else {
            report += 'No winner could be determined based on the provided data.
';
        }
    } else { // Per Item
        report += `### Decision: Award by Best Offer (Per Item)

`;
        Object.keys(awards).forEach(reqItemId => {
            const reqItem = requisition.items.find((i: any) => i.id === reqItemId);
            // The `awards` object for per-item now contains `rankedBids`.
            const winnerBid = awards[reqItemId]?.rankedBids[0];
            if (reqItem && winnerBid) {
                const vendor = requisition.quotations.find((q:any) => q.id === winnerBid.quotationId)?.vendorName;
                report += `- **Item:** ${reqItem.name}
`;
                report += `  - **Winner:** **${vendor}** (Proposal: "${winnerBid.proposedItemName}")
`;
                report += `  - **Justification:** This vendor achieved the highest score for this specific item with **${winnerBid.score.toFixed(2)}** points.

`;
            }
        });
    }

    report += `---

**Conclusion:** The award recommendation is finalized based on the systematic evaluation of vendor proposals against the pre-defined criteria and the selected '${awardStrategy === 'item' ? 'Best Offer (Per Item)' : 'Award All to Single Vendor'}' award strategy.`;
    return report;
}


export async function POST(
  request: Request,
  { params }: { params: { id:string } }
) {
    const requisitionId = params.id;
    console.log(`[FINALIZE-SCORES] Received request for requisition: ${requisitionId}`);
    try {
        const body = await request.json();
        const { userId, awards, awardStrategy, awardResponseDeadline, totalAwardValue, minuteDocumentUrl, minuteJustification } = body;
        console.log(`[FINALIZE-SCORES] Action by User ID: ${userId}, Strategy: ${awardStrategy}, Total Value: ${totalAwardValue}`);

        const user = await prisma.user.findUnique({ where: { id: userId }, include: { roles: true } });
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const rfqSenderSetting = await prisma.setting.findUnique({ where: { key: 'rfqSenderSetting' } });
        let isAuthorized = false;
        const userRoles = (user.roles as any[]).map(r => r.name) as UserRole[];

        if (userRoles.includes('Admin')) {
            isAuthorized = true;
        } else if (rfqSenderSetting?.value && typeof rfqSenderSetting.value === 'object' && 'type' in rfqSenderSetting.value) {
            const setting = rfqSenderSetting.value as { type: string, userId?: string };
            if (setting.type === 'specific') {
                isAuthorized = setting.userId === userId;
            } else { // 'all' case
                isAuthorized = userRoles.includes('Procurement_Officer');
            }
        }


        if (!isAuthorized) {
            console.error(`[FINALIZE-SCORES] User ${userId} is not authorized.`);
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        console.log('[FINALIZE-SCORES] Starting transaction...');
        const result = await prisma.$transaction(async (tx) => {

            const requisition = await tx.purchaseRequisition.findUnique({
                where: { id: requisitionId },
                include: {
                    items: true,
                    evaluationCriteria: { include: { financialCriteria: true, technicalCriteria: true } },
                    quotations: { include: { scores: true }}
                }
            });
            if (!requisition) {
                throw new Error("Requisition not found.");
            }

            const allQuotes = await tx.quotation.findMany({
                where: { requisitionId: requisitionId },
                include: { items: true, scores: { include: { itemScores: {include: {scores: true}} } } },
            });

            if (allQuotes.length === 0) {
                throw new Error("No quotes found to process for this requisition.");
            }

            // This is the dynamic value based on the current award set.
            const dynamicAwardValue = totalAwardValue;

            if (awardStrategy === 'all') {
                console.log('[FINALIZE-SCORES] Calculating for "Award All to Single Vendor" strategy.');
                const winningVendorId = Object.keys(awards)[0];
                const winningQuote = allQuotes.find(q => q.vendorId === winningVendorId);

                if (!winningQuote) throw new Error("Winning vendor's quote not found.");

                const otherQuotes = allQuotes.filter(q => q.vendorId !== winningVendorId);

                // Rank and update status for all quotes
                await tx.quotation.update({ where: { id: winningQuote.id }, data: { status: 'Pending_Award', rank: 1 } });

                const sortedOthers = otherQuotes.sort((a,b) => (b.finalAverageScore || 0) - (a.finalAverageScore || 0));

                for (let i = 0; i < sortedOthers.length; i++) {
                    const quote = sortedOthers[i];
                    const rank = i < 2 ? (i + 2) as 2 | 3 : null;
                    await tx.quotation.update({
                        where: { id: quote.id },
                        data: {
                            status: i < 2 ? 'Standby' : 'Rejected',
                            rank: rank
                        }
                    });
                }

                // Award all items to the winner
                const itemIdsToAward = winningQuote.items.map(i => i.id);
                await tx.purchaseRequisition.update({
                    where: { id: requisitionId },
                    data: { awardedQuoteItemIds: itemIdsToAward }
                });

            } else if (awardStrategy === 'item') {
                console.log('[FINALIZE-SCORES] Calculating for "Best Offer (Per Item)" strategy.');

                const allItemsWithAwards = requisition.items.map(item => {
                    const bids = awards[item.id]?.rankedBids;
                    if (!bids || bids.length === 0) {
                        return { ...item, perItemAwardDetails: [] };
                    }
                    const perItemAwardDetails = bids.slice(0, 3).map((bid: any, index: number) => ({
                        rank: index + 1,
                        vendorId: bid.vendorId,
                        vendorName: bid.vendorName,
                        quotationId: bid.quotationId,
                        quoteItemId: bid.quoteItemId,
                        proposedItemName: bid.proposedItemName,
                        unitPrice: bid.unitPrice,
                        score: bid.score,
                        status: (index === 0) ? 'Pending_Award' : 'Standby'
                    }));
                    return { ...item, perItemAwardDetails };
                });

                for (const item of allItemsWithAwards) {
                    await tx.requisitionItem.update({
                        where: { id: item.id },
                        data: { perItemAwardDetails: (item.perItemAwardDetails as any) || [] }
                    });
                }
            }

            console.log('[FINALIZE-SCORES] Getting next approval step...');
            const { nextStatus, nextApproverId, auditDetails } = await getNextApprovalStep(tx, { ...requisition, totalPrice: dynamicAwardValue }, user);
            console.log(`[FINALIZE-SCORES] Next Step: Status=${nextStatus}, ApproverID=${nextApproverId}`);

            const updatedRequisition = await tx.purchaseRequisition.update({
                where: { id: requisitionId },
                data: {
                    status: nextStatus as any,
                    currentApproverId: nextApproverId,
                    awardResponseDeadline: awardResponseDeadline ? new Date(awardResponseDeadline) : undefined,
                    totalPrice: dynamicAwardValue, // Set the dynamic total price
                    rfqSettings: {
                        ...(requisition?.rfqSettings as any),
                        awardStrategy: awardStrategy,
                    }
                }
            });

            // Create the initial minute for this decision
            await tx.minute.create({
                data: {
                    requisition: { connect: { id: requisitionId } },
                    author: { connect: { id: userId } },
                    decision: 'APPROVED', // This is an approval to move forward
                    decisionBody: 'Award Finalization',
                    justification: minuteJustification || 'Official minute document uploaded.',
                    type: 'uploaded_document',
                    documentUrl: minuteDocumentUrl,
                    attendees: { connect: [] }
                }
            });

            console.log(`[FINALIZE-SCORES] Updated requisition ${requisitionId} status to ${nextStatus}.`);

            await tx.auditLog.create({
                data: {
                    user: { connect: { id: userId } },
                    timestamp: new Date(),
                    action: 'FINALIZE_AWARD',
                    entity: 'Requisition',
                    entityId: requisitionId,
                    details: auditDetails,
                    transactionId: requisitionId,
                }
            });
            console.log('[FINALIZE-SCORES] Audit log created.');

            return updatedRequisition;
        }, {
            maxWait: 15000,
            timeout: 30000,
        });

        console.log('[FINALIZE-SCORES] Transaction complete. Sending response.');
        return NextResponse.json({ message: 'Award process finalized and routed for review.', requisition: result });

    } catch (error) {
        console.error("[FINALIZE-SCORES] Failed to finalize scores and award:", error);
        if (error instanceof Error) {
            return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
        }
        return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
    }
}
