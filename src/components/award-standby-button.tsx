
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
    const { user, role } = useAuth();
    const { toast } = useToast();
    const [isPromoting, setIsPromoting] = useState(false);
    
    // This component is now deprecated as the new logic handles standby promotion automatically.
    // It will be removed in a future cleanup.
    // The core logic is now in `handleAwardRejection` service.
    
    const hasStandbyVendors = quotations.some(q => q.status === 'Standby');
    const isRelevantStatus = requisition.status === 'Award_Declined' || requisition.status === 'Partially_Award_Declined';
    const isProcurement = role === 'Procurement_Officer' || role === 'Admin';
    
    if (!isRelevantStatus || !isProcurement) {
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
                    A vendor has declined a portion of the award. The system will automatically promote a standby vendor if available, or reset the item for a new RFQ.
                </CardDescription>
            </CardHeader>
            <CardFooter className="flex-wrap gap-2 pt-0">
                 <p className="text-sm text-muted-foreground">The system is designed to handle this automatically. If manual intervention is needed, please contact an administrator.</p>
            </CardFooter>
        </Card>
    );
}
