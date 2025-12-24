

"use client";

import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from './ui/dialog';
import { Button } from './ui/button';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from './ui/alert-dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Input } from './ui/input';
import { CalendarIcon, Upload, FileText, UserCog, Calculator } from 'lucide-react';
import { Calendar } from './ui/calendar';
import { cn } from '@/lib/utils';
import { format, setHours, setMinutes } from 'date-fns';
import { PurchaseRequisition, Quotation } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from './ui/textarea';
import { ScrollArea } from './ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { getRankIcon } from '@/lib/utils';
import Link from 'next/link';


export const AwardCenterDialog = ({
    requisition,
    quotations,
    onFinalize,
    onClose
}: {
    requisition: PurchaseRequisition;
    quotations: Quotation[];
    onFinalize: (awardStrategy: 'all' | 'item', awards: any, awardResponseDeadline?: Date, minuteDocumentUrl?: string, minuteJustification?: string) => void;
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
    
    const overallWinner = useMemo(() => {
        if (!eligibleQuotes || eligibleQuotes.length === 0) {
            return null;
        }
        const sortedQuotes = [...eligibleQuotes].sort((a, b) => (b.finalAverageScore || 0) - (a.finalAverageScore || 0));
        return sortedQuotes.length > 0 ? sortedQuotes[0] : null;
    }, [eligibleQuotes]);

    const standbyVendors = useMemo(() => {
        if (!eligibleQuotes || eligibleQuotes.length < 2) return [];
        return [...eligibleQuotes]
            .sort((a, b) => (b.finalAverageScore || 0) - (a.finalAverageScore || 0))
            .slice(1, 3); // Get 2nd and 3rd place
    }, [eligibleQuotes]);

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
        if (!overallWinner) {
            toast({ variant: 'destructive', title: 'Error', description: 'No winning vendor could be determined.' });
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
        
        let awards: { [vendorId: string]: { vendorName: string, items: { requisitionItemId: string, quoteItemId: string }[] } } = {};
        
        awards[overallWinner.vendorId] = { 
            vendorName: overallWinner.vendorName!, 
            items: overallWinner.items.map(item => ({
                requisitionItemId: item.requisitionItemId,
                quoteItemId: item.id
            }))
        };
        
        onFinalize('all', awards, awardResponseDeadline, minuteDocumentUrl, minuteJustification);
        onClose();
    }


    return (
        <DialogContent className="max-w-3xl h-[90vh] flex flex-col">
            <DialogHeader>
                <DialogTitle>Award to Single Best Vendor</DialogTitle>
                <DialogDescription>Review the recommended winner and finalize the award for requisition {requisition.id}.</DialogDescription>
            </DialogHeader>
            
            <ScrollArea className="flex-1 -mx-6 px-6">
                <div className="space-y-6 py-4">
                    
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center justify-between">
                                <span>Ranking Summary</span>
                                <Button variant="secondary" size="sm" asChild>
                                    <Link href={`/requisitions/${requisition.id}/award-details`}>
                                        <Calculator className="mr-2 h-4 w-4" />
                                        Show Full Calculation
                                    </Link>
                                </Button>
                            </CardTitle>
                            <CardDescription>
                                Vendors are ranked by the highest final average score. The winner receives the award, and the next two are put on standby.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                             <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Rank</TableHead>
                                        <TableHead>Vendor</TableHead>
                                        <TableHead>Final Score</TableHead>
                                        <TableHead>Total Price</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {overallWinner && (
                                        <TableRow className="bg-green-500/10">
                                            <TableCell className="font-bold flex items-center gap-2">{getRankIcon(1)} Winner</TableCell>
                                            <TableCell>{overallWinner.vendorName}</TableCell>
                                            <TableCell className="font-mono">{overallWinner.finalAverageScore?.toFixed(2)}</TableCell>
                                            <TableCell className="font-mono">{overallWinner.totalPrice.toLocaleString()} ETB</TableCell>
                                        </TableRow>
                                    )}
                                    {standbyVendors.map((vendor, index) => (
                                         <TableRow key={vendor.id}>
                                            <TableCell className="font-bold flex items-center gap-2">{getRankIcon(index + 2)} Standby</TableCell>
                                            <TableCell>{vendor.vendorName}</TableCell>
                                            <TableCell className="font-mono">{vendor.finalAverageScore?.toFixed(2)}</TableCell>
                                            <TableCell className="font-mono">{vendor.totalPrice.toLocaleString()} ETB</TableCell>
                                        </TableRow>
                                    ))}
                                    {(!overallWinner && standbyVendors.length === 0) && (
                                        <TableRow><TableCell colSpan={4} className="text-center h-24">No eligible vendors to rank.</TableCell></TableRow>
                                    )}
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
                            <Label htmlFor="minute-justification">Justification / Summary</Label>
                            <Textarea id="minute-justification" placeholder="Provide a brief summary of the decision in the minute." value={minuteJustification} onChange={e => setMinuteJustification(e.target.value)} />
                            <Label htmlFor="minute-file">Official Minute Document (PDF)</Label>
                            <Input id="minute-file" type="file" accept=".pdf" onChange={e => setMinuteFile(e.target.files?.[0] || null)} />
                        </div>
                    </div>
                </div>
            </ScrollArea>

            <DialogFooter className="pt-4 border-t">
                <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                <AlertDialog>
                    <AlertDialogTrigger asChild><Button disabled={!overallWinner}>Finalize &amp; Send Award</Button></AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                        <AlertDialogTitle>Confirm Award Decision</AlertDialogTitle>
                        <AlertDialogDescription>
                            You are about to finalize the award to <strong>{overallWinner?.vendorName}</strong>. This will initiate the final approval workflow.
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
