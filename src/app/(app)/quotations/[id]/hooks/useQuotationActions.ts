'use client';

import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';

export function useQuotationActions(requisitionId: string, onSuccess: () => void) {
  const { toast } = useToast();
  const { user } = useAuth();

  const handleFinalizeScores = async (
    awardStrategy: 'all' | 'item',
    awards: any,
    awardResponseDeadline?: Date,
    minuteDocumentUrl?: string,
    minuteJustification?: string
  ) => {
    if (!user) return;
    
    try {
      const response = await fetch(`/api/requisitions/${requisitionId}/finalize-scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, awards, awardStrategy, awardResponseDeadline, minuteDocumentUrl, minuteJustification }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to finalize scores.');
      }
      toast({ title: 'Success', description: 'Scores have been finalized and awards are being routed for final review.' });
      onSuccess();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'An unknown error occurred.',
      });
    }
  };

  const handleAwardChange = async () => {
    if (!user) return;
    try {
      const response = await fetch(`/api/requisitions/${requisitionId}/promote-standby`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to handle award change.' }));
        throw new Error(errorData.error);
      }
      toast({ title: `Action Successful`, description: `The award status has been updated.` });
      onSuccess();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'An unknown error occurred.',
      });
    }
  };

  const handleNotifyVendor = async (deadline?: Date) => {
    if (!user) return;
    try {
      const response = await fetch(`/api/requisitions/${requisitionId}/notify-vendor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, awardResponseDeadline: deadline })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to notify vendor.");
      }

      toast({
        title: "Vendor Notified",
        description: "The winning vendor has been notified and the award is pending their response."
      });
      onSuccess();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'An unknown error occurred.',
      });
    }
  };

  return {
    handleFinalizeScores,
    handleAwardChange,
    handleNotifyVendor,
  };
}
