
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
    // The onFinalize prop is added to fix the crash when calling AwardCenterDialog
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
    
    // Determine the state based on requisition status
    const isDeclined = requisition.status === 'Award_Declined';
    const isPartiallyDeclined = requisition.status === 'Partially_Award_Declined';
    const isScoringComplete = requisition.status === 'Scoring_Complete';
    
    const isRelevantStatus = isDeclined || isPartiallyDeclined || isScoringComplete;
    const isProcurement = role === 'Procurement_Officer' || role === 'Admin';
    const [isAwardCenterOpen, setAwardCenterOpen] = useState(false);
    
    if (!isRelevantStatus || !isProcurement) {
        return null;
    }

    const buttonState = {
        text: "Finalize Scores & Award",
        disabled: isFinalizing,
    };
    
    // Logic for the button and dialog based on the state
    if (isDeclined || isPartiallyDeclined) {
        return (
             <Card className="mt-6 border-amber-500">
                <CardHeader>
                    <CardTitle>Action Required: Award Declined</CardTitle>
                    <CardDescription>
                        A vendor has declined their award. The system will automatically promote a standby vendor or reset the process. If manual intervention is needed, you can re-open the award center.
                    </CardDescription>
                </CardHeader>
                <CardFooter>
                     <Dialog open={isAwardCenterOpen} onOpenChange={setAwardCenterOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline">Re-Finalize Award</Button>
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
    
     if (isScoringComplete) {
         return (
            <Card className="mt-6">
                <CardHeader>
                    <CardTitle>Scoring Complete</CardTitle>
                    <CardDescription>
                        All committee members have submitted their scores. You may now proceed to finalize the award.
                    </CardDescription>
                </CardHeader>
                <CardFooter>
                    <Dialog open={isAwardCenterOpen} onOpenChange={setAwardCenterOpen}>
                        <DialogTrigger asChild>
                            <Button disabled={buttonState.disabled}>
                                {isFinalizing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {buttonState.text}
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
