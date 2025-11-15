
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
            // Check if there is at least one item that has a 'Declined' winner AND a 'Standby' vendor.
            return requisition.items.some(item => {
                const details = (item.perItemAwardDetails as PerItemAwardDetail[] || []);
                const hasDeclinedWinner = details.some(d => d.status === 'Declined');
                if (!hasDeclinedWinner) return false;

                const nextRank = (details.find(d => d.status === 'Declined')?.rank || 0) + 1;
                const standbyExists = details.some(d => d.rank === nextRank && d.status === 'Standby');
                return standbyExists;
            });
        } else {
            // Single vendor strategy: check if there's any quote with a 'Standby' status.
            return quotations.some(q => q.status === 'Standby');
        }
    }, [requisition, quotations, isPerItemStrategy]);


    if (!canPromote) {
        return null; // Don't render the button if no promotion is possible.
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
