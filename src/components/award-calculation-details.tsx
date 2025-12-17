
'use client';

import React, { useMemo, useState } from 'react';
import { PurchaseRequisition, Quotation, EvaluationCriteria, QuoteItem, CommitteeScoreSet, ItemScore, Score as ScoreType } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { cn } from '@/lib/utils';
import { AlertCircle, ArrowRight, Calculator, Check, Crown, HelpCircle, Medal, Trophy, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { ScrollArea } from './ui/scroll-area';


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

        // --- Single Vendor Calculation ---
        const calculatedQuotes: CalculatedQuote[] = quotations.map(quote => {
            const itemBids: CalculatedItemBids[] = [];

            for (const reqItem of requisition.items) {
                const proposalsForItem = quote.items.filter(item => item.requisitionItemId === reqItem.id);
                if (proposalsForItem.length === 0) continue;

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

            const finalVendorScore = itemBids.length > 0
                ? itemBids.reduce((acc, bid) => acc + bid.championBid.finalItemScore, 0) / itemBids.length
                : 0;

            return {
                vendorId: quote.vendorId,
                vendorName: quote.vendorName,
                itemBids: itemBids,
                finalVendorScore,
            };
        });

        calculatedQuotes.sort((a, b) => b.finalVendorScore - a.finalVendorScore);
        calculatedQuotes.forEach((quote, index) => {
            quote.rank = index + 1;
        });

        // --- Best Item Calculation ---
        const bestItemResults = requisition.items.map(reqItem => {
            const bidsForItem = quotations.flatMap(quote => 
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
        });

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
    const { singleVendorResults, bestItemResults } = useAwardCalculations(requisition, quotations);
    const awardStrategy = (requisition.rfqSettings as any)?.awardStrategy || 'all';
    const [selectedCalculation, setSelectedCalculation] = useState<CalculatedItem | null>(null);


    if (!requisition.evaluationCriteria) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Award Calculation Details</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">Evaluation criteria not set for this requisition.</p>
                </CardContent>
            </Card>
        );
    }
    
    return (
        <Dialog onOpenChange={(isOpen) => !isOpen && setSelectedCalculation(null)}>
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
                            This report shows the calculations for both potential award strategies. The final decision was made using the strategy indicated here.
                        </AlertDescription>
                    </Alert>
                </CardContent>
            </Card>

            {/* Single Vendor Award Section */}
            <Card>
                <CardHeader>
                    <CardTitle>Strategy 1: Award All to Single Vendor</CardTitle>
                    <CardDescription>Calculates an overall score for each vendor by averaging their champion bids for each item. The vendor with the highest total score is the winner.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {singleVendorResults.map(vendor => (
                        <Card key={vendor.vendorId} className={cn(vendor.rank === 1 && "border-primary ring-2 ring-primary/50")}>
                            <CardHeader>
                                <CardTitle className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <RankIcon rank={vendor.rank!} />
                                        <span>{vendor.vendorName}</span>
                                    </div>
                                    <div className="text-right">
                                         <p className="text-2xl font-bold">{vendor.finalVendorScore.toFixed(2)}</p>
                                         <p className="text-xs text-muted-foreground">Final Score</p>
                                    </div>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {vendor.itemBids.map(itemBid => (
                                    <details key={itemBid.requisitionItemId} className="p-4 border rounded-lg bg-muted/30">
                                        <summary className="font-semibold cursor-pointer flex justify-between items-center">
                                            <span>Proposals for "{itemBid.requisitionItemName}" &rarr; Champion Bid: "{itemBid.championBid.itemName}"</span>
                                             <DialogTrigger asChild>
                                                 <Button variant="link" size="sm" onClick={(e) => {e.stopPropagation(); setSelectedCalculation(itemBid.championBid);}}>
                                                    ({itemBid.championBid.finalItemScore.toFixed(2)} pts)
                                                 </Button>
                                            </DialogTrigger>
                                        </summary>
                                        <div className="mt-4 space-y-4">
                                            {itemBid.allProposals.map(proposal => (
                                                 <Card key={proposal.quoteItemId} className={cn("p-4", proposal.quoteItemId === itemBid.championBid.quoteItemId && "border-primary")}>
                                                    <div className="flex justify-between items-center mb-4">
                                                        <h4 className="font-semibold text-base">{proposal.itemName}</h4>
                                                         <DialogTrigger asChild>
                                                             <Badge variant={proposal.quoteItemId === itemBid.championBid.quoteItemId ? "default" : "outline"} className="cursor-pointer" onClick={() => setSelectedCalculation(proposal)}>
                                                                {proposal.quoteItemId === itemBid.championBid.quoteItemId && <Check className="mr-1 h-3 w-3"/>}
                                                                Final Score: {proposal.finalItemScore.toFixed(2)}
                                                             </Badge>
                                                        </DialogTrigger>
                                                    </div>
                                                 </Card>
                                            ))}
                                        </div>
                                    </details>
                                ))}
                            </CardContent>
                        </Card>
                    ))}
                </CardContent>
            </Card>

            {/* Best Item Award Section */}
             <Card>
                <CardHeader>
                    <CardTitle>Strategy 2: Best Offer (Per Item)</CardTitle>
                    <CardDescription>Compares all vendor proposals for each individual item and selects the highest-scoring bid for each.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {bestItemResults.map(item => (
                        <Card key={item.itemName}>
                            <CardHeader>
                                 <CardTitle>Item: {item.itemName}</CardTitle>
                                 <CardDescription>Comparison of all vendor bids for this item.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Rank</TableHead>
                                            <TableHead>Vendor</TableHead>
                                            <TableHead>Proposed Item Name</TableHead>
                                            <TableHead className="text-right">Final Item Score</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {item.bids.map((bid, index) => (
                                            <TableRow key={bid.vendorName + bid.itemName} className={cn(index === 0 && "bg-green-500/10")}>
                                                <TableCell className="font-bold flex items-center gap-2"><RankIcon rank={index+1} /></TableCell>
                                                <TableCell>{bid.vendorName}</TableCell>
                                                <TableCell>{bid.itemName}</TableCell>
                                                <TableCell className="text-right">
                                                    <DialogTrigger asChild>
                                                         <Button variant="link" size="sm" onClick={() => setSelectedCalculation(bid.calculation)}>
                                                            {bid.calculation.finalItemScore.toFixed(2)}
                                                         </Button>
                                                    </DialogTrigger>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                                {item.winner && 
                                    <div className="mt-4 p-3 bg-primary/10 rounded-md text-center">
                                        <p className="font-semibold">Winner for this item: <span className="text-primary">{item.winner.vendorName}</span></p>
                                    </div>
                                }
                            </CardContent>
                        </Card>
                    ))}
                </CardContent>
            </Card>
             {selectedCalculation && requisition.evaluationCriteria && (
                <ScoreBreakdownDialog calculation={selectedCalculation} evaluationCriteria={requisition.evaluationCriteria} />
            )}
        </div>
        </Dialog>
    )
}

    