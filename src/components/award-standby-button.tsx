
"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardFooter, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Loader2, RefreshCw, CalendarIcon, AlertTriangle } from 'lucide-react';
import { PurchaseRequisition, Quotation } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from './ui/dialog';
import { Label } from './ui/label';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Input } from './ui/input';
import { Calendar } from './ui/calendar';
import { cn } from '@/lib/utils';
import { format, setHours, setMinutes, isBefore } from 'date-fns';
import { AwardCenterDialog } from './award-center-dialog';

interface AwardStandbyButtonProps {
    requisition: PurchaseRequisition;
    quotations: Quotation[];
    onSuccess: () => void;
    onFinalize: (awardStrategy: 'all' | 'item', awards: any, awardResponseDeadline?: Date) => void;
    isFinalizing: boolean;
}

export function AwardStandbyButton({
    requisition,
    quotations,
    onSuccess,
    onFinalize,
    isFinalizing,
}: AwardStandbyButtonProps) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [isPromoting, setIsPromoting] = useState(false);
    const [isReopening, setIsReopening] = useState(false);
    const [isDialogOpen, setDialogOpen] = useState(false);
    const [isAwardCenterOpen, setAwardCenterOpen] = useState(false);
    const [newDeadlineDate, setNewDeadlineDate] = useState<Date | undefined>();
    const [newDeadlineTime, setNewDeadlineTime] = useState<string>('17:00');

    const hasStandbyVendors = quotations.some(q => q.status === 'Standby');
    
    // This component should now handle both 'Award_Declined' and 'Scoring_Complete'
    const isRelevantStatus = requisition.status === 'Award_Declined' || requisition.status === 'Scoring_Complete';
    
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
        setIsReopening(true);
        try {
            // Call the surgical reset API
            const response = await fetch(`/api/requisitions/${requisition.id}/reset-award`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id }),
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
    
    if (requisition.status === 'Award_Declined') {
        return (
            <Card className="mt-6 border-amber-500">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-amber-600"><AlertTriangle/> Action Required: Award Declined</CardTitle>
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
                                    This will promote the next vendor in rank to 'Pending Award'. The award will then be routed through the standard approval chain again.
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
                    <Button variant="outline" onClick={handleReopen}>
                        {isReopening ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} 
                        Re-Open RFQ for Declined Items
                    </Button>
                </CardFooter>
            </Card>
        );
    }
    
    // Logic for Scoring_Complete state
    if (requisition.status === 'Scoring_Complete') {
        return (
             <Card className="mt-6">
                <CardHeader>
                    <CardTitle>Finalize Award</CardTitle>
                    <CardDescription>All scores have been submitted. You can now proceed to the Award Center to finalize the award decision.</CardDescription>
                </CardHeader>
                <CardFooter>
                    <Dialog open={isAwardCenterOpen} onOpenChange={setAwardCenterOpen}>
                        <DialogTrigger asChild>
                            <Button disabled={isFinalizing}>
                                {isFinalizing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Go to Award Center
                            </Button>
                        </DialogTrigger>
                        <AwardCenterDialog 
                            requisition={requisition}
                            quotations={quotations}
                            onFinalize={onFinalize}
                            onClose={() => setAwardCenterOpen(false)}
                        />
                    </Dialog>
                </CardFooter>
            </Card>
        )
    }

    return null;
}
