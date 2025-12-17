
'use client';

// RFQSetup.tsx
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { RefreshCw, XCircle, Users, AlertTriangle } from 'lucide-react';
import { PurchaseRequisition, Vendor } from '@/lib/types';
import { RFQDistribution } from './RFQDistribution';
import { EvaluationCommitteeManagement } from './EvaluationCommitteeManagement';
import { RFQActionDialog } from './RFQActionDialog';
import { RFQReopenCard } from './RFQReopenCard';

export function RFQSetup({
  requisition,
  isAuthorized,
  noBidsAndDeadlinePassed,
  quorumNotMetAndDeadlinePassed,
  onRfqSent,
  onManageRfq,
  onReopenRfq,
}: {
  requisition: PurchaseRequisition;
  isAuthorized: boolean;
  noBidsAndDeadlinePassed: boolean;
  quorumNotMetAndDeadlinePassed: boolean;
  onRfqSent: () => void;
  onManageRfq: (action: 'update' | 'cancel' | 'restart', reason: string, newDeadline?: Date) => void;
  onReopenRfq: (newDeadline: Date) => void;
}) {
  const [vendors, setVendors] = useState<Vendor[]>([]); // Assuming you fetch vendors here or pass them down
  const [committeeDialogOpen, setCommitteeDialogOpen] = useState(false);

  React.useEffect(() => {
    fetch('/api/vendors').then(res => res.json()).then(setVendors);
  }, []);

  if (noBidsAndDeadlinePassed && isAuthorized) {
    return (
      <Card className="border-amber-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-600"><AlertTriangle /> RFQ Closed: No Bids Received</CardTitle>
          <CardDescription>The deadline passed with no submissions.</CardDescription>
        </CardHeader>
        <CardFooter className="gap-2">
          <Button onClick={() => onManageRfq('restart', 'No bids received')}>
            <RefreshCw className="mr-2 h-4 w-4" /> Restart RFQ
          </Button>
          <Button variant="destructive" onClick={() => onManageRfq('cancel', 'No bids received')}>
            <XCircle className="mr-2 h-4 w-4" /> Cancel RFQ
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (quorumNotMetAndDeadlinePassed && isAuthorized) {
    return <RFQReopenCard requisition={requisition} onRfqReopened={onReopenRfq} />;
  }

  return (
    <div className="grid md:grid-cols-2 gap-6 items-start">
      <RFQDistribution
        requisition={requisition}
        vendors={vendors}
        onRfqSent={onRfqSent}
        isAuthorized={isAuthorized}
      />
      <Card className="border-dashed h-full">
        <CardHeader>
          <CardTitle>Evaluation Committee</CardTitle>
          <CardDescription>Committee assignment will be available after the quotation deadline has passed.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center text-center text-muted-foreground h-4/5">
          <Users className="h-12 w-12 mb-4" />
          <p>Waiting for vendor quotes...</p>
        </CardContent>
      </Card>
    </div>
  );
}
