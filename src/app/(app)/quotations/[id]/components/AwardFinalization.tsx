
'use client';

import React, { useState } from 'react';
import { PurchaseRequisition } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { ContractManagement } from './ContractManagement';
import { NotifyVendorDialog } from './NotifyVendorDialog';
import { useQuotationActions } from '../hooks/useQuotationActions';

export function AwardFinalization({
  requisition,
  isAuthorized,
  onSuccess,
}: {
  requisition: PurchaseRequisition;
  isAuthorized: boolean;
  onSuccess: () => void;
}) {
  const [isNotifying, setIsNotifying] = useState(false);
  const [isNotifyDialogOpen, setIsNotifyDialogOpen] = useState(false);
  const { handleNotifyVendor } = useQuotationActions(requisition.id, onSuccess);

  const isReadyForNotification = requisition?.status === 'PostApproved';
  const isAccepted = requisition.quotations?.some(q => q.status === 'Accepted' || q.status === 'Partially_Awarded');

  const onNotifyConfirm = async (deadline?: Date) => {
    setIsNotifying(true);
    await handleNotifyVendor(deadline);
    setIsNotifying(false);
  };

  return (
    <>
      {isReadyForNotification && isAuthorized && (
        <Card className="mt-6 border-amber-500">
          <CardHeader>
            <CardTitle>Action Required: Notify Vendor</CardTitle>
            <CardDescription>The award has passed all reviews. You may now notify the winning vendor.</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button onClick={() => setIsNotifyDialogOpen(true)} disabled={isNotifying || requisition.status === 'Awarded'}>
              {isNotifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {requisition.status === 'Awarded' ? 'Notification Sent' : 'Send Award Notification'}
            </Button>
          </CardFooter>
        </Card>
      )}

      {isAccepted && requisition.status !== 'PO_Created' && (
        <ContractManagement requisition={requisition} onContractFinalized={onSuccess} />
      )}

      <NotifyVendorDialog
        isOpen={isNotifyDialogOpen}
        onClose={() => setIsNotifyDialogOpen(false)}
        onConfirm={(deadline) => {
          onNotifyConfirm(deadline);
          setIsNotifyDialogOpen(false);
        }}
      />
    </>
  );
}
