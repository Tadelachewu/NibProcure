
"use client";

import React, { useState } from 'react';
import { Card, CardFooter, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogTrigger } from './ui/dialog';
import { AwardCenterDialog } from './award-center-dialog';
import { PurchaseRequisition, Quotation } from '@/lib/types';

interface AwardStandbyButtonProps {
    requisition: PurchaseRequisition;
    quotations: Quotation[];
    isFinalizing: boolean;
    onFinalize: (awardStrategy: 'all' | 'item', awards: any, awardResponseDeadline?: Date) => void;
    disabled?: boolean;
}

export function AwardStandbyButton({
    requisition,
    quotations,
    isFinalizing,
    onFinalize,
    disabled = false,
}: AwardStandbyButtonProps) {
    const [isAwardCenterOpen, setAwardCenterOpen] = useState(false);

    // This button should only be visible if there are actual standby vendors to promote.
    const hasStandbyVendors = quotations.some(q => q.status === 'Standby');
    const isRelevantStatus = requisition.status === 'Award_Declined' || requisition.status === 'Scoring_Complete';

    if (!isRelevantStatus || !hasStandbyVendors) {
        return null;
    }

    return (
        <Card className="mt-6 border-amber-500">
             <CardHeader>
                <CardTitle>Action Required: Ready to Award</CardTitle>
                <CardDescription>
                    {requisition.status === 'Award_Declined'
                        ? 'A vendor has declined their award. You may now promote a standby vendor by re-opening the Award Center.'
                        : 'All scores are in. You may now finalize the scores and send the award for final approval.'
                    }
                </CardDescription>
            </CardHeader>
            <CardFooter className="pt-0">
                <Dialog open={isAwardCenterOpen} onOpenChange={setAwardCenterOpen}>
                    <DialogTrigger asChild>
                        <Button disabled={isFinalizing || disabled}>
                            {isFinalizing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                             {requisition.status === 'Award_Declined' ? 'Award Standby' : 'Finalize & Award'}
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
