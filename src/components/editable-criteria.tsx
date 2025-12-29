
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
  weight: z.coerce.number().min(1, "Weight must be at least 1%.").max(100, "Weight cannot exceed 100%."),
});

const formSchema = z.object({
  financialWeight: z.number().min(0).max(100),
  technicalWeight: z.number().min(0).max(100),
  financialCriteria: z.array(evaluationCriteriaSchema).min(1, "At least one financial criterion is required."),
  technicalCriteria: z.array(evaluationCriteriaSchema).min(1, "At least one technical criterion is required."),
}).refine(data => {
  if (data.financialWeight + data.technicalWeight !== 100) return false;
  if (data.financialCriteria.reduce((acc, c) => acc + c.weight, 0) !== 100) return false;
  if (data.technicalCriteria.reduce((acc, c) => acc + c.weight, 0) !== 100) return false;
  return true;
}, {
  message: "The sum of weights in each category (Overall, Financial, Technical) must equal 100%.",
  path: [], 
});

type CriteriaFormValues = z.infer<typeof formSchema>;

export function EditableCriteria({ requisition, onUpdate }: { requisition: PurchaseRequisition; onUpdate: () => void }) {
  const { toast } = useToast();
  const { token } = useAuth();
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<CriteriaFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: requisition.evaluationCriteria || {
      financialWeight: 40,
      technicalWeight: 60,
      financialCriteria: [{ id: `FIN-${Date.now()}`, name: 'Total Cost of Ownership', weight: 100 }],
      technicalCriteria: [
          { id: `TEC-${Date.now()}`, name: 'Adherence to Specifications', weight: 50 },
          { id: `TEC-${Date.now() + 1}`, name: 'Warranty and Support', weight: 50 },
      ],
    },
  });

  const { fields: financialFields, append: appendFinancial, remove: removeFinancial } = useFieldArray({
    control: form.control, name: "financialCriteria",
  });
  const { fields: technicalFields, append: appendTechnical, remove: removeTechnical } = useFieldArray({
    control: form.control, name: "technicalCriteria",
  });

  const onSubmit = async (values: CriteriaFormValues) => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/requisitions/${requisition.id}/criteria`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(values),
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
            <FormField
              control={form.control}
              name="financialWeight"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Overall Weighting</FormLabel>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium">Financial: {field.value}%</span>
                    <Slider
                      defaultValue={[field.value]}
                      max={100}
                      step={5}
                      onValueChange={(value) => {
                        field.onChange(value[0]);
                        form.setValue('technicalWeight', 100 - value[0]);
                      }}
                      className="w-64"
                    />
                    <span className="text-sm font-medium">Technical: {100 - field.value}%</span>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid md:grid-cols-2 gap-8">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex justify-between">
                    <span>Financial Criteria</span>
                    <Badge variant={financialTotal === 100 ? "default" : "destructive"}>{financialTotal}%</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {financialFields.map((field, index) => (
                    <div key={field.id} className="flex gap-2 items-end">
                      <FormField control={form.control} name={`financialCriteria.${index}.name`} render={({ field }) => (
                        <FormItem className="flex-1"><FormLabel className={cn(index > 0 && "sr-only")}>Criterion</FormLabel><FormControl><Input {...field} placeholder="e.g., Price Competitiveness" /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name={`financialCriteria.${index}.weight`} render={({ field }) => (
                        <FormItem className="w-28"><FormLabel className={cn(index > 0 && "sr-only")}>Weight</FormLabel><FormControl><div className="relative"><Input type="number" {...field} className="pr-7" /><Percent className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" /></div></FormControl><FormMessage /></FormItem>
                      )} />
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeFinancial(index)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => appendFinancial({ id: `FIN-${Date.now()}`, name: '', weight: 0 })}><PlusCircle className="mr-2" />Add Financial Criterion</Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex justify-between">
                    <span>Technical Criteria</span>
                    <Badge variant={technicalTotal === 100 ? "default" : "destructive"}>{technicalTotal}%</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {technicalFields.map((field, index) => (
                    <div key={field.id} className="flex gap-2 items-end">
                      <FormField control={form.control} name={`technicalCriteria.${index}.name`} render={({ field }) => (
                        <FormItem className="flex-1"><FormLabel className={cn(index > 0 && "sr-only")}>Criterion</FormLabel><FormControl><Input {...field} placeholder="e.g., Product Quality" /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name={`technicalCriteria.${index}.weight`} render={({ field }) => (
                        <FormItem className="w-28"><FormLabel className={cn(index > 0 && "sr-only")}>Weight</FormLabel><FormControl><div className="relative"><Input type="number" {...field} className="pr-7" /><Percent className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" /></div></FormControl><FormMessage /></FormItem>
                      )} />
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeTechnical(index)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => appendTechnical({ id: `TEC-${Date.now()}`, name: '', weight: 0 })}><PlusCircle className="mr-2" />Add Technical Criterion</Button>
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
