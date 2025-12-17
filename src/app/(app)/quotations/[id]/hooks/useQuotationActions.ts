
'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { PurchaseRequisition } from '@/lib/types';

export function useQuotationActions(
  requisition: PurchaseRequisition | null,
  onActionSuccess: () => void
) {
  const { user, token } = useAuth();
  const { toast } = useToast();

  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isNotifying, setIsNotifying] = useState(false);
  const [isChangingAward, setIsChangingAward] = useState(false);
  
  const handleApiCall = async (
    endpoint: string,
    method: 'POST' | 'PATCH' = 'POST',
    body: any,
    successMessage: string,
    setLoadingState: (loading: boolean) => void
  ) => {
    if (!user || !token || !requisition) {
      toast({ variant: 'destructive', title: 'Error', description: 'Authentication or requisition data is missing.' });
      return;
    }
    setLoadingState(true);
    try {
      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ ...body, userId: user.id }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'An unknown error occurred.');
      }
      toast({ title: 'Success', description: successMessage });
      onActionSuccess();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'An unknown error occurred.',
      });
    } finally {
      setLoadingState(false);
    }
  };

  const handleFinalizeScores = async (awardStrategy: 'all' | 'item', awards: any, awardResponseDeadline?: Date) => {
    await handleApiCall(
      `/api/requisitions/${requisition!.id}/finalize-scores`,
      'POST',
      { awards, awardStrategy, awardResponseDeadline },
      'Scores finalized and routed for review.',
      setIsFinalizing
    );
  };

  const handleNotifyVendor = async (awardResponseDeadline?: Date) => {
    await handleApiCall(
      `/api/requisitions/${requisition!.id}/notify-vendor`,
      'POST',
      { awardResponseDeadline },
      'Winning vendor has been notified.',
      setIsNotifying
    );
  };

  const handleAwardChange = async () => {
    await handleApiCall(
      `/api/requisitions/${requisition!.id}/promote-standby`,
      'POST',
      {},
      'Award status has been updated.',
      setIsChangingAward
    );
  };
  
  const handleManageRfq = async (action: 'update' | 'cancel' | 'restart', reason: string, newDeadline?: Date) => {
    await handleApiCall(
        `/api/requisitions/${requisition!.id}/manage-rfq`,
        'POST',
        { action, reason, newDeadline },
        `RFQ has been successfully ${action === 'update' ? 'updated' : 'managed'}.`,
        () => {} // No specific loading state for this one-off action
    );
  };
  
  const handleReopenRfq = async (newDeadline: Date) => {
    await handleApiCall(
      `/api/requisitions/${requisition!.id}/reopen-rfq`,
      'POST',
      { newDeadline },
      'RFQ has been re-opened to new vendors.',
      () => {}
    );
  };


  return {
    handleFinalizeScores,
    handleNotifyVendor,
    handleAwardChange,
    handleManageRfq,
    handleReopenRfq,
    isFinalizing,
    isNotifying,
    isChangingAward,
  };
}
