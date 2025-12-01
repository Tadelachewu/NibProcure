

'use client';

import React, { useMemo, useState } from 'react';
import { PurchaseRequisition, Quotation, EvaluationCriteria, QuoteItem } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { cn } from '@/lib/utils';
import { AlertCircle, ArrowRight, Calculator, Check, Crown, HelpCircle, Medal, Trophy, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Button } from './ui/button';


// --- TYPE DEFINITIONS ---
interface CalculatedScore {
    criterionId: string;
    criterionName: string;
    score: number;
    weight: number;
    weightedScore: number;
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
 * Calculates the score for a single criterion.
 */
function calculateCriterionScore(
    criterion: { id: string; name: string; weight: number },
    scores: { criterionId: string, score: number }[]
): CalculatedScore {
    const foundScore = scores.find(s => s.criterionId === criterion.id);
    const score = foundScore?.score || 0;
    return {
        criterionId: criterion.id,
        criterionName: criterion.name,
        score,
        weight: criterion.weight,
        weightedScore: score * (criterion.weight / 100),
    };
}

/**
 * Calculates all scores for a single quote item.
 */
function calculateItemScores(
    quoteItem: QuoteItem,
    evaluationCriteria: EvaluationCriteria,
    scores: any[] // From Prisma: CommitteeScoreSet with nested scores
): CalculatedItem {
    const allFinancialScores: { [key: string]: number[] } = {};
    const allTechnicalScores: { [key: string]: number[] } = {};

    scores.forEach(scoreSet => {
        const itemScore = scoreSet.itemScores.find((is: any) => is.quoteItemId === quoteItem.id);
        if (itemScore) {
            itemScore.scores.forEach((s: any) => {
                if (s.type === 'FINANCIAL' && s.financialCriterionId) {
                    if (!allFinancialScores[s.financialCriterionId]) allFinancialScores[s.financialCriterionId] = [];
                    allFinancialScores[s.financialCriterionId].push(s.score);
                } else if (s.type === 'TECHNICAL' && s.technicalCriterionId) {
                    if (!allTechnicalScores[s.technicalCriterionId]) allTechnicalScores[s.technicalCriterionId] = [];
                    allTechnicalScores[s.technicalCriterionId].push(s.score);
                }
            });
        }
    });

    const avgScores = (scoreMap: { [key: string]: number[] }) => {
        return Object.entries(scoreMap).map(([criterionId, scores]) => ({
            criterionId,
            score: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
        }));
    };
    
    const financialScores = evaluationCriteria.financialCriteria.map(c => calculateCriterionScore(c, avgScores(allFinancialScores)));
    const technicalScores = evaluationCriteria.technicalCriteria.map(c => calculateCriterionScore(c, avgScores(allTechnicalScores)));
    
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
                    calculateItemScores(proposal, evaluationCriteria, quote.scores || [])
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
                        calculation: calculateItemScores(item, evaluationCriteria, quote.scores || [])
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

export const ScoreBreakdownDialog = ({ calculation, evaluationCriteria, isOpen, onClose }: { calculation: CalculatedItem, evaluationCriteria: EvaluationCriteria, isOpen: boolean, onClose: () => void }) => {
    return (
         <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Score Breakdown: {calculation.itemName}</DialogTitle>
                    <DialogDescription>
                        This shows how the final score of <span className="font-bold text-primary">{calculation.finalItemScore.toFixed(2)}</span> was calculated.
                    </DialogDescription>
                </DialogHeader>
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
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

const ScoreTable = ({ title, scores, weight, totalScore }: { title: string, scores: CalculatedScore[], weight: number, totalScore: number }) => (
    <div>
        <h4 className="font-semibold text-base mb-1">{title} (Overall Weight: {weight}%)</h4>
        <div className="border rounded-md">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Criterion</TableHead>
                        <TableHead className="text-right">Avg. Score</TableHead>
                        <TableHead className="text-right">Weight</TableHead>
                        <TableHead className="text-right">Weighted Score</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {scores.map(s => (
                        <TableRow key={s.criterionId}>
                            <TableCell>{s.criterionName}</TableCell>
                            <TableCell className="text-right font-mono">{s.score.toFixed(2)}</TableCell>
                            <TableCell className="text-right font-mono">{s.weight}%</TableCell>
                            <TableCell className="text-right font-mono font-bold">{s.weightedScore.toFixed(2)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
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
                                    <Button variant={vendor.rank === 1 ? 'default' : 'secondary'} size="sm" onClick={() => setSelectedCalculation(vendor.itemBids.flatMap(b => b.allProposals)[0])}>
                                        Final Score: {vendor.finalVendorScore.toFixed(2)}
                                    </Button>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {vendor.itemBids.map(itemBid => (
                                    <details key={itemBid.requisitionItemId} className="p-4 border rounded-lg bg-muted/30">
                                        <summary className="font-semibold cursor-pointer flex justify-between items-center">
                                            <span>Proposals for "{itemBid.requisitionItemName}" &rarr; Champion Bid: "{itemBid.championBid.itemName}"</span>
                                            <Button variant="link" size="sm" onClick={(e) => {e.stopPropagation(); setSelectedCalculation(itemBid.championBid);}}>
                                                ({itemBid.championBid.finalItemScore.toFixed(2)} pts)
                                            </Button>
                                        </summary>
                                        <div className="mt-4 space-y-4">
                                            {itemBid.allProposals.map(proposal => (
                                                 <Card key={proposal.quoteItemId} className={cn("p-4", proposal.quoteItemId === itemBid.championBid.quoteItemId && "border-primary")}>
                                                    <div className="flex justify-between items-center mb-4">
                                                        <h4 className="font-semibold text-base">{proposal.itemName}</h4>
                                                         <Badge variant={proposal.quoteItemId === itemBid.championBid.quoteItemId ? "default" : "outline"} className="cursor-pointer" onClick={() => setSelectedCalculation(proposal)}>
                                                            {proposal.quoteItemId === itemBid.championBid.quoteItemId && <Check className="mr-1 h-3 w-3"/>}
                                                            Final Score: {proposal.finalItemScore.toFixed(2)}
                                                         </Badge>
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
                                                    <Button variant="link" size="sm" onClick={() => setSelectedCalculation(bid.calculation)}>
                                                        {bid.calculation.finalItemScore.toFixed(2)}
                                                    </Button>
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
                <ScoreBreakdownDialog 
                    calculation={selectedCalculation} 
                    evaluationCriteria={requisition.evaluationCriteria}
                    isOpen={!!selectedCalculation}
                    onClose={() => setSelectedCalculation(null)}
                />
            )}
        </div>
    )
}
