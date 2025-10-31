
"use client";

import React, { useState } from 'react';
import { Card, CardFooter, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Loader2 } from 'lucide-react';
import { PurchaseRequisition, Quotation } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog';

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

    const hasStandbyVendors = quotations.some(q => q.status === 'Standby');
    const isRelevantStatus = requisition.status === 'Award_Declined' || requisition.status === 'Award_Partially_Declined';
    
    if (!isRelevantStatus || (role !== 'Procurement_Officer' && role !== 'Admin')) {
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
                    A vendor has declined some or all parts of their award. You may now promote the next standby vendor or re-finalize the award if necessary.
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
                                This will promote the next highest-ranked standby vendor for the declined items. The award will then re-enter the approval workflow.
                            </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handlePromote}>Confirm & Promote</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                 ) : (
                    <p className="text-sm text-muted-foreground">No standby vendors are available for the declined items.</p>
                 )}
            </CardFooter>
        </Card>
    );
}
