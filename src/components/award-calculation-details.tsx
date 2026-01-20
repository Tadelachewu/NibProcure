"use client";

import React, { useMemo } from 'react';
import { PurchaseRequisition, Quotation } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { cn } from '@/lib/utils';
import { AlertCircle, Calculator } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { ScrollArea } from './ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';


// --- TYPE DEFINITIONS ---
interface RawScoreDetail {
    criterionId: string;
    criterionName: string;
    scorer: { id: string; name: string };
    score: number;
    comment?: string;
}

interface CalculatedScore {
    criterionId: string;
    criterionName: string;
    weight: number;
    // New properties for detailed breakdown
    averageScore: number;
    weightedScore: number;
    rawScores: RawScoreDetail[];
}
interface CalculatedItem {
    quoteItemId: string;
    itemName: string;
    financialScores: CalculatedScore[];
    technicalScores: CalculatedScore[];
    totalFinancialScore: number;
    totalTechnicalScore: number;
    finalItemScore: number;
}

interface CalculatedItemBids {
    requisitionItemId: string;
    requisitionItemName: string;
    allProposals: CalculatedItem[];
    championBid: CalculatedItem;
}

interface CalculatedQuote {
    vendorId: string;
    vendorName: string;
    itemBids: CalculatedItemBids[];
    finalVendorScore: number;
    rank?: number;
}


// --- CALCULATION HELPERS ---

/**
 * Calculates the score for a single criterion, including raw scores from each scorer.
 */
function calculateCriterionScore(
    criterion: { id: string; name: string; weight: number },
    allItemScores: (ItemScore & { scoreSet: CommitteeScoreSet & { scorer: {id: string, name: string}} })[]
): CalculatedScore {

    const rawScores: RawScoreDetail[] = [];
    let totalScore = 0;
    let scorerCount = 0;

    allItemScores.forEach(itemScore => {
        const scoreEntry = (itemScore.scores as ScoreType[]).find(s => s.financialCriterionId === criterion.id || s.technicalCriterionId === criterion.id);
        if (scoreEntry) {
            rawScores.push({
                criterionId: criterion.id,
                criterionName: criterion.name,
                scorer: { id: itemScore.scoreSet.scorerId, name: itemScore.scoreSet.scorer.name },
                score: scoreEntry.score,
                comment: scoreEntry.comment,
            });
            totalScore += scoreEntry.score;
            scorerCount++;
        }
    });

    const averageScore = scorerCount > 0 ? totalScore / scorerCount : 0;

    return {
        criterionId: criterion.id,
        criterionName: criterion.name,
        weight: criterion.weight,
        averageScore,
        weightedScore: averageScore * (criterion.weight / 100),
        rawScores,
    };
}


/**
 * Calculates all scores for a single quote item, now including raw score details.
 */
function calculateItemScores(
    quoteItem: QuoteItem,
    evaluationCriteria: EvaluationCriteria,
    allScoreSetsForQuote: (CommitteeScoreSet & { scorer: {id: string, name: string}, itemScores: (ItemScore & { scores: ScoreType[] })[]})[]
): CalculatedItem {

    // Get all ItemScore records for this specific quoteItem across all scorers
    const relevantItemScores = allScoreSetsForQuote.map(scoreSet => {
        const itemScore = scoreSet.itemScores.find(is => is.quoteItemId === quoteItem.id);
        return itemScore ? { ...itemScore, scoreSet: { ...scoreSet } } : null;
    }).filter((is): is is (ItemScore & { scoreSet: CommitteeScoreSet & { scorer: {id: string, name: string}} }) => is !== null);
    
    const financialScores = evaluationCriteria.financialCriteria.map(c => calculateCriterionScore(c, relevantItemScores));
    const technicalScores = evaluationCriteria.technicalCriteria.map(c => calculateCriterionScore(c, relevantItemScores));
    
    const totalFinancialScore = financialScores.reduce((acc, s) => acc + s.weightedScore, 0);
    const totalTechnicalScore = technicalScores.reduce((acc, s) => acc + s.weightedScore, 0);

    const finalItemScore = 
        (totalFinancialScore * (evaluationCriteria.financialWeight / 100)) +
        (totalTechnicalScore * (evaluationCriteria.technicalWeight / 100));

    return {
        quoteItemId: quoteItem.id,
        itemName: quoteItem.name,
        financialScores,
        technicalScores,
        totalFinancialScore,
        totalTechnicalScore,
        finalItemScore,
    };
}


/**
 * Main calculation logic for the component.
 */
