'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { isPast } from 'date-fns';
import { PurchaseRequisition, Quotation, Vendor, PerItemAwardDetail } from '@/lib/types';

export function useQuotationData(requisitionId: string) {
  const { toast } = useToast();
  const { user, token, rfqSenderSetting, committeeQuorum, rolePermissions } = useAuth();

  const [requisition, setRequisition] = useState<PurchaseRequisition | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [deadlineCheckPerformed, setDeadlineCheckPerformed] = useState(false);

  const fetchRequisitionAndQuotes = useCallback(async () => {
    if (!requisitionId) return;
    setLoading(true);

    try {
      const [reqResponse, venResponse, quoResponse] = await Promise.all([
        fetch(`/api/requisitions/${requisitionId}`),
        fetch('/api/vendors'),
        fetch(`/api/quotations?requisitionId=${requisitionId}`),
      ]);
      const currentReq = await reqResponse.json();
      const venData = await venResponse.json();
      let quoData: Quotation[] = await quoResponse.json();

      if (currentReq) {
        setVendors(venData || []);

        if (currentReq.evaluationCriteria && quoData.length > 0) {
          quoData = quoData.map(quote => {
            const itemBids: { requisitionItemId: string; championBidScore: number; }[] = [];

            for (const reqItem of currentReq.items) {
              const proposalsForItem = quote.items.filter(item => item.requisitionItemId === reqItem.id);
              if (proposalsForItem.length === 0) continue;

              const calculatedProposals = proposalsForItem.map(proposal => {
                let totalItemScore = 0;
                let scoreCount = 0;
                quote.scores?.forEach(scoreSet => {
                  const itemScore = scoreSet.itemScores.find(is => is.quoteItemId === proposal.id);
                  if (itemScore) {
                    totalItemScore += itemScore.finalScore;
                    scoreCount++;
                  }
                });
                return scoreCount > 0 ? totalItemScore / scoreCount : 0;
              });

              const championBidScore = Math.max(...calculatedProposals);
              itemBids.push({ requisitionItemId: reqItem.id, championBidScore });
            }

            const finalVendorScore = itemBids.length > 0
              ? itemBids.reduce((acc, bid) => acc + bid.championBidScore, 0) / itemBids.length
              : 0;

            return { ...quote, finalAverageScore: finalVendorScore };
          });
        }

        setRequisition({ ...currentReq, quotations: quoData });
        setQuotations(quoData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      } else {
        toast({ variant: 'destructive', title: 'Error', description: 'Requisition not found.' });
      }

    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch data.' });
    } finally {
      setLoading(false);
    }
  }, [requisitionId, toast]);

  useEffect(() => {
    if (requisitionId && user) {
      fetchRequisitionAndQuotes();
    }
  }, [requisitionId, user, fetchRequisitionAndQuotes]);

  useEffect(() => {
    if (!requisition || !user || !token || deadlineCheckPerformed) return;

    const checkAndDecline = async () => {
      let needsRefetch = false;

      if (requisition.awardResponseDeadline && isPast(new Date(requisition.awardResponseDeadline))) {
        const awardStrategy = (requisition.rfqSettings as any)?.awardStrategy;

        if (awardStrategy === 'item') {
          for (const item of requisition.items) {
            const perItemDetails = (item.perItemAwardDetails as PerItemAwardDetail[] | undefined) || [];
            const awardedDetail = perItemDetails.find(d => d.status === 'Awarded' || d.status === 'Pending_Award');

            if (awardedDetail) {
              needsRefetch = true;
              await fetch(`/api/quotations/${awardedDetail.quotationId}/respond`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ actor: user, action: 'reject', quoteItemId: awardedDetail.quoteItemId, rejectionReason: 'deadline is passed' })
              });
            }
          }
        } else { // Single award
          const awardedQuote = quotations.find(q => q.status === 'Awarded' || q.status === 'Pending_Award');
          if (awardedQuote) {
            needsRefetch = true;
            await fetch(`/api/quotations/${awardedQuote.id}/respond`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ actor: user, action: 'reject', rejectionReason: 'deadline is passed' })
            });
          }
        }
      }

      setDeadlineCheckPerformed(true);

      if (needsRefetch) {
        toast({ title: 'Deadline Expired', description: 'An awarded vendor failed to respond in time. The award has been automatically declined.' });
        fetchRequisitionAndQuotes();
      }
    };

    checkAndDecline();
  }, [requisition, quotations, user, token, toast, fetchRequisitionAndQuotes, deadlineCheckPerformed]);

  const isAuthorized = useMemo(() => {
    if (!user || !user.roles) return false;
    if ((user.roles as any[]).some(r => r.name === 'Admin' || r.name === 'Committee')) return true;
    if (rfqSenderSetting.type === 'specific') {
      return user.id === rfqSenderSetting.userId;
    }
    if (rfqSenderSetting.type === 'all') {
      return (user.roles as any[]).some(r => r.name === 'Procurement_Officer');
    }
    return false;
  }, [user, rfqSenderSetting]);

  const isAccepted = useMemo(() => quotations.some(q => q.status === 'Accepted' || q.status === 'Partially_Awarded'), [quotations]);

  const isDeadlinePassed = useMemo(() => {
    if (!requisition) return false;
    return requisition.deadline ? isPast(new Date(requisition.deadline)) : false;
  }, [requisition]);
  
  const isAwarded = useMemo(() => {
    if (!requisition || !requisition.status) return false;
    const awardProcessStatuses = ['PostApproved', 'Awarded', 'Award_Declined', 'PO_Created', 'Closed', 'Fulfilled', 'Partially_Closed'];
    return awardProcessStatuses.includes(requisition.status) || requisition.status.startsWith('Pending_');
  }, [requisition]);

  const currentStep = useMemo((): 'rfq' | 'committee' | 'award' | 'finalize' | 'completed' => {
    if (!requisition || !requisition.status) return 'rfq';

    const completeStatuses = ['Fulfilled', 'Closed'];
    if (completeStatuses.includes(requisition.status.replace(/_/g, ' '))) return 'completed';

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
    vendors,
    quotations,
    currentStep,
    isAuthorized,
    isDeadlinePassed,
    isAwarded,
    committeeQuorum,
    fetchRequisitionAndQuotes,
  };
}
