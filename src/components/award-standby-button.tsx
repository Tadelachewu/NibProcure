
'use client';

import { Button } from './ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog';
import { Loader2, TrophyIcon } from 'lucide-react';
import { PerItemAwardDetail, PurchaseRequisition, Quotation } from '@/lib/types';
import { useMemo } from 'react';

interface AwardStandbyButtonProps {
    requisition: PurchaseRequisition;
    quotations: Quotation[];
    onPromote: () => void;
    isChangingAward: boolean;
}

export function AwardStandbyButton({ requisition, quotations, onPromote, isChangingAward }: AwardStandbyButtonProps) {
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
    }, [requisition, quotations, isPerItemStrategy]);


    if (!canPromote) {
        return null;
    }

    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button disabled={isChangingAward}>
                    {isChangingAward ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TrophyIcon className="mr-2 h-4 w-4" />}
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
                    <AlertDialogAction onClick={onPromote}>Confirm &amp; Promote</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
