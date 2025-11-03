
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
    const { user } = useAuth();
    const { toast } = useToast();
    const [isAwardCenterOpen, setAwardCenterOpen] = useState(false);

    if (requisition.status !== 'Partially_Award_Declined') {
        return null;
    }

    return (
        <Card className="mt-6 border-amber-500">
            <CardHeader>
                <CardTitle>Action Required: Partial Award Declined</CardTitle>
                <CardDescription>
                    A vendor has declined their portion of a split award. You must re-award the declined items.
                </CardDescription>
            </CardHeader>
            <CardFooter className="pt-0">
                <Dialog open={isAwardCenterOpen} onOpenChange={setAwardCenterOpen}>
                <DialogTrigger asChild>
                    <Button>
                        {isFinalizing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