function useAwardCalculations(requisition: PurchaseRequisition, quotations: Quotation[]) {
    return useMemo(() => {
        if (!requisition.evaluationCriteria || quotations.length === 0) {
            return { singleVendorResults: [], bestItemResults: [] };
        }

        const evaluationCriteria = requisition.evaluationCriteria;
        // Get all non-compliant item IDs (from perItemAwardDetails or compliance data)
        const nonCompliantItemIds = new Set(
            requisition.items
                .filter(item => Array.isArray(item.perItemAwardDetails) && item.perItemAwardDetails.length === 0)
                .map(item => item.id)
        );

            // --- Single Vendor Calculation (only fully compliant vendors) ---
            // First, determine the set of compliant requisition item IDs
            const compliantItemIds = requisition.items.filter(item => !nonCompliantItemIds.has(item.id)).map(item => item.id);
            const calculatedQuotes: CalculatedQuote[] = quotations.map(quote => {
                const itemBids: CalculatedItemBids[] = [];
                let hasAllCompliant = true;
                for (const reqItemId of compliantItemIds) {
                    const reqItem = requisition.items.find(i => i.id === reqItemId);
                    if (!reqItem) continue;
                    const proposalsForItem = quote.items.filter(item => item.requisitionItemId === reqItem.id);
                    if (proposalsForItem.length === 0) {
                        hasAllCompliant = false;
                        break;
                    }
                    const calculatedProposals = proposalsForItem.map(proposal => 
                        calculateItemScores(proposal, evaluationCriteria, (quote.scores as any[]) || [])
                    );
                    const championBid = [...calculatedProposals].sort((a, b) => b.finalItemScore - a.finalItemScore)[0];
                    itemBids.push({
                        requisitionItemId: reqItem.id,
                        requisitionItemName: reqItem.name,
                        allProposals: calculatedProposals,
                        championBid: championBid
                    });
                }
                // Only include vendors who have a compliant bid for every compliant item
                if (!hasAllCompliant || itemBids.length !== compliantItemIds.length) {
                    return null;
                }
                const finalVendorScore = itemBids.length > 0
                    ? itemBids.reduce((acc, bid) => acc + bid.championBid.finalItemScore, 0) / itemBids.length
                    : 0;
                return {
                    vendorId: quote.vendorId,
                    vendorName: quote.vendorName,
                    itemBids: itemBids,
                    finalVendorScore,
                };
            }).filter(Boolean) as CalculatedQuote[];
            calculatedQuotes.sort((a, b) => b.finalVendorScore - a.finalVendorScore);
            calculatedQuotes.forEach((quote, index) => {
                quote.rank = index + 1;
        });

        // --- Best Item Calculation (only compliant items) ---
            const bestItemResults = compliantItemIds.map(reqItemId => {
                const reqItem = requisition.items.find(i => i.id === reqItemId);
                if (!reqItem) return null;
                // Only consider vendors who have a compliant bid for every compliant item
                const eligibleQuotations = quotations.filter(quote =>
                    compliantItemIds.every(cid => quote.items.some(item => item.requisitionItemId === cid))
                );
                const bidsForItem = eligibleQuotations.flatMap(quote =>
                    quote.items
                        .filter(item => item.requisitionItemId === reqItem.id)
                        .map(item => ({
                            vendorName: quote.vendorName,
                            quoteItemId: item.id,
                            itemName: item.name,
                            calculation: calculateItemScores(item, evaluationCriteria, (quote.scores as any[]) || [])
                        }))
                ).sort((a,b) => b.calculation.finalItemScore - a.calculation.finalItemScore);
                return {
                    itemName: reqItem.name,
                    bids: bidsForItem,
                    winner: bidsForItem[0]
                };
            }).filter(Boolean);
        return { singleVendorResults: calculatedQuotes, bestItemResults };

    }, [requisition, quotations]);
}

