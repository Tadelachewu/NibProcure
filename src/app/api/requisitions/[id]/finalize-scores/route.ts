
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { User, UserRole, PerItemAwardDetail, QuoteItem, Quotation, EvaluationCriteria } from '@/lib/types';
import { getNextApprovalStep } from '@/services/award-service';
import { getActorFromToken, isActorAuthorizedForRequisition } from '@/lib/auth';

function calculateItemScoreForVendor(
    quote: Quotation & { items: QuoteItem[], scores: any[] },
    reqItem: { id: string },
    evaluationCriteria: EvaluationCriteria
): { championBid: QuoteItem | null, championScore: number } {
    // Choose the lowest-priced compliant proposal for this requisition item from the given quote
    // NOTE: nonCompliantSet is injected via closure in award logic below
    const proposalsForItem = quote.items.filter(item => item.requisitionItemId === reqItem.id && (!globalThis.nonCompliantSet || !globalThis.nonCompliantSet.has(item.id)));
    if (proposalsForItem.length === 0) {
        return { championBid: null, championScore: 0 };
    }

    let championBid: QuoteItem | null = null;
    let lowestPrice = Number.POSITIVE_INFINITY;

    for (const proposal of proposalsForItem) {
        const price = proposal.unitPrice || Number.POSITIVE_INFINITY;
        if (price < lowestPrice) {
            lowestPrice = price;
            championBid = proposal;
        }
    }

    // championScore is no longer meaningful for price-based selection; set to 0 for compatibility
    return { championBid, championScore: 0 };
}


