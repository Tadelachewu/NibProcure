
'use client';

import React, { useState } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Slider } from './ui/slider';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { PurchaseRequisition } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Info, Loader2, Percent, PlusCircle, Save, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from './ui/badge';

const evaluationCriteriaSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Criterion name is required."),
  // Weight is optional for compliance-only flow; keep for compatibility but do not strictly validate
  weight: z.number().optional(),
});

const formSchema = z.object({
  // We keep weights in the payload for compatibility, but relax validation
  financialWeight: z.number().optional(),
  technicalWeight: z.number().optional(),
  // allow empty arrays so UI can represent a single merged criterion without failing validation
  financialCriteria: z.array(evaluationCriteriaSchema).min(0),
  technicalCriteria: z.array(evaluationCriteriaSchema).min(0),
});

type CriteriaFormValues = z.infer<typeof formSchema>;

export function EditableCriteria({ requisition, onUpdate }: { requisition: PurchaseRequisition; onUpdate: () => void }) {
  const { toast } = useToast();
  const { token } = useAuth();
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<CriteriaFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: requisition.evaluationCriteria || {
      // default to single compliance criterion under technical with full weight
      financialWeight: 0,
      technicalWeight: 100,
      financialCriteria: [],
      technicalCriteria: [{ id: `TEC-${Date.now()}`, name: 'Adherence to Specifications', weight: 100 }],
    },
  });

  const { fields: financialFields } = useFieldArray({ control: form.control, name: "financialCriteria" });
  const { fields: technicalFields } = useFieldArray({ control: form.control, name: "technicalCriteria" });

  const onSubmit = async (values: CriteriaFormValues) => {
    setIsSaving(true);
    try {
      // Transform to minimal compliance payload: put single criterion into technicalCriteria with weight 100
      const singleTechnical = (values.technicalCriteria && values.technicalCriteria[0]) || { id: `TEC-${Date.now()}`, name: 'Adherence to Specifications', weight: 100 };
      const payload = {
        financialWeight: 0,
        technicalWeight: 100,
        financialCriteria: [],
        technicalCriteria: [{ id: singleTechnical.id || `TEC-${Date.now()}`, name: singleTechnical.name || 'Adherence to Specifications', weight: 100 }]
      };

      const response = await fetch(`/api/requisitions/${requisition.id}/criteria`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update criteria.');
      }

      toast({ title: 'Success', description: 'Evaluation criteria have been updated.' });
      onUpdate();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: error instanceof Error ? error.message : 'An unknown error occurred.' });
    } finally {
      setIsSaving(false);
    }
  };

  const financialWeight = form.watch('financialWeight');
  const financialTotal = (form.watch('financialCriteria') || []).reduce((acc, c) => acc + (Number(c.weight) || 0), 0);
  const technicalTotal = (form.watch('technicalCriteria') || []).reduce((acc, c) => acc + (Number(c.weight) || 0), 0);

  return (
    <AccordionItem value="evaluation-criteria">
      <AccordionTrigger>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Percent /> Evaluation Criteria
        </CardTitle>
      </AccordionTrigger>
      <AccordionContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* For compliance-only flow we replace weighted financial/technical inputs
                with a single default criterion. The backend will be populated with
                technicalWeight=100 and the single technical criterion. */}
            <div>
              <FormLabel>Evaluation</FormLabel>
              <p className="text-sm text-muted-foreground">This requisition uses a single compliance criterion: <strong>Adherence to Specifications</strong>. Committee members will mark each quote item as Comply / Non‑comply.</p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Evaluation Criterion</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Single criterion editor: map into technicalCriteria with weight=100 on save */}
                  {technicalFields.slice(0,1).map((field, index) => (
                    <div key={field.id} className="flex gap-2 items-end">
                      <FormField control={form.control} name={`technicalCriteria.${index}.name`} render={({ field }) => (
                        <FormItem className="flex-1"><FormLabel>Criterion</FormLabel><FormControl><Input {...field} placeholder="Adherence to Specifications" /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name={`technicalCriteria.${index}.weight`} render={({ field }) => (
                        <FormItem className="w-28"><FormLabel>Weight</FormLabel><FormControl><div className="relative"><Input type="number" {...field} className="pr-7" value={100} disabled /></div></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
            {form.formState.errors.root && (
              <Alert variant="destructive" className="mt-2">
                <Info className="h-4 w-4" />
                <AlertTitle>Error in Evaluation Criteria</AlertTitle>
                <AlertDescription>{form.formState.errors.root?.message}</AlertDescription>
              </Alert>
            )}
            <div className="flex justify-end">
                <Button type="submit" disabled={isSaving}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                    Save Criteria
                </Button>
            </div>
          </form>
        </Form>
      </AccordionContent>
    </AccordionItem>
  );
}
