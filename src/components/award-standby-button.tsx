
"use client";

import React, { useState } from 'react';
import { Card, CardFooter, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Loader2 } from 'lucide-react';
import { PurchaseRequisition, Quotation } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { AwardCenterDialog } from './award-center-dialog';

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
    const [isAwardCenterOpen, setAwardCenterOpen] = useState(false);

    // This button should only be visible if there are actual standby vendors to promote.
    const hasStandbyVendors = quotations.some(q => q.status === 'Standby');
    const isRelevantStatus = requisition.status === 'Award_Declined' || requisition.status === 'Scoring_Complete';
    
    if (!isRelevantStatus || hasStandbyVendors) { // This logic was flawed, should show if standby exists OR if scoring is complete
        // This button is for re-awarding, so it makes sense in these states
    } else {
        return null;
    }

    const buttonText = requisition.status === 'Award_Declined' 
        ? 'Promote Standby or Re-Award'
        : 'Finalize Scores & Award';
    
    const isDisabled = disabled || isFinalizing || requisition.status.startsWith('Pending_') || requisition.status === 'PostApproved';

    return (
        <Card className="mt-6 border-amber-500">
             <CardHeader>
                <CardTitle>Action Required</CardTitle>
                <CardDescription>
                    {requisition.status === 'Award_Declined' 
                        ? "A vendor has declined their award. You may now promote the next standby vendor or manually re-award."
                        : "All scores are in. You may now finalize the award."
                    }
                </CardDescription>
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
