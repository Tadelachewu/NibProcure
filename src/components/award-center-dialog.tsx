

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
import { CalendarIcon, TrophyIcon } from 'lucide-react';
import { Calendar } from './ui/calendar';
import { cn } from '@/lib/utils';
import { format, setHours, setMinutes } from 'date-fns';
import { PurchaseRequisition, Quotation } from '@/lib/types';


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
    const [awardStrategy, setAwardStrategy] = useState<'item' | 'all'>('item');
    const [awardResponseDeadlineDate, setAwardResponseDeadlineDate] = useState<Date|undefined>();
    const [awardResponseDeadlineTime, setAwardResponseDeadlineTime] = useState('17:00');

    const awardResponseDeadline = useMemo(() => {
        if (!awardResponseDeadlineDate) return undefined;
        const [hours, minutes] = awardResponseDeadlineTime.split(':').map(Number);
        return setMinutes(setHours(awardResponseDeadlineDate, hours), minutes);
    }, [awardResponseDeadlineDate, awardResponseDeadlineTime]);
    
    const eligibleQuotes = useMemo(() => {
        // Create an "exclusion list" of vendors who have already declined.
        const declinedVendorIds = new Set(
            quotations.filter(q => q.status === 'Declined').map(q => q.vendorId)
        );
        // Only consider quotes from vendors who are not on the exclusion list.
        return quotations.filter(q => !declinedVendorIds.has(q.vendorId));
    }, [quotations]);

    // Per-item award logic
    const itemWinners = useMemo(() => {
        if (!requisition.items) return [];

        return requisition.items.map(reqItem => {
            let bestScore = -1;
            let winner: { vendorId: string; vendorName: string; quoteItemId: string; } | null = null;

            eligibleQuotes.forEach(quote => {
                const proposalsForItem = quote.items.filter(i => i.requisitionItemId === reqItem.id);

                proposalsForItem.forEach(proposal => {
                    if (!quote.scores) return;

                    let totalItemScore = 0;
                    let scoreCount = 0;
                    
                    quote.scores.forEach(scoreSet => {
                        const itemScore = scoreSet.itemScores?.find(i => i.quoteItemId === proposal.id);
                        if (itemScore) {
                            totalItemScore += itemScore.finalScore;
                            scoreCount++;
                        }
                    });
                    
                    const averageItemScore = scoreCount > 0 ? totalItemScore / scoreCount : 0;
                    if (averageItemScore > bestScore) {
                        bestScore = averageItemScore;
                        winner = {
                            vendorId: quote.vendorId,
                            vendorName: quote.vendorName,
                            quoteItemId: proposal.id
                        };
                    }
                });
            });
            return {
                requisitionItemId: reqItem.id,
                name: reqItem.name,
                winner,
                bestScore,
            }
        });
    }, [requisition, eligibleQuotes]);
    
    // Single vendor award logic
    const overallWinner = useMemo(() => {
        let bestOverallScore = -1;
        let overallWinner: { vendorId: string; vendorName: string; items: { requisitionItemId: string, quoteItemId: string }[] } | null = null;
        
        eligibleQuotes.forEach(quote => {
            if (quote.finalAverageScore && quote.finalAverageScore > bestOverallScore) {
                bestOverallScore = quote.finalAverageScore;
                overallWinner = {
                    vendorId: quote.vendorId,
                    vendorName: quote.vendorName,
                    // Award all original items, assuming vendor quoted them
                    items: requisition.items.map(reqItem => {
                        const vendorItem = quote.items.find(i => i.requisitionItemId === reqItem.id);
                        return { requisitionItemId: reqItem.id, quoteItemId: vendorItem!.id }
                    }).filter(i => i.quoteItemId)
                }
            }
        });
        return { ...overallWinner, score: bestOverallScore };
    }, [eligibleQuotes, requisition]);


    const handleConfirmAward = () => {
        let awards: { [vendorId: string]: { vendorName: string, items: { requisitionItemId: string, quoteItemId: string }[] } } = {};
        
        if (awardStrategy === 'item') {
             itemWinners.forEach(item => {
                if (item.winner) {
                    if (!awards[item.winner.vendorId]) {
                        awards[item.winner.vendorId] = { vendorName: item.winner.vendorName, items: [] };
                    }
                    awards[item.winner.vendorId].items.push({ requisitionItemId: item.requisitionItemId, quoteItemId: item.winner.quoteItemId });
                }
            });
        } else { // 'all'
           if (overallWinner?.vendorId) {
                awards[overallWinner.vendorId] = { 
                    vendorName: overallWinner.vendorName!, 
                    items: overallWinner.items!
                };
           }
        }

        onFinalize(awardStrategy, awards, awardResponseDeadline);
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
                                    {itemWinners.map(item => (
                                        <TableRow key={item.requisitionItemId}>
                                            <TableCell className="font-medium">{item.name}</TableCell>
                                            <TableCell>{item.winner?.vendorName || 'N/A'}</TableCell>
                                            <TableCell className="text-right font-mono">{item.bestScore > 0 ? item.bestScore.toFixed(2) : 'N/A'}</TableCell>
                                        </TableRow>
                                    ))}
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
                    </AlertDialog