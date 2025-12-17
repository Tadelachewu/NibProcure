
'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Eye } from 'lucide-react';
import { PurchaseRequisition } from '@/lib/types';
import { formatEvaluationCriteria, WorkflowStepper } from './utils';
import { EvaluationCriteria } from '@/lib/types';
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ClipboardList } from 'lucide-react';

export function RFQHeader({
  currentStep,
  requisition,
  onViewDetails,
}: {
  currentStep: 'rfq' | 'committee' | 'award' | 'finalize' | 'completed';
  requisition: PurchaseRequisition;
  onViewDetails: () => void;
}) {
  return (
    <>
      <Card className="p-4 sm:p-6">
        <WorkflowStepper step={currentStep} />
      </Card>

      {requisition.evaluationCriteria && (
        <Card>
          <CardHeader className="flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2"><ClipboardList /> Evaluation Criteria</CardTitle>
              <CardDescription>The following criteria were set by the requester to guide quote evaluation.</CardDescription>
            </div>
            <Button variant="outline" onClick={onViewDetails} className="w-full sm:w-auto">
              <Eye className="mr-2 h-4 w-4" />
              View Requisition Details
            </Button>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground p-4 bg-muted/50 rounded-md whitespace-pre-wrap">
              {formatEvaluationCriteria(requisition.evaluationCriteria)}
            </p>
          </CardContent>
        </Card>
      )}
    </>
  );
}

