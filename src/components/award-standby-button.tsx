
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
import { Dialog, DialogContent, DialogTrigger } from './ui/dialog';
import { BestItemAwardDialog } from './best-item-award-dialog';


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
    const [isSingleAwardCenterOpen, setSingleAwardCenterOpen] = useState(false);
    const [isBestItemAwardCenterOpen, setBestItemAwardCenterOpen] = useState(false);

    const hasStandbyVendors = quotations.some(q => q.status === 'Standby');

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
                            <Button disabled={isPromoting || !hasStandbyVendors}>
                                {isPromoting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {hasStandbyVendors ? 'Promote Standby Vendor' : 'No Standby Vendors Available'}
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
             <Card className="mt-6 border-green-500">
                <CardHeader>
                    <CardTitle>Action Required: Finalize Award</CardTitle>
                    <CardDescription>
                        All committee scores have been submitted. You can now finalize the award decision.
                    </CardDescription>
                </CardHeader>
                <CardFooter className="gap-2 pt-0">
                    <Dialog open={isSingleAwardCenterOpen} onOpenChange={setSingleAwardCenterOpen}>
                        <DialogTrigger asChild>
                            <Button disabled={isFinalizing}>
                                {isFinalizing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Award to Single Vendor
                            </Button>
                        </DialogTrigger>
                        <AwardCenterDialog 
                            requisition={requisition}
                            quotations={quotations}
                            onFinalize={onFinalize}
                            onClose={() => setSingleAwardCenterOpen(false)}
                        />
                    </Dialog>
                    <Dialog open={isBestItemAwardCenterOpen} onOpenChange={setBestItemAwardCenterOpen}>
                        <DialogTrigger asChild>
                            <Button disabled={isFinalizing} variant="outline">
                                {isFinalizing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Award by Best Item
                            </Button>
                        </DialogTrigger>
                        <BestItemAwardDialog
                            isOpen={isBestItemAwardCenterOpen}
                            onClose={() => setBestItemAwardCenterOpen(false)}
                            requisition={requisition}
                            quotations={quotations}
                            onFinalize={onFinalize}
                        />
                    </Dialog>
                </CardFooter>
            </Card>
         )
    }
    
    return null;
}
