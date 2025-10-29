

"use client";

import React, { useState } from 'react';
import { Card, CardFooter, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Loader2 } from 'lucide-react';
import { PurchaseRequisition, Quotation } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';

interface AwardStandbyButtonProps {
    requisition: PurchaseRequisition;
    quotations: Quotation[];
    onSuccess: () => void;
    disabled?: boolean;
}

export function AwardStandbyButton({
    requisition,
    quotations,
    onSuccess,
    disabled = false
}: AwardStandbyButtonProps) {
    const [isPromoting, setIsPromoting] = useState(false);
    const { user } = useAuth();
    const { toast } = useToast();

    // This button should only be visible if there are actual standby vendors to promote.
    const hasStandbyVendors = quotations.some(q => q.status === 'Standby');
    const isRelevantStatus = requisition.status === 'Award_Declined';
    
    const handlePromoteStandby = async () => {
        if (!user) return;
        setIsPromoting(true);
        try {
            const response = await fetch(`/api/requisitions/${requisition.id}/promote-standby`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to promote standby vendor.');
            }

            toast({
                title: 'Standby Vendor Promoted',
                description: result.message,
            });
            onSuccess(); // Re-fetch data on parent component

        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error instanceof Error ? error.message : 'An unknown error occurred.',
            });
        } finally {
            setIsPromoting(false);
        }
    };


    if (!isRelevantStatus || !hasStandbyVendors) {
        return null;
    }

    return (
        <Card className="mt-6 border-amber-500">
             <CardHeader>
                <CardTitle>Action Required: Promote Standby Vendor</CardTitle>
                <CardDescription>
                    A vendor has declined their award. You may now promote the next standby vendor to begin their approval process.
                </CardDescription>
            </CardHeader>
            <CardFooter className="pt-0">
                <Button onClick={handlePromoteStandby} disabled={isPromoting || disabled}>
                    {isPromoting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Promote Standby & Start Review
                </Button>
            </CardFooter>
        </Card>
    );
}