export async function POST(request: Request, context: { params: any }) {
    const actor = await getActorFromToken(request);
    if (!actor) {
        return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
    }

    const params = await context.params;
    const requisitionId = params?.id as string | undefined;
    if (!requisitionId || typeof requisitionId !== 'string') {
        console.error('POST /app/api/requisitions/[id]/finalize-scores missing or invalid id', { method: request.method, url: (request as any).url, params });
        return NextResponse.json({ error: 'Missing or invalid id' }, { status: 400 });
    }
    console.log(`[FINALIZE-SCORES] Received request for requisition: ${requisitionId}`);
    try {
        const body = await request.json();
        const { awards, awardStrategy, awardResponseDeadline, minuteDocumentUrl, minuteJustification } = body;
        console.log(`[FINALIZE-SCORES] Action by User ID: ${actor.id}, Strategy: ${awardStrategy}`);

        if (!minuteDocumentUrl) {
            return NextResponse.json({ error: "The official minute document is required to proceed." }, { status: 400 });
        }

        const isAuthorized = await isActorAuthorizedForRequisition(actor, requisitionId as string);
        if (!isAuthorized) {
            console.error(`[FINALIZE-SCORES] User ${actor.id} is not authorized to finalize scores for requisition ${requisitionId}.`);
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        console.log('[FINALIZE-SCORES] Starting transaction...');
        const result = await prisma.$transaction(async (tx) => {

            const requisition = await tx.purchaseRequisition.findUnique({
                where: { id: requisitionId },
                include: {
                    items: true,
                    evaluationCriteria: { include: { financialCriteria: true, technicalCriteria: true } },
                    quotations: { include: { scores: { include: { itemScores: true } }, items: true } }
                }
            });
            if (!requisition || !requisition.evaluationCriteria) {
                throw new Error("Requisition or its evaluation criteria not found.");
            }

            const allQuotes = requisition.quotations;

            if (allQuotes.length === 0) {
                throw new Error("No quotes found to process for this requisition.");
            }

            // Determine whether this requisition requires compliance checks. Default to true for compatibility.
            const needsCompliance = (requisition.rfqSettings as any)?.needsCompliance ?? true;

            // Determine quote items that have been marked non-compliant by committee checks (only if required).
            const nonCompliantSet = new Set<string>();
            let itemsWithCompliantBids: string[] = [];
            let itemsWithoutCompliantBids: string[] = [];
            if (needsCompliance) {
                const allQuoteItemIds = allQuotes.flatMap(q => (q.items || []).map((i: any) => i.id));
                if (allQuoteItemIds.length > 0) {
                    const badCompliances = await tx.itemCompliance.findMany({ where: { quoteItemId: { in: allQuoteItemIds }, comply: false } });
                    for (const bs of badCompliances) {
                        if (bs.quoteItemId) nonCompliantSet.add(bs.quoteItemId);
                    }
                }

                for (const reqItem of requisition.items) {
                    const hasCompliant = allQuotes.some(q => (q.items || []).some((it: any) => it.requisitionItemId === reqItem.id && !nonCompliantSet.has(it.id)));
                    if (hasCompliant) {
                        itemsWithCompliantBids.push(reqItem.id);
                    } else {
                        itemsWithoutCompliantBids.push(reqItem.id);
                    }
                }

                // If all items have no compliant bids, reset requisition to RFQ status and exit
                if (itemsWithCompliantBids.length === 0 && itemsWithoutCompliantBids.length > 0) {
                    const updatedReq = await tx.purchaseRequisition.update({
                        where: { id: requisitionId },
                        data: { status: 'PreApproved' }
                    });
                    for (const itemId of itemsWithoutCompliantBids) {
                        await tx.requisitionItem.update({ where: { id: itemId }, data: { perItemAwardDetails: [] } });
                    }
                    return { reset: true, message: 'All items have no compliant bids. Requisition reset to PreApproved for re-bidding.', requisition: updatedReq };
                }

                // For items with no compliant bids, reset them for re-bidding
                if (itemsWithoutCompliantBids.length > 0) {
                    // Gather data for new requisition
                    const itemsToRebid = requisition.items.filter(item => itemsWithoutCompliantBids.includes(item.id));
                    // Create new requisition with same data but only the items to re-bid
                    const newReq = await tx.purchaseRequisition.create({
                        data: {
                            title: requisition.title + ' (Rebid)',
                            description: requisition.description,
                            departmentId: requisition.departmentId,
                            createdById: actor.id,
                            status: 'PreApproved',
                            rfqSettings: requisition.rfqSettings,
                            items: {
                                create: itemsToRebid.map(item => ({
                                    name: item.name,
                                    quantity: item.quantity,
                                    unit: item.unit,
                                    description: item.description,
                                    // Add other fields as needed
                                }))
                            },
                            // Copy other relevant fields as needed
                        }
                    });
                    for (const itemId of itemsWithoutCompliantBids) {
                        await tx.requisitionItem.update({ where: { id: itemId }, data: { perItemAwardDetails: [] } });
                    }
                }
            }

            // --- SERVER-SIDE VALUE CALCULATION ---
            let totalAwardValue = 0;
            if (awardStrategy === 'all') {
                const winningVendorId = Object.keys(awards)[0];
                const winnerQuote = allQuotes.find(q => q.vendorId === winningVendorId);

                if (winnerQuote && requisition.evaluationCriteria) {
                    totalAwardValue = requisition.items.reduce((sum, reqItem) => {
                        const { championBid } = calculateItemScoreForVendor(winnerQuote, reqItem, requisition.evaluationCriteria!);
                        if (championBid) {
                            return sum + (championBid.unitPrice * championBid.quantity);
                        }
                        return sum;
                    }, 0);
                }

            } else if (awardStrategy === 'item') {
                const winningQuoteItemIds = Object.values(awards).map((award: any) => award.rankedBids[0].quoteItemId);

                const winningQuoteItems = await tx.quoteItem.findMany({
                    where: { id: { in: winningQuoteItemIds } }
                });

                totalAwardValue = winningQuoteItems.reduce((sum, item) => {
                    const requisitionItem = requisition.items.find(ri => ri.id === item.requisitionItemId);
                    return sum + (item.unitPrice * (requisitionItem?.quantity || 0));
                }, 0);
            }
            // --- END CALCULATION ---


            const dynamicAwardValue = totalAwardValue;

            if (awardStrategy === 'all') {
                console.log('[FINALIZE-SCORES] Calculating for "Award All to Single Vendor" strategy.');
                const requestedWinnerVendorId = Object.keys(awards)[0];

                // Determine which quotes have compliant champion bids for every requisition item
                const compliantQuotes = allQuotes.filter(q => {
                    // Only select champion bids that are compliant
                    const championBids = requisition.items.map(reqItem => {
                        // Inject nonCompliantSet into global scope for filtering
                        globalThis.nonCompliantSet = nonCompliantSet;
                        return calculateItemScoreForVendor(q, reqItem, requisition.evaluationCriteria!).championBid;
                    }).filter(Boolean) as QuoteItem[];
                    if (championBids.length !== requisition.items.length) return false;
                    return championBids.every(cb => cb && !nonCompliantSet.has(cb.id));
                });

                if (compliantQuotes.length === 0) {
                    throw new Error('No vendor is compliant for all champion bids. Cannot award all to a single vendor.');
                }

                // Choose winner: prefer requested winner if compliant, otherwise lowest totalPrice among compliant vendors
                let winningQuote = compliantQuotes.find(q => q.vendorId === requestedWinnerVendorId) || compliantQuotes.sort((a, b) => (a.totalPrice || 0) - (b.totalPrice || 0))[0];

                // Mark winning quote
                await tx.quotation.update({ where: { id: winningQuote.id }, data: { status: 'Pending_Award', rank: 1 } });

                // Other compliant quotes become standby/rejected by price; non-compliant quotes are rejected
                const compliantOthers = compliantQuotes.filter(q => q.id !== winningQuote.id).sort((a, b) => (a.totalPrice || 0) - (b.totalPrice || 0));
                for (let i = 0; i < compliantOthers.length; i++) {
                    const quote = compliantOthers[i];
                    const rank = i < 2 ? (i + 2) as 2 | 3 : null;
                    await tx.quotation.update({ where: { id: quote.id }, data: { status: i < 2 ? 'Standby' : 'Rejected', rank } });
                }

                // Explicitly reject any quote that isn't fully compliant
                const nonCompliantQuotes = allQuotes.filter(q => !compliantQuotes.some(cq => cq.id === q.id));
                for (const nq of nonCompliantQuotes) {
                    await tx.quotation.update({ where: { id: nq.id }, data: { status: 'Rejected', rank: null } });
                }

                // Award champion bids from the winning quote (winningQuote is fully compliant)
                // Only award compliant champion bids
                const championBids = requisition.items.map(reqItem => {
                    globalThis.nonCompliantSet = nonCompliantSet;
                    return calculateItemScoreForVendor(winningQuote, reqItem, requisition.evaluationCriteria!).championBid;
                }).filter(Boolean) as QuoteItem[];
                const itemIdsToAward = championBids.map(i => i.id);

                await tx.purchaseRequisition.update({ where: { id: requisitionId }, data: { awardedQuoteItemIds: itemIdsToAward } });

            } else if (awardStrategy === 'item') {
                console.log('[FINALIZE-SCORES] Calculating for "Best Offer (Per Item)" strategy.');

                // Server-driven per-item least-price selection (champion bids)
                let computedTotal = 0;
                const itemIdsToAward: string[] = [];

                for (const reqItem of requisition.items) {
                    // Gather all quote items for this requisition item across all quotations
                    const allBidsForItem: Array<any> = [];
                    for (const q of allQuotes) {
                        // Only include compliant bids
                        const bids = (q.items || []).filter((it: any) => it.requisitionItemId === reqItem.id && !nonCompliantSet.has(it.id));
                        for (const b of bids) {
                            allBidsForItem.push({
                                quoteItemId: b.id,
                                unitPrice: b.unitPrice,
                                quantity: b.quantity,
                                vendorId: q.vendorId,
                                vendorName: q.vendorName,
                                quotationId: q.id,
                                proposedItemName: b.name,
                                score: 0,
                            });
                        }
                    }

                    // Sort by lowest unitPrice (least-price wins)
                    allBidsForItem.sort((a, b) => (a.unitPrice || 0) - (b.unitPrice || 0));

                    const topBids = allBidsForItem.slice(0, 3);

                    const perItemAwardDetails = topBids.map((bid: any, index: number) => ({
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

                    // Persist per-item award details for this requisition item
                    await tx.requisitionItem.update({
                        where: { id: reqItem.id },
                        data: { perItemAwardDetails: perItemAwardDetails as any }
                    });

                    // Add the top bid's value to total award value (if exists)
                    if (topBids.length > 0) {
                        const top = topBids[0];
                        itemIdsToAward.push(top.quoteItemId);
                        computedTotal += (top.unitPrice || 0) * (reqItem.quantity || 0);
                    }
                }

                totalAwardValue = computedTotal;

                // Persist the list of awarded quote item ids for downstream processing
                if (itemIdsToAward.length > 0) {
                    await tx.purchaseRequisition.update({ where: { id: requisitionId }, data: { awardedQuoteItemIds: itemIdsToAward } });
                }
            }

            console.log('[FINALIZE-SCORES] Getting next approval step...');
            const { nextStatus, nextApproverId, auditDetails } = await getNextApprovalStep(tx, { ...requisition, totalPrice: dynamicAwardValue }, actor);
            console.log(`[FINALIZE-SCORES] Next Step: Status=${nextStatus}, ApproverID=${nextApproverId}`);

            const updatedRequisition = await tx.purchaseRequisition.update({
                where: { id: requisitionId },
                data: {
                    status: nextStatus as any,
                    currentApproverId: nextApproverId,
                    awardResponseDeadline: awardResponseDeadline ? new Date(awardResponseDeadline) : undefined,
                    totalPrice: dynamicAwardValue,
                    rfqSettings: {
                        ...(requisition?.rfqSettings as any),
                        awardStrategy: awardStrategy,
                    }
                }
            });

            await tx.minute.create({
                data: {
                    requisition: { connect: { id: requisitionId } },
                    author: { connect: { id: actor.id } },
                    decision: 'APPROVED',
                    decisionBody: 'Award Finalization',
                    justification: minuteJustification || 'Official minute document for award finalization.',
                    type: 'uploaded_document',
                    documentUrl: minuteDocumentUrl,
                }
            });

            console.log(`[FINALIZE-SCORES] Updated requisition ${requisitionId} status to ${nextStatus}.`);

            await tx.auditLog.create({
                data: {
                    user: { connect: { id: actor.id } },
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
