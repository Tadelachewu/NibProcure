
"use client";

import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from './ui/dialog';
import { Button } from './ui/button';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from './ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from './ui/table';
import { Label } from './ui/label';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Input } from './ui/input';
import { CalendarIcon, TrophyIcon, UserX } from 'lucide-react';
import { Calendar } from './ui/calendar';
import { cn } from '@/lib/utils';
import { format, setHours, setMinutes } from 'date-fns';
import { PurchaseRequisition, Quotation } from '@/lib/types';
import { Alert, AlertTitle, AlertDescription } from './ui/alert';


export const AwardCenterDialog = ({
    requisition,
    quotations,
    onFinalize,
    onClose
}: {
    requisition: PurchaseRequisition;
    quotations: Quotation[];
    onFinalize: (awardStrategy: 'all' | 'item', awards: any, awardResponseDeadline?: Date) => void;
    onClose: () => void;
}) => {
    const [awardStrategy, setAwardStrategy] = useState<'item' | 'all'>('all');
    const [awardResponseDeadlineDate, setAwardResponseDeadlineDate] = useState<Date|undefined>();
    const [awardResponseDeadlineTime, setAwardResponseDeadlineTime] = useState('17:00');

    const awardResponseDeadline = useMemo(() => {
        if (!awardResponseDeadlineDate) return undefined;
        const [hours, minutes] = awardResponseDeadlineTime.split(':').map(Number);
        return setMinutes(setHours(awardResponseDeadlineDate, hours), minutes);
    }, [awardResponseDeadlineDate, awardResponseDeadlineTime]);
    
    const eligibleQuotes = useMemo(() => {
        const declinedVendorIds = new Set(
            quotations.filter(q => q.status === 'Declined').map(q => q.vendorId)
        );
        return quotations.filter(q => !declinedVendorIds.has(q.vendorId));
    }, [quotations]);

    const bestProposalPerVendorPerItem = useMemo(() => {
        const result: { [vendorId: string]: { [requisitionItemId: string]: any } } = {};
        
        eligibleQuotes.forEach(quote => {
            result[quote.vendorId] = {};
            requisition.items.forEach(reqItem => {
                const proposalsForItem = quote.items.filter(item => item.requisitionItemId === reqItem.id);
                if (proposalsForItem.length === 0) return;

                const bestProposal = proposalsForItem.reduce((best, current) => {
                    const getAvgScore = (proposalId: string) => {
                        let totalScore = 0, count = 0;
                        quote.scores?.forEach(scoreSet => {
                            const itemScore = scoreSet.itemScores?.find(i => i.quoteItemId === proposalId);
                            if (itemScore) { totalScore += itemScore.finalScore; count++; }
                        });
                        return count > 0 ? totalScore / count : 0;
                    };
                    return getAvgScore(current.id) > getAvgScore(best.id) ? current : best;
                }, proposalsForItem[0]);

                let totalScore = 0, scoreCount = 0;
                quote.scores?.forEach(scoreSet => {
                    const itemScore = scoreSet.itemScores?.find(i => i.quoteItemId === bestProposal.id);
                    if (itemScore) {
                        totalScore += itemScore.finalScore;
                        scoreCount++;
                    }
                });
                const averageItemScore = scoreCount > 0 ? totalScore / scoreCount : 0;

                result[quote.vendorId][reqItem.id] = {
                    ...bestProposal,
                    score: averageItemScore,
                    vendorName: quote.vendorName,
                };
            });
        });
        return result;
    }, [eligibleQuotes, requisition.items]);
    
    const perItemAwards = useMemo(() => {
        const awards: { [itemId: string]: { winner?: any, standbys: any[] } } = {};
        
        requisition.items.forEach(reqItem => {
            if (reqItem.status === 'Awarded') return;

            const allProposalsForItem = Object.values(bestProposalPerVendorPerItem).map(vendorProposals => vendorProposals[reqItem.id]).filter(Boolean);
            const rankedProposals = allProposalsForItem.sort((a, b) => b.score - a.score);

            awards[reqItem.id] = {
                winner: rankedProposals[0] ? { vendorName: rankedProposals[0].vendorName, score: rankedProposals[0].score, quoteItemId: rankedProposals[0].id } : undefined,
                standbys: rankedProposals.slice(1, 3).map(p => ({ vendorName: p.vendorName, score: p.score, quoteItemId: p.id }))
            };
        });

        return awards;
    }, [requisition.items, bestProposalPerVendorPerItem]);


    const overallWinner = useMemo(() => {
        let bestVendor = { vendorId: '', vendorName: '', score: -1, items: [] as any[] };

        Object.entries(bestProposalPerVendorPerItem).forEach(([vendorId, proposals]) => {
            const vendorItems = Object.values(proposals);
            if (vendorItems.length === 0) return;

            const averageScore = vendorItems.reduce((acc, item) => acc + item.score, 0) / vendorItems.length;

            if (averageScore > bestVendor.score) {
                bestVendor = {
                    vendorId,
                    vendorName: vendorItems[0].vendorName,
                    score: averageScore,
                    items: vendorItems.map(item => ({ requisitionItemId: item.requisitionItemId, quoteItemId: item.id }))
                };
            }
        });
        
        return bestVendor.vendorId ? bestVendor : null;
    }, [bestProposalPerVendorPerItem]);

    const handleConfirmAward = () => {
        let awardsPayload: any = {};
        
        if (awardStrategy === 'item') {
            awardsPayload = perItemAwards;
        } else { // 'all'
           if (overallWinner?.vendorId) {
                awardsPayload[overallWinner.vendorId] = { 
                    vendorName: overallWinner.vendorName, 
                    items: overallWinner.items 
                };
           }
        }
        onFinalize(awardStrategy, awardsPayload, awardResponseDeadline);
        onClose();
    }


    return (
        <DialogContent className="max-w-4xl">
            <DialogHeader>
                <DialogTitle>Award Center</DialogTitle>
                <DialogDescription>Review scores and finalize the award for requisition {requisition.id}.</DialogDescription>
            </DialogHeader>
            
            <Tabs value={awardStrategy} onValueChange={(v) => setAwardStrategy(v as any)} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="item">Award by Best Offer (Per Item)</TabsTrigger>
                    <TabsTrigger value="all">Award All to Single Vendor</TabsTrigger>
                </TabsList>
                <TabsContent value="item">
                     <Card>
                        <CardHeader>
                            <CardTitle>Best Offer per Item</CardTitle>
                            <CardDescription>This strategy awards each item to the vendor with the highest score for that specific item. This may result in multiple Purchase Orders.</CardDescription>
                        </CardHeader>
                         <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Item</TableHead>
                                        <TableHead>Recommended Winner</TableHead>
                                        <TableHead className="text-right">Winning Score</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {requisition.items.map(item => {
                                        const awardInfo = perItemAwards[item.id];
                                        return (
                                            <TableRow key={item.id}>
                                                <TableCell className="font-medium">{item.name}</TableCell>
                                                <TableCell>{awardInfo?.winner?.vendorName || 'N/A'}</TableCell>
                                                <TableCell className="text-right font-mono">{awardInfo?.winner?.score > 0 ? awardInfo.winner.score.toFixed(2) : 'N/A'}</TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
                 <TabsContent value="all">
                     <Card>
                        <CardHeader>
                            <CardTitle>Best Overall Vendor</CardTitle>
                            <CardDescription>This strategy awards all items to the single vendor with the highest average score across all items.</CardDescription>
                        </CardHeader>
                        <CardContent className="text-center p-8">
                            <TrophyIcon className="h-12 w-12 text-amber-400 mx-auto mb-4"/>
                            <p className="text-muted-foreground">Recommended Overall Winner:</p>
                            <p className="text-2xl font-bold">{overallWinner?.vendorName || 'N/A'}</p>
                            <p className="font-mono text-primary">{overallWinner?.score > 0 ? `${overallWinner.score.toFixed(2)} average score` : 'N/A'}</p>
                        </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="declined">
                    <Card>
                         <CardHeader>
                            <CardTitle>Re-Award Declined Items</CardTitle>
                             <CardDescription className="text-muted-foreground">This action is now handled by the "Promote Standby" button on the main quotations page after a vendor declines an award.</CardDescription>
                        </CardHeader>
                         <CardContent>
                            <Alert variant="default" className="border-amber-500/50">
                                <UserX className="h-4 w-4" />
                                <AlertTitle>Action Moved</AlertTitle>
                                <AlertDescription>
                                    To maintain a clear workflow, please close this dialog and use the "Promote Standby" button to proceed after a vendor declines an award.
                                </AlertDescription>
                            </Alert>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

             <div className="pt-4 space-y-2">
                <Label>Vendor Response Deadline (Optional)</Label>
                <div className="flex gap-2">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant={"outline"}
                                className={cn(
                                "flex-1 justify-start text-left font-normal",
                                !awardResponseDeadlineDate && "text-muted-foreground"
                                )}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {awardResponseDeadlineDate ? format(awardResponseDeadlineDate, "PPP") : <span>Set a date for vendors to respond</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                            <Calendar
                                mode="single"
                                selected={awardResponseDeadlineDate}
                                onSelect={setAwardResponseDeadlineDate}
                                disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))}
                                initialFocus
                            />
                        </PopoverContent>
                    </Popover>
                     <Input 
                        type="time" 
                        className="w-32"
                        value={awardResponseDeadlineTime}
                        onChange={(e) => setAwardResponseDeadlineTime(e.target.value)}
                    />
                </div>
            </div>

            <DialogFooter>
                <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                <AlertDialog>
                    <AlertDialogTrigger asChild><Button>Finalize &amp; Send Awards</Button></AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                        <AlertDialogTitle>Confirm Award Decision</AlertDialogTitle>
                        <AlertDialogDescription>
                            You are about to finalize the award based on the <strong>{awardStrategy === 'item' ? 'Best Offer Per Item' : 'Single Best Vendor'}</strong> strategy.
                            This will initiate the final approval workflow.
                        </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleConfirmAward}>Confirm</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </DialogFooter>
        </DialogContent>
    );
};
