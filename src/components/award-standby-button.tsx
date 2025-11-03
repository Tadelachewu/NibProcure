
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
    const { user, role } = useAuth();
    const { toast } = useToast();
    const [isPromoting, setIsPromoting] = useState(false);
    const [isAwardCenterOpen, setAwardCenterOpen] = useState(false);

    const hasStandbyVendors = quotations.some(q => q.status === 'Standby');
    const isRelevantStatus = requisition.status === 'Award_Declined' || requisition.status === 'Partially_Award_Declined';
    const isProcurement = role === 'Procurement_Officer' || role === 'Admin';
    
    if (!isRelevantStatus || !isProcurement) {
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
    
    if (isRelevantStatus) {
         return (
            <Card className="mt-6 border-amber-500">
                <CardHeader>
                    <CardTitle>Action Required: Award Declined</CardTitle>
                    <CardDescription>
                        A vendor has declined a portion of the award. You can either promote a standby vendor for the declined items or re-run the award process.
                    </CardDescription>
                </CardHeader>
                <CardFooter className="flex-wrap gap-2 pt-0">
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
                                This will promote the next vendor in rank for the declined items. The award will be re-routed for approval based on the new total value.
                            </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handlePromote}>Confirm & Promote</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                     <Dialog open={isAwardCenterOpen} onOpenChange={setAwardCenterOpen}>
                        <DialogTrigger asChild>
                            <Button variant="secondary">
                                Re-Award Declined Items
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
