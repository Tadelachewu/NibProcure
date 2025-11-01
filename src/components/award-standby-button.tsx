
"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardFooter, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Loader2, RefreshCw, CalendarIcon } from 'lucide-react';
import { PurchaseRequisition, Quotation } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Label } from './ui/label';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Input } from './ui/input';
import { Calendar } from './ui/calendar';
import { cn } from '@/lib/utils';
import { format, setHours, setMinutes, isBefore } from 'date-fns';

interface AwardStandbyButtonProps {
    requisition: PurchaseRequisition;
    quotations: Quotation[];
    onSuccess: () => void;
}

export function AwardStandbyButton({
    requisition,
    quotations,
    onSuccess,
}: AwardStandbyButtonProps) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [isPromoting, setIsPromoting] = useState(false);
    const [isReopening, setIsReopening] = useState(false);
    const [isDialogOpen, setDialogOpen] = useState(false);
    const [newDeadlineDate, setNewDeadlineDate] = useState<Date | undefined>();
    const [newDeadlineTime, setNewDeadlineTime] = useState<string>('17:00');

    const hasStandbyVendors = quotations.some(q => q.status === 'Standby');
    const isRelevantStatus = requisition.status === 'Award_Declined';
    
    const finalNewDeadline = useMemo(() => {
        if (!newDeadlineDate) return undefined;
        const [hours, minutes] = newDeadlineTime.split(':').map(Number);
        return setMinutes(setHours(newDeadlineDate, hours), minutes);
    }, [newDeadlineDate, newDeadlineTime]);

    if (!isRelevantStatus) {
        return null;
    }

    const handlePromote = async () => {
        if (!user) return;
        setIsPromoting(true);
        try {
            const response = await fetch(`/api/requisitions/${requisition.id}/promote-standby`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id }),
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Failed to promote standby vendor.');
            }
            toast({
                title: 'Success',
                description: result.message,
            });
            onSuccess();
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error instanceof Error ? error.message : 'An unknown error occurred.',
            });
        } finally {
            setIsPromoting(false);
        }
    }
    
    const handleReopen = async () => {
         if (!user) return;
        if (!finalNewDeadline || isBefore(finalNewDeadline, new Date())) {
            toast({ variant: 'destructive', title: 'Error', description: 'A new deadline in the future must be set.' });
            return;
        }

        setIsReopening(true);
        try {
            const response = await fetch(`/api/requisitions/${requisition.id}/reset-award`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, newDeadline: finalNewDeadline }),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Failed to re-open RFQ.`);
            }
            toast({ title: 'Success', description: `The RFQ has been re-opened for declined items.` });
            setDialogOpen(false);
            onSuccess();
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: error instanceof Error ? error.message : 'An unknown error occurred.' });
        } finally {
            setIsReopening(false);
        }
    };
    
    return (
        <Card className="mt-6 border-amber-500">
            <CardHeader>
                <CardTitle>Action Required: Award Declined</CardTitle>
                <CardDescription>
                    A vendor has declined their award. You may now promote the next standby vendor or re-open the RFQ for the declined items.
                </CardDescription>
            </CardHeader>
            <CardFooter className="pt-0 flex gap-2">
                 {hasStandbyVendors ? (
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button disabled={isPromoting}>
                                {isPromoting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Promote Standby Vendor
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                            <AlertDialogTitle>Confirm Promotion</AlertDialogTitle>
                            <AlertDialogDescription>
                                This will promote the next vendor in rank to the 'Pending Award' status. The award will then be routed through the standard approval chain again.
                            </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handlePromote}>Confirm & Promote</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                 ) : (
                    <Button disabled variant="secondary">No Standby Vendors Available</Button>
                 )}
                 <Dialog open={isDialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                         <Button variant="outline">
                            Re-Open RFQ for Declined Items
                         </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Re-Open RFQ for Declined Items</DialogTitle>
                            <DialogDescription>
                                This will reset the status for declined items and allow you to send the RFQ to a new set of vendors. Set a new submission deadline.
                            </DialogDescription>
                        </DialogHeader>
                         <div className="py-4 space-y-2">
                            <Label>New Quotation Submission Deadline</Label>
                            <div className="flex gap-2">
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal",!newDeadlineDate && "text-muted-foreground")}>
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {newDeadlineDate ? format(newDeadlineDate, "PPP") : <span>Pick a new date</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <Calendar mode="single" selected={newDeadlineDate} onSelect={setNewDeadlineDate} disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))} initialFocus/>
                                    </PopoverContent>
                                </Popover>
                                <Input type="time" className="w-32" value={newDeadlineTime} onChange={(e) => setNewDeadlineTime(e.target.value)}/>
                            </div>
                        </div>
                        <DialogFooter>
                            <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                            <Button onClick={handleReopen} disabled={isReopening || !finalNewDeadline}>
                                {isReopening ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} 
                                Confirm & Re-open
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                 </Dialog>
            </CardFooter>
        </Card>
    );
}
