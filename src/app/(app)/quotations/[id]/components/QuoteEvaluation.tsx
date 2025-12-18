
'use client';

import React from 'react';
import { PurchaseRequisition, Quotation, Vendor, User } from '@/lib/types';
import { QuoteComparison } from './QuoteComparison';
import { EvaluationCommitteeManagement } from './EvaluationCommitteeManagement';
import { ScoringProgressTracker } from './ScoringProgressTracker';
import { useAuth } from '@/contexts/auth-context';

export function QuoteEvaluation({
  requisition,
  quotations,
  currentStep,
  isAuthorized,
  readyForCommitteeAssignment,
  onSuccess,
  isDeadlinePassed,
  isScoringDeadlinePassed,
  isScoringComplete,
  allUsers,
  vendors,
}: {
  requisition: PurchaseRequisition;
  quotations: Quotation[];
  currentStep: 'committee' | 'award' | 'finalize' | 'completed';
  isAuthorized: boolean;
  readyForCommitteeAssignment: boolean;
  onSuccess: () => void;
  isDeadlinePassed: boolean;
  isScoringDeadlinePassed: boolean;
  isScoringComplete: boolean;
  allUsers: User[];
  vendors: Vendor[];
}) {
  const { user, role, rfqSenderSetting, committeeQuorum } = useAuth();
  const [isCommitteeDialogOpen, setCommitteeDialogOpen] = React.useState(false);
  const [isFinalizing, setIsFinalizing] = React.useState(false);

  const handleFinalizeScores = async (awardStrategy: 'all' | 'item', awards: any, awardResponseDeadline?: Date, minuteDocumentUrl?: string, minuteJustification?: string) => {
    if (!user) return;
    setIsFinalizing(true);
    // This logic is now in useQuotationActions hook, but for the purpose of this file extraction, we keep it here.
    // In a future refactor, this could be moved.
    try {
        const response = await fetch(`/api/requisitions/${requisition.id}/finalize-scores`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: user.id,
                awards,
                awardStrategy,
                awardResponseDeadline,
                minuteDocumentUrl,
                minuteJustification,
            }),
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to finalize scores.');
        }
        onSuccess();
    } catch (error) {
        // Error handling would be here
    } finally {
        setIsFinalizing(false);
    }
  };

  return (
    <div className="space-y-6">
      {readyForCommitteeAssignment && (
        <EvaluationCommitteeManagement
          requisition={requisition}
          onCommitteeUpdated={onSuccess}
          open={isCommitteeDialogOpen}
          onOpenChange={setCommitteeDialogOpen}
          isAuthorized={isAuthorized}
        />
      )}

      <QuoteComparison
        quotes={quotations}
        requisition={requisition}
        user={user!}
        isDeadlinePassed={isDeadlinePassed}
        isScoringDeadlinePassed={isScoringDeadlinePassed}
        isAwarded={isScoringComplete}
        onScore={() => {}}
      />
      
      <ScoringProgressTracker
        requisition={requisition}
        quotations={quotations}
        allUsers={allUsers}
        onFinalize={handleFinalizeScores}
        onCommitteeUpdate={setCommitteeDialogOpen}
        isFinalizing={isFinalizing}
      />
    </div>
  );
}
