
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
}

export function AwardStandbyButton({
    requisition,
    quotations,
    onSuccess,
}: AwardStandbyButtonProps) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [isPromoting, setIsPromoting] = useState(false);
    const [isAwardCenterOpen, setAwardCenterOpen] = useState(false);

    const hasStandbyVendors = quotations.some(q => q.status === 'Standby');
    const isRelevantStatus = requisition.status === 'Award_Declined';
    
    if (!isRelevantStatus) {
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
    
    return (
        <Card className="mt-6 border-amber-500">
            <CardHeader>
                <CardTitle>Action Required: Award Declined</CardTitle>
                <CardDescription>
                    A vendor has declined their award. You may now promote the next standby vendor or re-open the RFQ for the declined items.
                </CardDescription>
            </CardHeader>
            <CardFooter className="pt-0 flex gap-2">
                 {hasStandbyVendors ? (
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button disabled={isPromoting}>
                                {isPromoting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Promote Standby Vendor
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                            <AlertDialogTitle>Confirm Promotion</AlertDialogTitle>
                            <AlertDialogDescription>
                                This will promote the next vendor in rank to the 'Pending Award' status. The award will then be routed through the standard approval chain again.
                            </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handlePromote}>Confirm & Promote</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                 ) : (
                    <Button disabled variant="secondary">No Standby Vendors Available</Button>
                 )}
                 <Button variant="outline" onClick={() => toast({title: "Feature Coming Soon", description: "The ability to re-open an RFQ for specific items is under development."})}>
                    Re-Open RFQ for Declined Items
                 </Button>
            </CardFooter>
        </Card>
    );
}
