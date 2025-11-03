
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
}

export function AwardStandbyButton({
    requisition,
    quotations,
    onSuccess,
}: AwardStandbyButtonProps) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);


    if (requisition.status !== 'Award_Declined' && requisition.status !== 'Partially_Award_Declined') {
        return null;
    }
    
    const hasStandby = quotations.some(q => q.status === 'Standby');

    if (!hasStandby) {
        return null;
    }

    const handlePromote = async () => {
        if (!user) return;
        setIsSubmitting(true);
        try {
             const response = await fetch(`/api/requisitions/${requisition.id}/promote-standby`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to promote standby vendor.');
            }
            toast({ title: "Success", description: "Standby vendor promoted. The award is now in review."});
            onSuccess();
        } catch (error) {
             toast({ variant: 'destructive', title: 'Error', description: error instanceof Error ? error.message : 'An unknown error occurred.'});
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <Card className="mt-6 border-amber-500">
            <CardHeader>
                <CardTitle>Action Required: Award Declined</CardTitle>
                <CardDescription>
                    A vendor has declined their award. You can manually promote the next standby vendor.
                </CardDescription>
            </CardHeader>
            <CardFooter className="pt-0">
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Promote Standby Vendor
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Confirm Standby Promotion</AlertDialogTitle>
                            <AlertDialogDescription>
                                This will promote the next ranked vendor. The award will be re-routed through the required approval process based on the new vendor's quote.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handlePromote}>Confirm & Promote</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </CardFooter>
        </Card>
    );
}
