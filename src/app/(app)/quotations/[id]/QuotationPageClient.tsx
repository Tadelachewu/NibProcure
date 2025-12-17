
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { useQuotationData } from './hooks/useQuotationData';
import { useQuotationActions } from './hooks/useQuotationActions';

import { RFQHeader } from './components/RFQHeader';
import { RFQSetup } from './components/RFQSetup';
import { QuoteEvaluation } from './components/QuoteEvaluation';
import { AwardFinalization } from './components/AwardFinalization';

import { RequisitionDetailsDialog } from '@/components/requisition-details-dialog';

export function QuotationPageClient({ requisitionId }: { requisitionId: string }) {
  const router = useRouter();
  const {
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
  } = useQuotationData(requisitionId);

  const {
    handleFinalizeScores,
    handleNotifyVendor,
    handleAwardChange,
    handleManageRfq,
    handleReopenRfq,
    isFinalizing,
    isNotifying,
    isChangingAward,
  } = useQuotationActions(requisition, fetchRequisitionAndQuotes);


  if (loading) {
    return <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (error || !requisition) {
    return <div className="text-destructive text-center p-8">{error || 'Requisition not found.'}</div>;
  }

  return (
    <div className="space-y-6">
      <Button variant="outline" onClick={() => router.back()}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back
      </Button>

      <RFQHeader 
        currentStep={currentStep} 
        requisition={requisition}
        onViewDetails={() => setIsDetailsOpen(true)}
      />

      {currentStep === 'rfq' && (
        <RFQSetup 
            requisition={requisition}
            isAuthorized={isAuthorized}
            noBidsAndDeadlinePassed={noBidsAndDeadlinePassed}
            quorumNotMetAndDeadlinePassed={quorumNotMetAndDeadlinePassed}
            onRfqSent={fetchRequisitionAndQuotes}
            onManageRfq={handleManageRfq}
            onReopenRfq={handleReopenRfq}
        />
      )}

      {(currentStep === 'committee' || currentStep === 'award') && (
        <QuoteEvaluation
          requisition={requisition}
          isAuthorized={isAuthorized}
          isFinalizing={isFinalizing}
          isChangingAward={isChangingAward}
          onCommitteeUpdated={fetchRequisitionAndQuotes}
          onScoreSubmitted={fetchRequisitionAndQuotes}
          onFinalizeScores={handleFinalizeScores}
          onPromoteStandby={handleAwardChange}
          onRfqRestarted={fetchRequisitionAndQuotes}
        />
      )}
      
      {(currentStep === 'finalize' || currentStep === 'completed') && (
        <AwardFinalization
            requisition={requisition}
            isAuthorized={isAuthorized}
            isNotifying={isNotifying}
            onNotifyVendor={handleNotifyVendor}
            onContractFinalized={fetchRequisitionAndQuotes}
        />
      )}

      {requisition && (
        <RequisitionDetailsDialog
            requisition={requisition}
            isOpen={isDetailsOpen}
            onClose={() => setIsDetailsOpen(false)}
        />
      )}
    </div>
  );
}
