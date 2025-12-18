
'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { RFQDistribution } from './RFQDistribution';
import { EvaluationCommitteeManagement } from './EvaluationCommitteeManagement';
import { RFQActionDialog } from './RFQActionDialog';
import { RFQReopenCard } from './RFQReopenCard';
import { PurchaseRequisition, Vendor } from '@/lib/types';
import { useAuth } from '@/contexts/auth-context';

export function RFQSetup({
  requisition,
  vendors,
  isAuthorized,
  noBidsAndDeadlinePassed,
  quorumNotMetAndDeadlinePassed,
  onRfqSent,
}: {
  requisition: PurchaseRequisition;
  vendors: Vendor[];
  isAuthorized: boolean;
  noBidsAndDeadlinePassed: boolean;
  quorumNotMetAndDeadlinePassed: boolean;
  onRfqSent: () => void;
}) {
  const [actionDialog, setActionDialog] = useState<{ isOpen: boolean, type: 'update' | 'cancel' | 'restart' }>({ isOpen: false, type: 'restart' });

  return (
    <div className="space-y-6">
      {noBidsAndDeadlinePassed && (
        <Card className="border-amber-500">
          {/* ... Content for no bids ... */}
        </Card>
      )}
      {quorumNotMetAndDeadlinePassed && (
        <RFQReopenCard requisition={requisition} onRfqReopened={onRfqSent} />
      )}
      <div className="grid md:grid-cols-2 gap-6 items-start">
        <RFQDistribution
          requisition={requisition}
          vendors={vendors}
          onRfqSent={onRfqSent}
          isAuthorized={isAuthorized}
        />
        <EvaluationCommitteeManagement
          requisition={requisition}
          onCommitteeUpdated={onRfqSent}
          isAuthorized={isAuthorized}
        />
      </div>
      <RFQActionDialog
        action={actionDialog.type}
        requisition={requisition}
        isOpen={actionDialog.isOpen}
        onClose={() => setActionDialog({ isOpen: false, type: 'restart' })}
        onSuccess={onRfqSent}
      />
    </div>
  );
}