// --- UI COMPONENTS ---
const RawScoresTable = ({ scores, title }: { scores: RawScoreDetail[], title: string }) => (
    <div className="space-y-1">
        <h5 className="font-semibold text-xs">{title}</h5>
        <div className="border rounded-md bg-muted/30">
        <Table>
            <TableBody>
            {scores.map((s, i) => (
                <TableRow key={`${s.scorer.id}-${i}`}>
                    <TableCell className="p-2">
                        <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                                <AvatarImage src={`https://picsum.photos/seed/${s.scorer.id}/24/24`} />
                                <AvatarFallback>{s.scorer.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <span className="text-xs font-medium">{s.scorer.name}</span>
                        </div>
                    </TableCell>
                    <TableCell className="p-2 text-right font-mono text-xs">{s.score}/100</TableCell>
                    <TableCell className="p-2 text-xs italic text-muted-foreground">"{s.comment || 'No comment'}"</TableCell>
                </TableRow>
            ))}
            </TableBody>
        </Table>
        </div>
    </div>
);


const ScoreBreakdownDialog = ({ calculation, evaluationCriteria }: { calculation: CalculatedItem, evaluationCriteria: EvaluationCriteria }) => {
    return (
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
            <DialogHeader>
                <DialogTitle>Score Breakdown: {calculation.itemName}</DialogTitle>
                <DialogDescription>
                    This shows how the final score of <span className="font-bold text-primary">{calculation.finalItemScore.toFixed(2)}</span> was calculated from raw committee scores.
                </DialogDescription>
            </DialogHeader>
            <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-6 py-4">
                 <ScoreTable title="Financial Evaluation" scores={calculation.financialScores} weight={evaluationCriteria.financialWeight} totalScore={calculation.totalFinancialScore} />
                 <ScoreTable title="Technical Evaluation" scores={calculation.technicalScores} weight={evaluationCriteria.technicalWeight} totalScore={calculation.totalTechnicalScore} />
                 <Separator />
                <div className="p-4 bg-muted rounded-md text-center">
                    <p className="text-sm text-muted-foreground">Final Calculation</p>
                    <p className="text-lg">
                        (<span className="font-mono">{calculation.totalFinancialScore.toFixed(2)}</span> &times; {evaluationCriteria.financialWeight}%) + (<span className="font-mono">{calculation.totalTechnicalScore.toFixed(2)}</span> &times; {evaluationCriteria.technicalWeight}%) = <span className="font-bold text-xl text-primary">{calculation.finalItemScore.toFixed(2)}</span>
                    </p>
                </div>
            </div>
            </ScrollArea>
            <DialogFooter>
                <Button variant="outline" asChild><DialogClose>Close</DialogClose></Button>
            </DialogFooter>
        </DialogContent>
    )
}

const ScoreTable = ({ title, scores, weight, totalScore }: { title: string, scores: CalculatedScore[], weight: number, totalScore: number }) => (
    <div>
        <h4 className="font-semibold text-base mb-2">{title} (Overall Weight: {weight}%)</h4>
        <div className="space-y-4">
            {scores.map(s => (
                <details key={s.criterionId} className="p-3 border rounded-lg bg-muted/50 open:bg-background open:ring-1 open:ring-border">
                    <summary className="font-medium text-sm cursor-pointer flex justify-between items-center">
                        <span>{s.criterionName} (Criterion Weight: {s.weight}%)</span>
                        <span className="font-mono text-base">Avg. Score: {s.averageScore.toFixed(2)}</span>
                    </summary>
                    <div className="mt-4 pl-4 border-l-2">
                        <RawScoresTable scores={s.rawScores} title="Raw Scores" />
                         <p className="text-right text-xs mt-2 pr-2">
                            Weighted Score: {s.averageScore.toFixed(2)} &times; {s.weight}% = <span className="font-bold">{s.weightedScore.toFixed(2)}</span>
                         </p>
                    </div>
                </details>
            ))}
        </div>
        <div className="text-right mt-2 pr-4">
            <p className="text-sm">Sub-total (Score &times; Weight): <span className="font-bold font-mono">{totalScore.toFixed(2)}</span></p>
        </div>
    </div>
);


const RankIcon = ({ rank }: { rank: number }) => {
    switch (rank) {
        case 1: return <Crown className="h-5 w-5 text-amber-400" />;
        case 2: return <Trophy className="h-5 w-5 text-slate-400" />;
        case 3: return <Medal className="h-5 w-5 text-amber-600" />;
        default: return <span className="font-bold">{rank}</span>;
    }
};

// --- MAIN COMPONENT ---
export function AwardCalculationDetails({ requisition, quotations }: { requisition: PurchaseRequisition, quotations: Quotation[] }) {
    const { singleVendorResults, bestItemResults } = (function usePriceCalculations(requisition: PurchaseRequisition, quotations: Quotation[]) {
        // Get all non-compliant item IDs (from perItemAwardDetails or compliance data)
        const nonCompliantItemIds = new Set(
            requisition.items
                .filter(item => Array.isArray(item.perItemAwardDetails) && item.perItemAwardDetails.length === 0)
                .map(item => item.id)
        );

        // --- Price-based: Only vendors with compliant bids for every compliant item ---
        const compliantItemIdsPrice = requisition.items.filter(item => !nonCompliantItemIds.has(item.id)).map(item => item.id);
        const singleVendorResults = quotations.map(q => {
            let total = 0;
            let hasAllCompliant = true;
            for (const reqItemId of compliantItemIdsPrice) {
                const reqItem = requisition.items.find(i => i.id === reqItemId);
                if (!reqItem) continue;
                const proposals = q.items.filter(i => i.requisitionItemId === reqItem.id);
                if (!proposals || proposals.length === 0) {
                    hasAllCompliant = false;
                    break;
                }
                const lowest = proposals.reduce((min, p) => p.unitPrice < min ? p.unitPrice : min, Number.POSITIVE_INFINITY as number);
                total += lowest * reqItem.quantity;
            }
            if (!hasAllCompliant) return null;
            return { vendorId: q.vendorId, vendorName: q.vendorName, totalPrice: total };
        }).filter(Boolean).sort((a,b) => a.totalPrice - b.totalPrice);
        singleVendorResults.forEach((r, idx) => (r as any).rank = idx + 1);

        // Best Item Calculation: only compliant items
        const bestItemResults = requisition.items.filter(item => !nonCompliantItemIds.has(item.id)).map(reqItem => {
            const bids = quotations.flatMap(q => q.items.filter(i => i.requisitionItemId === reqItem.id).map(i => ({
                vendorName: q.vendorName,
                quoteItemId: i.id,
                proposedItemName: i.name,
                unitPrice: i.unitPrice,
                totalPrice: i.unitPrice * reqItem.quantity
            })));
            const sorted = bids.sort((a,b) => a.unitPrice - b.unitPrice);
            return { itemName: reqItem.name, bids: sorted, winner: sorted[0] };
        });

        return { singleVendorResults, bestItemResults };
    })(requisition, quotations);
    const awardStrategy = (requisition.rfqSettings as any)?.awardStrategy || 'all';

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Calculator /> Award Calculation Details</CardTitle>
                    <CardDescription>
                        A transparent breakdown of how the award was calculated for requisition: <span className="font-semibold">{requisition.title}</span>.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                     <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Award Strategy Used: {awardStrategy === 'item' ? 'Best Offer (Per Item)' : 'Award All to Single Vendor'}</AlertTitle>
                        <AlertDescription>
                            This report shows price-based calculations (least-price wins). All scoring breakdowns have been removed.
                        </AlertDescription>
                    </Alert>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Strategy 1: Award All to Single Vendor</CardTitle>
                    <CardDescription>Summed lowest vendor bids across requisition items. Lowest total price wins.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Rank</TableHead>
                                <TableHead>Vendor</TableHead>
                                <TableHead className="text-right">Total Price</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {singleVendorResults.map((v: any) => (
                                <TableRow key={v.vendorId} className={cn(v.rank === 1 && "bg-green-500/10")}>
                                    <TableCell className="font-bold">{v.rank}</TableCell>
                                    <TableCell>{v.vendorName}</TableCell>
                                    <TableCell className="text-right font-mono">{v.totalPrice.toLocaleString()} ETB</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Strategy 2: Best Offer (Per Item)</CardTitle>
                    <CardDescription>For each item, the vendor with the lowest unit price is the winner.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Accordion type="multiple" className="space-y-4">
                        {bestItemResults.map((item: any) => (
                            <AccordionItem value={item.itemName} key={item.itemName}>
                                <AccordionTrigger className="font-semibold bg-muted/50 px-4 rounded-md">
                                    {item.itemName} &rarr; Winner: {item.winner?.vendorName || 'N/A'} ({item.winner ? item.winner.unitPrice.toFixed(2) + ' ETB' : 'N/A'})
                                </AccordionTrigger>
                                <AccordionContent className="pt-4">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Rank</TableHead>
                                                <TableHead>Vendor</TableHead>
                                                <TableHead>Proposed Item</TableHead>
                                                <TableHead className="text-right">Unit Price</TableHead>
                                                <TableHead className="text-right">Total</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {item.bids.map((bid: any, index: number) => (
                                                <TableRow key={bid.vendorName + bid.proposedItemName} className={cn(index === 0 && "bg-green-500/10")}>
                                                    <TableCell className="font-bold">{index+1}</TableCell>
                                                    <TableCell>{bid.vendorName}</TableCell>
                                                    <TableCell>{bid.proposedItemName}</TableCell>
                                                    <TableCell className="text-right font-mono">{bid.unitPrice.toFixed(2)} ETB</TableCell>
                                                    <TableCell className="text-right font-mono">{bid.totalPrice.toLocaleString()} ETB</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </CardContent>
            </Card>
        </div>
    );
}
