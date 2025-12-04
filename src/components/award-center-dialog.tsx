
"use client";

import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from './ui/dialog';
import { Button } from './ui/button';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from './ui/alert-dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Input } from './ui/input';
import { CalendarIcon, TrophyIcon, Upload } from 'lucide-react';
import { Calendar } from './ui/calendar';
import { cn } from '@/lib/utils';
import { format, setHours, setMinutes } from 'date-fns';
import { PurchaseRequisition, Quotation } from '@/lib/types';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from './ui/textarea';
import { useAuth } from '@/contexts/auth-context';
import { ScrollArea } from './ui/scroll-area';


export const AwardCenterDialog = ({
    requisition,
    quotations,
    onFinalize,
    onClose
}: {
    requisition: PurchaseRequisition;
    quotations: Quotation[];
    onFinalize: (awardStrategy: 'all' | 'item', awards: any, awardResponseDeadline?: Date, minuteType?: 'system_generated' | 'uploaded_document', minuteDocumentUrl?: string, minuteJustification?: string) => void;
    onClose: () => void;
}) => {
    const { toast } = useToast();
    const { allUsers } = useAuth();
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

        // Sort quotes by the final average score in descending order
        const sortedQuotes = [...eligibleQuotes].sort((a, b) => (b.finalAverageScore || 0) - (a.finalAverageScore || 0));

        const winnerQuote = sortedQuotes[0];

        if (!winnerQuote) {
            return null;
        }

        return { 
            vendorId: winnerQuote.vendorId,
            vendorName: winnerQuote.vendorName,
            items: winnerQuote.items.map(item => ({
                requisitionItemId: item.requisitionItemId,
                quoteItemId: item.id
            })),
            score: winnerQuote.finalAverageScore || 0 
        };
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
        
        if (overallWinner?.vendorId) {
            awards[overallWinner.vendorId] = { 
                vendorName: overallWinner.vendorName!, 
                items: overallWinner.items!
            };
        }

        onFinalize('all', awards, awardResponseDeadline, 'uploaded_document', minuteDocumentUrl, minuteJustification);
        onClose();
    }


    return (
        <DialogContent className="max-w-2xl h-[90vh] flex flex-col">
            <DialogHeader>
                <DialogTitle>Award to Single Best Vendor</DialogTitle>
                <DialogDescription>Review the recommended winner and finalize the award for requisition {requisition.id}.</DialogDescription>
            </DialogHeader>
            
            <ScrollArea className="flex-1 pr-6 -mr-6">
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Best Overall Vendor</CardTitle>
                            <CardDescription>This strategy awards all items to the single vendor with the highest average score across all scored items.</CardDescription>
                        </CardHeader>
                        <CardContent className="text-center p-8">
                            <TrophyIcon className="h-12 w-12 text-amber-400 mx-auto mb-4"/>
                            <p className="text-muted-foreground">Recommended Overall Winner:</p>
                            <p className="text-2xl font-bold">{overallWinner?.vendorName || 'N/A'}</p>
                            <p className="font-mono text-primary">{overallWinner?.score > 0 ? `${overallWinner.score.toFixed(2)} average score` : 'N/A'}</p>
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
