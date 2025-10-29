
"use client";

import React, { useState } from 'react';
import { Card, CardFooter, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Loader2 } from 'lucide-react';
import { PurchaseRequisition, Quotation } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog';
import { AwardCenterDialog } from './award-center-dialog';
import { Dialog, DialogTrigger } from './ui/dialog';


interface AwardStandbyButtonProps {
    requisition: PurchaseRequisition;
    quotations: Quotation[];
    onFinalize: (awardStrategy: 'all' | 'item', awards: any, awardResponseDeadline?: Date) => void;
    isFinalizing: boolean;
    disabled?: boolean;
}

export function AwardStandbyButton({
    requisition,
    quotations,
    onFinalize,
    isFinalizing,
    disabled = false
}: AwardStandbyButtonProps) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [isPromoting, setIsPromoting] = useState(false);
    const [isAwardCenterOpen, setAwardCenterOpen] = useState(false);

    const hasStandbyVendors = quotations.some(q => q.status === 'Standby');
    const isRelevantStatus = requisition.status === 'Award_Declined' || requisition.status === 'Scoring_Complete';
    
    if (!isRelevantStatus) {
        return null;
    }

    const buttonText = requisition.status === 'Award_Declined' 
        ? "Promote Standby Vendor"
        : "Finalize Scores & Award";

    const isDisabled = disabled || isPromoting || isFinalizing;
    
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
            // onSuccess(); // This was causing an issue, let's rely on toast
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
    
    if (requisition.status === 'Award_Declined') {
         return (
            <Card className="mt-6 border-amber-500">
                <CardHeader>
                    <CardTitle>Action Required: Award Declined</CardTitle>
                    <CardDescription>
                        A vendor has declined their award. You may now promote the next standby vendor.
                    </CardDescription>
                </CardHeader>
                <CardFooter className="pt-0">
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button disabled={isDisabled || !hasStandbyVendors}>
                                {isPromoting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {buttonText}
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                            <AlertDialogTitle>Confirm Promotion</AlertDialogTitle>
                            <AlertDialogDescription>
                                This will promote the next vendor in rank to the 'Awarded' status. The requisition will then be ready for you to notify the new winner.
                            </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handlePromote}>Confirm & Promote</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </CardFooter>
            </Card>
        );
    }
    
    if (requisition.status === 'Scoring_Complete') {
         return (
            <Card className="mt-6">
                <CardHeader>
                    <CardTitle>Finalize Award</CardTitle>
                    <CardDescription>All committee scores have been submitted. You can now finalize the award decision.</CardDescription>
                </CardHeader>
                <CardFooter className="pt-0">
                    <Dialog open={isAwardCenterOpen} onOpenChange={setAwardCenterOpen}>
                        <DialogTrigger asChild>
                            <Button disabled={isDisabled}>
                                {isFinalizing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {buttonText}
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
        );
    }

    return null;
}
