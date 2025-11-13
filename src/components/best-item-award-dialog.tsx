
"use client";

import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from './ui/dialog';
import { Button } from './ui/button';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from './ui/alert-dialog';
import { Card, CardContent } from './ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from './ui/table';
import { Label } from './ui/label';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Input } from './ui/input';
import { CalendarIcon } from 'lucide-react';
import { Calendar } from './ui/calendar';
import { cn } from '@/lib/utils';
import { format, setHours, setMinutes } from 'date-fns';
import { PurchaseRequisition, Quotation, QuoteItem } from '@/lib/types';

export const BestItemAwardDialog = ({
    requisition,
    quotations,
    onFinalize,
    isOpen,
    onClose
}: {
    requisition: PurchaseRequisition;
    quotations: Quotation[];
    onFinalize: (awardStrategy: 'all' | 'item', awards: any, awardResponseDeadline?: Date) => void;
    isOpen: boolean;
    onClose: () => void;
}) => {
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

    const itemWinners = useMemo(() => {
        if (!requisition.items) return [];

        return requisition.items.map(reqItem => {
            
            // Stage 1: Find each vendor's single best ("champion") proposal for this item
            const championBids = eligibleQuotes.map(quote => {
                const proposalsForItem = quote.items.filter(i => i.requisitionItemId === reqItem.id);
                if (proposalsForItem.length === 0) return null;

                let bestVendorProposal: QuoteItem | null = null;
                let bestVendorItemScore = -1;

                proposalsForItem.forEach(proposal => {
                    let totalItemScore = 0;
                    let scoreCount = 0;
                    quote.scores?.forEach(scoreSet => {
                        const itemScore = scoreSet.itemScores?.find(i => i.quoteItemId === proposal.id);
                        if (itemScore) {
                            totalItemScore += itemScore.finalScore;
                            scoreCount++;
                        }
                    });
                    const averageItemScore = scoreCount > 0 ? totalItemScore / scoreCount : 0;
                    
                    if (averageItemScore > bestVendorItemScore) {
                        bestVendorItemScore = averageItemScore;
                        bestVendorProposal = proposal;
                    }
                });

                if (!bestVendorProposal) return null;

                return {
                    vendorId: quote.vendorId,
                    vendorName: quote.vendorName,
                    quoteItemId: bestVendorProposal.id,
                    unitPrice: bestVendorProposal.unitPrice,
                    score: bestVendorItemScore
                };
            }).filter((bid): bid is NonNullable<typeof bid> => bid !== null);
            
            // Stage 2: Rank the champion bids against each other
            championBids.sort((a, b) => b.score - a.score);
            
            const winner = championBids.length > 0 ? championBids[0] : null;

            return {
                requisitionItemId: reqItem.id,
                name: reqItem.name,
                quantity: reqItem.quantity,
                winner: winner,
                bestScore: winner ? winner.score : -1,
            }
        });
    }, [requisition, eligibleQuotes]);

    const totalAwardValue = useMemo(() => {
        return itemWinners.reduce((acc, item) => {
            if (item.winner) {
                return acc + (item.winner.unitPrice * item.quantity);
            }
            return acc;
        }, 0);
    }, [itemWinners]);


    const handleConfirmAward = () => {
        let awards: { [vendorId: string]: { vendorName: string, items: { requisitionItemId: string, quoteItemId: string }[] } } = {};
        
        itemWinners.forEach(item => {
            if (item.winner) {
                if (!awards[item.winner.vendorId]) {
                    awards[item.winner.vendorId] = { vendorName: item.winner.vendorName, items: [] };
                }
                awards[item.winner.vendorId].items.push({ requisitionItemId: item.requisitionItemId, quoteItemId: item.winner.quoteItemId });
            }
        });

        onFinalize('item', awards, awardResponseDeadline);
        onClose();
    }


    return (
        <DialogContent className="max-w-4xl">
            <DialogHeader>
                <DialogTitle>Award by Best Offer (Per Item)</DialogTitle>
                <DialogDescription>
                    This strategy awards each item to the vendor with the highest score for that specific item. This may result in multiple Purchase Orders.
                </DialogDescription>
            </DialogHeader>
            
            <Card>
                <CardContent className="pt-6">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Item</TableHead>
                                <TableHead>Recommended Winner</TableHead>
                                <TableHead className="text-right">Winning Score</TableHead>
                                <TableHead className="text-right">Winning Price</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {itemWinners.map(item => (
                                <TableRow key={item.requisitionItemId}>
                                    <TableCell className="font-medium">{item.name}</TableCell>
                                    <TableCell>{item.winner?.vendorName || 'N/A'}</TableCell>
                                    <TableCell className="text-right font-mono">{item.bestScore > 0 ? item.bestScore.toFixed(2) : 'N/A'}</TableCell>
                                    <TableCell className="text-right font-mono">{item.winner ? `${(item.winner.unitPrice * item.quantity).toLocaleString()} ETB` : 'N/A'}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

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
             <div className="text-right text-xl font-bold">
                Total Award Value: {totalAwardValue.toLocaleString()} ETB
            </div>

            <DialogFooter>
                <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                <AlertDialog>
                    <AlertDialogTrigger asChild><Button>Finalize &amp; Send Awards</Button></AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                        <AlertDialogTitle>Confirm Per-Item Award Decision</AlertDialogTitle>
                        <AlertDialogDescription>
                            You are about to finalize the award based on the Best Offer Per Item strategy. This will initiate the final approval workflow.
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
