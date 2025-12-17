
'use client';

import React, { useState } from 'react';
import { PurchaseRequisition, PurchaseOrder } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { ContractManagement } from './ContractManagement';
import { NotifyVendorDialog } from './NotifyVendorDialog';
import { QuoteComparison } from './QuoteComparison';
import { DialogTrigger } from '@/components/ui/dialog';

export function AwardFinalization({
  requisition,
  isAuthorized,
  isNotifying,
  onNotifyVendor,
  onContractFinalized,
}: {
  requisition: PurchaseRequisition;
  isAuthorized: boolean;
  isNotifying: boolean;
  onNotifyVendor: (deadline?: Date) => void;
  onContractFinalized: () => void;
}) {
  const [isNotifyDialogOpen, setIsNotifyDialogOpen] = useState(false);
  const [lastPOCreated, setLastPOCreated] = useState<PurchaseOrder | null>(null); // This would need to be passed down or fetched

  const isReadyForNotification = requisition?.status === 'PostApproved';
  const isAccepted = requisition?.quotations?.some(q => q.status === 'Accepted' || q.status === 'Partially_Awarded') || false;

  return (
    <div className="space-y-6">
        <QuoteComparison 
            requisition={requisition}
            onScoreSubmitted={()=>{}} // Not applicable at this stage
        />

        {isReadyForNotification && isAuthorized && (
            <Card className="mt-6 border-amber-500">
                <CardHeader>
                    <CardTitle>Action Required: Notify Vendor</CardTitle>
                    <CardDescription>The award has passed all reviews. You may now notify the winning vendor.</CardDescription>
                </CardHeader>
                <CardFooter>
                    <DialogTrigger asChild>
                        <Button disabled={isNotifying} onClick={() => setIsNotifyDialogOpen(true)}>
                            {isNotifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {requisition.status === 'Awarded' ? 'Notification Sent' : 'Send Award Notification'}
                        </Button>
                    </DialogTrigger>
                    <NotifyVendorDialog
                        isOpen={isNotifyDialogOpen}
                        onClose={() => setIsNotifyDialogOpen(false)}
                        onConfirm={(deadline) => {
                            onNotifyVendor(deadline);
                            setIsNotifyDialogOpen(false);
                        }}
                    />
                </CardFooter>
            </Card>
        )}

        {isAccepted && (
            <ContractManagement requisition={requisition} onContractFinalized={onContractFinalized} />
        )}
    </div>
  );
}
