
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2, Scale, TrendingUp, TimerOff } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { PurchaseRequisition, Quotation, User, EvaluationCriterion } from '@/lib/types';
import Image from 'next/image';

const scoreFormSchema = z.object({
  committeeComment: z.string().optional(),
  itemScores: z.array(z.object({
      quoteItemId: z.string(),
      financialScores: z.array(z.object({
          criterionId: z.string(),
          score: z.coerce.number().min(0).max(100),
          comment: z.string().optional(),
      })),
      technicalScores: z.array(z.object({
          criterionId: z.string(),
          score: z.coerce.number().min(0).max(100),
          comment: z.string().optional(),
      })),
  }))
});
type ScoreFormValues = z.infer<typeof scoreFormSchema>;

export const ScoringDialog = ({ 
    quote, 
    requisition, 
    user, 
    onScoreSubmitted,
    isScoringDeadlinePassed,
    hidePrices,
}: { 
    quote: Quotation; 
    requisition: PurchaseRequisition; 
    user: User; 
    onScoreSubmitted: () => void;
    isScoringDeadlinePassed: boolean;
    hidePrices: boolean;
}) => {
    const { toast } = useToast();
    const [isSubmitting, setSubmitting] = useState(false);
    
    const form = useForm<ScoreFormValues>({
        resolver: zodResolver(scoreFormSchema),
    });

    useEffect(() => {
        if (quote && requisition) {
            const existingScoreSet = quote.scores?.find(s => s.scorerId === user.id);
            const initialItemScores = quote.items.map(item => {
                const existingItemScore = existingScoreSet?.itemScores.find(i => i.quoteItemId === item.id);
                return {
                    quoteItemId: item.id,
                    financialScores: requisition.evaluationCriteria?.financialCriteria.map(c => {
                        const existing = existingItemScore?.scores.find(s => s.criterionId === c.id || s.financialCriterionId === c.id);
                        return { criterionId: c.id, score: existing?.score || 0, comment: existing?.comment || "" };
                    }) || [],
                    technicalScores: requisition.evaluationCriteria?.technicalCriteria.map(c => {
                        const existing = existingItemScore?.scores.find(s => s.criterionId === c.id || s.technicalCriterionId === c.id);
                        return { criterionId: c.id, score: existing?.score || 0, comment: existing?.comment || "" };
                    }) || [],
                }
            });
            form.reset({
                committeeComment: existingScoreSet?.committeeComment || "",
                itemScores: initialItemScores,
            });
        }
    }, [quote, requisition, user, form]);

    const onSubmit = async (values: ScoreFormValues) => {
        setSubmitting(true);
        try {
            const response = await fetch(`/api/quotations/${quote.id}/score`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scores: values, userId: user.id }),
            });
             if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to submit scores.');
            }

            toast({ title: "Scores Submitted", description: "Your evaluation has been recorded." });
            onScoreSubmitted();

        } catch (error) {
             toast({
                variant: 'destructive',
                title: 'Error',
                description: error instanceof Error ? error.message : 'An unknown error occurred.',
            });
        } finally {
            setSubmitting(false);
        }
    };
    
    if (!requisition.evaluationCriteria) return null;
    const existingScore = quote.scores?.find(s => s.scorerId === user.id);
    const isFinancialScorer = requisition.financialCommitteeMemberIds?.includes(user.id);
    const isTechnicalScorer = requisition.technicalCommitteeMemberIds?.includes(user.id);

    const renderCriteria = (itemIndex: number, type: 'financial' | 'technical') => {
        const criteria = type === 'financial' ? requisition.evaluationCriteria!.financialCriteria : requisition.evaluationCriteria!.technicalCriteria;
        const fieldName = `itemScores.${itemIndex}.${type}Scores`;

        return criteria.map((criterion, criterionIndex) => (
            <div key={criterion.id} className="space-y-2 rounded-md border p-4">
                <div className="flex justify-between items-center">
                    <FormLabel>{criterion.name}</FormLabel>
                    <Badge variant="secondary">Weight: {criterion.weight}%</Badge>
                </div>
                 <FormField
                    control={form.control}
                    name={`${fieldName}.${criterionIndex}.score` as const}
                    render={({ field }) => (
                         <FormItem>
                            <FormControl>
                                <div className="flex items-center gap-4">
                                <Slider
                                    defaultValue={[field.value]}
                                    max={100}
                                    step={5}
                                    onValueChange={(v) => field.onChange(v[0])}
                                    disabled={!!existingScore}
                                />
                                <Input type="number" {...field} className="w-24" disabled={!!existingScore} />
                                </div>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                 />
                 <FormField
                    control={form.control}
                    name={`${fieldName}.${criterionIndex}.comment` as const}
                    render={({ field }) => (
                         <FormItem>
                             <FormControl>
                                <Textarea placeholder="Optional comment for this criterion..." {...field} rows={2} disabled={!!existingScore} />
                             </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                 />
            </div>
        ));
    };
    
    const originalItems = useMemo(() => {
        const itemIds = new Set(quote.items.map(i => i.requisitionItemId));
        return requisition.items.filter(i => itemIds.has(i.id));
    }, [requisition.items, quote.items]);

    if (!existingScore && isScoringDeadlinePassed) {
        return (
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Scoring Deadline Passed</DialogTitle>
                </DialogHeader>
                <div className="py-4 text-center">
                    <TimerOff className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">
                        The deadline for scoring this quotation has passed. Please contact the procurement officer if you need an extension.
                    </p>
                </div>
                 <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline">Close</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        );
    }
    
    return (
        <DialogContent className="max-w-4xl flex flex-col h-[95vh]">
            <DialogHeader>
                <DialogTitle>Score Quotation from {quote.vendorName}</DialogTitle>
                <DialogDescription>Evaluate each item in the quote against the requester's criteria. Your scores will be used to determine the final ranking.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 min-h-0 flex flex-col">
                <ScrollArea className="flex-1 pr-4 -mr-4">
                     <div className="space-y-6">
                        {originalItems.map(originalItem => {
                             const proposalsForItem = quote.items.filter(i => i.requisitionItemId === originalItem.id);
                             return (
                                 <Card key={originalItem.id} className="bg-muted/30">
                                     <CardHeader>
                                         <CardTitle>Requested Item: {originalItem.name} (Qty: {originalItem.quantity})</CardTitle>
                                         <CardDescription>Evaluate the following proposal(s) for this item.</CardDescription>
                                     </CardHeader>
                                     <CardContent className="space-y-4">
                                         {proposalsForItem.map(proposal => {
                                             const itemIndex = quote.items.findIndex(i => i.id === proposal.id);
                                             return (
                                                <Card key={proposal.id} className="bg-background">
                                                    <CardHeader>
                                                        <CardTitle className="text-lg">{proposal.name}</CardTitle>
                                                        {!hidePrices && 
                                                            <CardDescription>
                                                                Quantity: {proposal.quantity} | Unit Price: {proposal.unitPrice.toFixed(2)} ETB
                                                            </CardDescription>
                                                        }
                                                    </CardHeader>
                                                    <CardContent className="space-y-4">
                                                        {isFinancialScorer && !hidePrices && (
                                                            <div className="space-y-4">
                                                                <h4 className="font-semibold text-lg flex items-center gap-2"><Scale /> Financial Evaluation ({requisition.evaluationCriteria?.financialWeight}%)</h4>
                                                                {renderCriteria(itemIndex, 'financial')}
                                                            </div>
                                                        )}
                                                        {isTechnicalScorer && (
                                                            <div className="space-y-4">
                                                                <h4 className="font-semibold text-lg flex items-center gap-2"><TrendingUp /> Technical Evaluation ({requisition.evaluationCriteria?.technicalWeight}%)</h4>
                                                                {renderCriteria(itemIndex, 'technical')}
                                                            </div>
                                                        )}
                                                    </CardContent>
                                                </Card>
                                             );
                                         })}
                                     </CardContent>
                                 </Card>
                            )
                        })}
                        
                        <FormField
                            control={form.control}
                            name="committeeComment"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-lg font-semibold">Overall Comment</FormLabel>
                                    <FormControl>
                                        <Textarea placeholder="Provide an overall summary or justification for your scores for this entire quotation..." {...field} rows={4} disabled={!!existingScore} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                </ScrollArea>

                <DialogFooter className="pt-4 mt-4 border-t">
                    {existingScore ? (
                        <p className="text-sm text-muted-foreground">You have already scored this quote.</p>
                    ) : (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button type="button">
                                    Submit Score
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Confirm Your Score</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Please review your evaluation before submitting. This action cannot be undone.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                            
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Go Back &amp; Edit</AlertDialogCancel>
                                    <AlertDialogAction onClick={form.handleSubmit(onSubmit)} disabled={isSubmitting}>
                                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Confirm &amp; Submit
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                </DialogFooter>
            </form>
            </Form>
        </DialogContent>
    );
};
