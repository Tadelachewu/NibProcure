
'use client';

import { PurchaseRequisition, EvaluationCriteria } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Eye, ClipboardList } from 'lucide-react';
import { useState } from 'react';
import { RequisitionDetailsDialog } from '@/components/requisition-details-dialog';
import { WorkflowStepper } from './WorkflowStepper';

function formatEvaluationCriteria(criteria?: EvaluationCriteria) {
    if (!criteria) return "No specific criteria defined.";

    const formatSection = (title: string, weight: number, items: any[]) => {
        if (!items || items.length === 0) return `${title} (Overall Weight: ${weight}%):\n- No criteria defined.`;
        const itemDetails = items.map(item => `- ${item.name} (${item.weight}%)`).join('\n');
        return `${title} (Overall Weight: ${weight}%):\n${itemDetails}`;
    };

    const financialPart = formatSection(
        'Financial Criteria',
        criteria.financialWeight,
        criteria.financialCriteria
    );

    const technicalPart = formatSection(
        'Technical Criteria',
        criteria.technicalWeight,
        criteria.technicalCriteria
    );

    return `${financialPart}\n\n${technicalPart}`;
};

export function RFQHeader({
  requisition,
  currentStep
}: {
  requisition: PurchaseRequisition;
  currentStep: 'rfq' | 'committee' | 'award' | 'finalize' | 'completed';
}) {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

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
            <Button variant="outline" onClick={() => setIsDetailsOpen(true)} className="w-full sm:w-auto">
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
      
      <RequisitionDetailsDialog
        requisition={requisition}
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
      />
    </>
  );
}
