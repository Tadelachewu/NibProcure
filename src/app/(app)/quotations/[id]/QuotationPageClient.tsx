'use client';

import React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

import { useQuotationData } from './hooks/useQuotationData';
import { RFQHeader } from './components/RFQHeader';
import { RFQSetup } from './components/RFQSetup';
import { QuoteEvaluation } from './components/QuoteEvaluation';
import { AwardFinalization } from './components/AwardFinalization';

export default function QuotationPageClient() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const {
    requisition,
    loading,
    vendors,
    quotations,
    currentStep,
    isAuthorized,
    isDeadlinePassed,
    committeeQuorum,
    isAwarded,
    fetchRequisitionAndQuotes,
  } = useQuotationData(id);

  if (loading || !requisition) {
    return <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const noBidsAndDeadlinePassed = isDeadlinePassed && quotations.length === 0 && requisition?.status === 'Accepting_Quotes';
  const quorumNotMetAndDeadlinePassed = isDeadlinePassed && quotations.length > 0 && !isAwarded && quotations.length < committeeQuorum;
  const readyForCommitteeAssignment = isDeadlinePassed && !noBidsAndDeadlinePassed && !quorumNotMetAndDeadlinePassed;

  return (
    <div className="space-y-6">
      <Button variant="outline" onClick={() => router.back()}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back
      </Button>

      <RFQHeader requisition={requisition} currentStep={currentStep} />
      
      {currentStep === 'rfq' && (
        <RFQSetup
          requisition={requisition}
          vendors={vendors}
          isAuthorized={isAuthorized}
          noBidsAndDeadlinePassed={noBidsAndDeadlinePassed}
          quorumNotMetAndDeadlinePassed={quorumNotMetAndDeadlinePassed}
          onRfqSent={fetchRequisitionAndQuotes}
          onSuccess={fetchRequisitionAndQuotes}
        />
      )}

      {(currentStep !== 'rfq' || readyForCommitteeAssignment) && (
        <QuoteEvaluation
          requisition={requisition}
          quotations={quotations}
          currentStep={currentStep}
          isAuthorized={isAuthorized}
          readyForCommitteeAssignment={readyForCommitteeAssignment}
          onSuccess={fetchRequisitionAndQuotes}
        />
      )}
      
      {(currentStep === 'award' || currentStep === 'finalize' || currentStep === 'completed') && (
        <AwardFinalization
          requisition={requisition}
          isAuthorized={isAuthorized}
          onSuccess={fetchRequisitionAndQuotes}
        />
      )}
    </div>
  );
}
