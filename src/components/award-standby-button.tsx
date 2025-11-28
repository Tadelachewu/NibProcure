
'use client';

import React, { useState, useMemo } from 'react';
import { Button } from './ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog';
import { Loader2, TrophyIcon } from 'lucide-react';
import { PerItemAwardDetail, PurchaseRequisition, Quotation } from '@/lib/types';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';

interface AwardStandbyButtonProps {
    requisition: PurchaseRequisition;
    quotations: Quotation[];
    onSuccess: () => void;
    isChangingAward: boolean;
}

export function AwardStandbyButton({
    requisition,
    quotations,
    onSuccess,
    isChangingAward,
}: AwardStandbyButtonProps) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const isPerItemStrategy = (requisition.rfqSettings as any)?.awardStrategy === 'item';

    const canPromote = useMemo(() => {
        if (requisition.status !== 'Award_Declined') {
            return false;
        }

        if (isPerItemStrategy) {
            return requisition.items.some(item => {
                const details = (item.perItemAwardDetails as PerItemAwardDetail[] | undefined) || [];
                const hasDeclinedWinner = details.some(d => d.status === 'Declined');
                if (!hasDeclinedWinner) return false;
                
                const standbyExists = details.some(d => d.status === 'Standby');
                return standbyExists;
            });
        } else {
            return quotations.some(q => q.status === 'Standby');
        }
    }, [requisition, isPerItemStrategy, quotations]);

    const handlePromote = async () => {
        if (!user) return;
        setIsSubmitting(true);
        try {
            const response = await fetch(`/api/requisitions/${requisition.id}/promote-standby`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Failed to promote standby vendor.");
            }
            const result = await response.json();
            toast({ title: "Promotion Successful", description: result.message });
            onSuccess(); // Correctly call the onSuccess function to refresh the parent page
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Promotion Failed',
                description: error instanceof Error ? error.message : 'An unknown error occurred.',
            });
        } finally {
            setIsSubmitting(false);
        }
    };


    if (!canPromote) {
        return null;
    }

    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button disabled={isSubmitting || isChangingAward}>
                    {(isSubmitting || isChangingAward) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TrophyIcon className="mr-2 h-4 w-4" />}
                    Promote Standby Vendor
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Confirm Standby Promotion</AlertDialogTitle>
                    <AlertDialogDescription>
                        This will promote the next highest-ranked standby vendor(s) to the "Pending Award" status and restart the review process. This action cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handlePromote}>Confirm &amp; Promote</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
