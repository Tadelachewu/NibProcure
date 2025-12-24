

"use client";

import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogTrigger } from './ui/dialog';
import { Button } from './ui/button';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from './ui/alert-dialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from './ui/table';
import { Label } from './ui/label';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Input } from './ui/input';
import { CalendarIcon, HelpCircle, Upload, FileText, UserCog, Calculator } from 'lucide-react';
import { Calendar } from './ui/calendar';
import { cn } from '@/lib/utils';
import { format, setHours, setMinutes } from 'date-fns';
import { PurchaseRequisition, Quotation, QuoteItem } from '@/lib/types';
import { ScrollArea } from './ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from './ui/textarea';
import Link from 'next/link';
import { getRankIcon } from '@/lib/utils';

export const BestItemAwardDialog = ({
    requisition,
    quotations,
    onFinalize,
    isOpen,
    onClose
}: {
    requisition: PurchaseRequisition;
    quotations: Quotation[];
    onFinalize: (awardStrategy: 'all' | 'item', awards: any, awardResponseDeadline?: Date, minuteDocumentUrl?: string, minuteJustification?: string) => void;
    isOpen: boolean;
    onClose: () => void;
}) => {
    const { toast } = useToast();
    const [awardResponseDeadlineDate, setAwardResponseDeadlineDate] = useState<Date|undefined>();
    const [awardResponseDeadlineTime, setAwardResponseDeadlineTime] = useState('17:00');
    const [minuteFile, setMinuteFile] = useState<File | null>(null);
    const [minuteJustification, setMinuteJustification] = useState('');

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
            
            const championBids = eligibleQuotes.map(quote => {
                const proposalsForItem = quote.items.filter(i => i.requisitionItemId === reqItem.id);
                if (proposalsForItem.length === 0) return null;

                let bestProposalForItem: QuoteItem | null = null;
                let bestItemScore = -1;

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
                    
                    if (averageItemScore > bestItemScore) {
                        bestItemScore = averageItemScore;
                        bestProposalForItem = proposal;
                    }
                });

                if (!bestProposalForItem) return null;

                return {
                    vendorId: quote.vendorId,
                    vendorName: quote.vendorName,
                    quoteItemId: bestProposalForItem.id,
                    quotationId: quote.id,
                    proposedItemName: bestProposalForItem.name,
                    unitPrice: bestProposalForItem.unitPrice,
                    bidDocumentUrl: quote.bidDocumentUrl,
                    experienceDocumentUrl: quote.experienceDocumentUrl,
                    score: bestItemScore
                };
            }).filter((bid): bid is NonNullable<typeof bid> => bid !== null);
            
            championBids.sort((a, b) => b.score - a.score);
            
            const winner = championBids.length > 0 ? championBids[0] : null;

            return {
                requisitionItemId: reqItem.id,
                name: reqItem.name,
                quantity: reqItem.quantity,
                winner: winner,
                rankedBids: championBids,
            };
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


    const handleConfirmAward = async () => {
        let minuteDocumentUrl: string | undefined = undefined;

        if (!minuteFile) {
            toast({ variant: 'destructive', title: 'Error', description: 'Please upload an official minute document.' });
            return;
        }
        if (!minuteJustification.trim()) {
            toast({ variant: 'destructive', title: 'Error', description: 'A justification/summary is required for the minute.' });
            return;
        }

        try {
            const formData = new FormData();
            formData.append('file', minuteFile);
            formData.append('directory', 'minutes');
            const response = await fetch('/api/upload', { method: 'POST', body: formData });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'File upload failed');
            minuteDocumentUrl = result.path;
        } catch (error) {
            toast({ variant: 'destructive', title: 'Upload Failed', description: error instanceof Error ? error.message : 'Could not upload minute file.' });
            return;
        }
        
        let awards: { [reqItemId: string]: { rankedBids: any[] } } = {};
        
        itemWinners.forEach(item => {
            if (item.winner) {
                awards[item.requisitionItemId] = { rankedBids: item.rankedBids };
            }
        });

        onFinalize('item', awards, awardResponseDeadline, minuteDocumentUrl, minuteJustification);
        onClose();
    }


    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Award by Best Offer (Per Item)</DialogTitle>
                    <DialogDescription>
                        This strategy awards each item to the vendor with the highest score for that specific item. This may result in multiple Purchase Orders.
                    </DialogDescription>
                </DialogHeader>
                
                <ScrollArea className="flex-1 -mx-6 px-6">
                    <div className="space-y-6 py-4">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center justify-between">
                                    <span>Winning Bids per Item</span>
                                    <Button variant="secondary" size="sm" asChild>
                                        <Link href={`/requisitions/${requisition.id}/award-details`}>
                                            <Calculator className="mr-2 h-4 w-4" />
                                            Show Full Calculation
                                        </Link>
                                    </Button>
                                </CardTitle>
                                <CardDescription>
                                    Each item is awarded to the vendor with the highest score. Standby vendors are also ranked.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
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
                                                <TableCell className="text-right font-mono">{item.winner ? item.winner.score.toFixed(2) : 'N/A'}</TableCell>
                                                <TableCell className="text-right font-mono">{item.winner ? `${(item.winner.unitPrice * item.quantity).toLocaleString()} ETB` : 'N/A'}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>

                        <div className="space-y-2">
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

                        <div className="space-y-4">
                            <Label>Minute Recording</Label>
                            <div className="p-4 border rounded-lg space-y-2">
                                <Label htmlFor="minute-justification-item">Justification / Summary</Label>
                                <Textarea id="minute-justification-item" placeholder="Provide a brief summary of the decision in the minute." value={minuteJustification} onChange={e => setMinuteJustification(e.target.value)} />
                                <Label htmlFor="minute-file-item">Official Minute Document (PDF)</Label>
                                <Input id="minute-file-item" type="file" accept=".pdf" onChange={e => setMinuteFile(e.target.files?.[0] || null)} />
                            </div>
                        </div>

                        <div className="text-right text-xl font-bold">
                            Total Award Value: {totalAwardValue.toLocaleString()} ETB
                        </div>
                    </div>
                </ScrollArea>

                <DialogFooter className="pt-4 border-t">
                    <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                    <AlertDialog>
                        <AlertDialogTrigger asChild><Button>Finalize & Send Awards</Button></AlertDialogTrigger>
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
        </Dialog>
    );
};
