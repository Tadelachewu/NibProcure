
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { PurchaseRequisition, Quotation, Vendor, UserRole } from '@/lib/types';
import { isPast } from 'date-fns';

export function useQuotationData(requisitionId: string) {
  const { user, role, rfqSenderSetting, committeeQuorum, token } = useAuth();
  const { toast } = useToast();

  const [requisition, setRequisition] = useState<PurchaseRequisition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  
  const fetchRequisitionAndQuotes = useCallback(async () => {
    if (!requisitionId) return;
    setLoading(true);

    try {
        const [reqResponse, quoResponse] = await Promise.all([
            fetch(`/api/requisitions/${requisitionId}`),
            fetch(`/api/quotations?requisitionId=${requisitionId}`),
        ]);

        if (!reqResponse.ok) throw new Error('Requisition not found.');

        const currentReq = await reqResponse.json();
        const quoData: Quotation[] = quoResponse.ok ? await quoResponse.json() : [];
        
        setRequisition({...currentReq, quotations: quoData});

    } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not fetch data.');
        toast({ variant: 'destructive', title: 'Error', description: err instanceof Error ? err.message : 'Could not fetch data.' });
    } finally {
        setLoading(false);
    }
  }, [requisitionId, toast]);

  useEffect(() => {
    if (requisitionId && user) {
        fetchRequisitionAndQuotes();
    }
  }, [requisitionId, user, fetchRequisitionAndQuotes]);

  // DERIVED STATE
  const isAuthorized = useMemo(() => {
    if (!user || !role) return false;
    if (role === 'Admin' || role === 'Committee') return true;
    if (rfqSenderSetting.type === 'specific') {
      return user.id === rfqSenderSetting.userId;
    }
    if (rfqSenderSetting.type === 'all') {
      return role === 'Procurement_Officer';
    }
    return false;
  }, [user, role, rfqSenderSetting]);

  const isAccepted = useMemo(() => requisition?.quotations?.some(q => q.status === 'Accepted' || q.status === 'Partially_Awarded') || false, [requisition]);
  const isDeadlinePassed = useMemo(() => requisition?.deadline ? isPast(new Date(requisition.deadline)) : false, [requisition]);
  const noBidsAndDeadlinePassed = useMemo(() => isDeadlinePassed && requisition?.quotations?.length === 0 && requisition?.status === 'Accepting_Quotes', [isDeadlinePassed, requisition]);
  const quorumNotMetAndDeadlinePassed = useMemo(() => isDeadlinePassed && requisition?.quotations && requisition.quotations.length > 0 && requisition.quotations.length < committeeQuorum && requisition.status === 'Accepting_Quotes', [isDeadlinePassed, requisition, committeeQuorum]);

  const currentStep = useMemo((): 'rfq' | 'committee' | 'award' | 'finalize' | 'completed' => {
    if (!requisition?.status) return 'rfq';

    const completeStatuses = ['Fulfilled', 'Closed'];
    if (completeStatuses.includes(requisition.status)) return 'completed';

    const finalizeStatuses = ['PO_Created', 'Partially_Closed'];
    if (finalizeStatuses.includes(requisition.status) || isAccepted) return 'finalize';

    const awardStatuses = ['Awarded', 'PostApproved', 'Award_Declined'];
    if (awardStatuses.includes(requisition.status) || requisition.status.startsWith('Pending_')) return 'award';
    
    const committeeStatuses = ['Scoring_In_Progress', 'Scoring_Complete'];
    if (committeeStatuses.includes(requisition.status)) return 'committee';
    
    if (requisition.status === 'Accepting_Quotes' && isDeadlinePassed) return 'committee';
    
    return 'rfq';
  }, [requisition, isAccepted, isDeadlinePassed]);

  return {
    requisition,
    loading,
    error,
    currentStep,
    isAuthorized,
    noBidsAndDeadlinePassed,
    quorumNotMetAndDeadlinePassed,
    isDetailsOpen,
    setIsDetailsOpen,
    fetchRequisitionAndQuotes,
  };
}
