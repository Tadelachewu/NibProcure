
'use client';

import React, { useState } from 'react';
import { PurchaseRequisition } from '@/lib/types';
import { useAuth } from '@/contexts/auth-context';

import { EvaluationCommitteeManagement } from './EvaluationCommitteeManagement';
import { ScoringProgressTracker } from './ScoringProgressTracker';
import { AwardStandbyButton } from '@/components/award-standby-button';
import { RestartRfqDialog } from '@/components/restart-rfq-dialog';
import { QuoteComparison } from './QuoteComparison';
import { Card } from '@/components/ui/card';

export function QuoteEvaluation({
  requisition,
  isAuthorized,
  isFinalizing,
  isChangingAward,
  onCommitteeUpdated,
  onScoreSubmitted,
  onFinalizeScores,
  onPromoteStandby,
  onRfqRestarted,
}: {
  requisition: PurchaseRequisition;
  isAuthorized: boolean;
  isFinalizing: boolean;
  isChangingAward: boolean;
  onCommitteeUpdated: () => void;
  onScoreSubmitted: () => void;
  onFinalizeScores: (awardStrategy: 'all' | 'item', awards: any, awardResponseDeadline?: Date) => void;
  onPromoteStandby: () => void;
  onRfqRestarted: () => void;
}) {
  const { allUsers } = useAuth();
  const [committeeDialogOpen, setCommitteeDialogOpen] = useState(false);
  
  return (
    <div className="space-y-6">
      <EvaluationCommitteeManagement
        requisition={requisition}
        onCommitteeUpdated={onCommitteeUpdated}
        open={committeeDialogOpen}
        onOpenChange={setCommitteeDialogOpen}
        isAuthorized={isAuthorized}
      />
      
      <QuoteComparison
        requisition={requisition}
        onScoreSubmitted={onScoreSubmitted}
      />

      <ScoringProgressTracker
        requisition={requisition}
        allUsers={allUsers}
        onFinalize={onFinalizeScores}
        onCommitteeUpdate={() => setCommitteeDialogOpen(true)}
        isFinalizing={isFinalizing}
      />
      
      {isAuthorized && (
        <Card className="p-4 flex gap-4">
            <AwardStandbyButton
                requisition={requisition}
                quotations={requisition.quotations || []}
                onPromote={onPromoteStandby}
                isChangingAward={isChangingAward}
            />
             <RestartRfqDialog
                requisition={requisition}
                vendors={[]} // Vendors are not needed here as it's fetched inside
                onRfqRestarted={onRfqRestarted}
            />
        </Card>
      )}
    </div>
  );
}
