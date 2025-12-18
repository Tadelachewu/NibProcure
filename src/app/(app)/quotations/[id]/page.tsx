
'use client';

import React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

import { useQuotationData } from './hooks/useQuotationData';
import { RFQHeader } from './components/RFQHeader';
import { RFQSetup } from './components/RFQSetup';
import { QuoteEvaluation } from './components/QuoteEvaluation';
import { AwardFinalization } from './components/AwardFinalization';

export default function QuotationDetailsPage() {
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
    isScoringDeadlinePassed,
    committeeQuorum,
    isAwarded,
    isScoringComplete,
    allUsers,
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
      <Button variant="outline" onClick={() => router.push('/quotations')}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to All Requisitions
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
        />
      )}

      {(currentStep === 'committee' || currentStep === 'award' || currentStep === 'finalize' || currentStep === 'completed') && (
        <QuoteEvaluation
          requisition={requisition}
          quotations={quotations}
          currentStep={currentStep}
          isAuthorized={isAuthorized}
          readyForCommitteeAssignment={readyForCommitteeAssignment}
          onSuccess={fetchRequisitionAndQuotes}
          isDeadlinePassed={isDeadlinePassed}
          isScoringDeadlinePassed={isScoringDeadlinePassed}
          isScoringComplete={isScoringComplete}
          allUsers={allUsers}
          vendors={vendors}
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
