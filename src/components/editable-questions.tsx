
'use client';

import React, { useState } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { PurchaseRequisition } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { Loader2, MessageSquareQuestion, PlusCircle, Save, Trash2 } from 'lucide-react';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { CardTitle } from './ui/card';

const questionSchema = z.object({
  id: z.string().optional(),
  questionText: z.string().min(5, 'Question must be at least 5 characters.'),
  questionType: z.enum(['text', 'boolean', 'multiple_choice', 'file']),
  isRequired: z.boolean(),
  options: z.array(z.object({ value: z.string().min(1, "Option cannot be empty.") })).optional(),
});

const formSchema = z.object({
  customQuestions: z.array(questionSchema).optional(),
});

type QuestionsFormValues = z.infer<typeof formSchema>;

function QuestionOptions({ index }: { index: number }) {
  const { control } = useForm<QuestionsFormValues>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: `customQuestions.${index}.options`,
  });

  return (
    <div className="space-y-2">
      {fields.map((field, optionIndex) => (
        <div key={field.id} className="flex items-center gap-2">
           <FormField
              control={control}
              name={`customQuestions.${index}.options.${optionIndex}.value`}
              render={({ field }) => (
                <FormItem className="flex-1">
                  <FormControl>
                    <Input {...field} placeholder={`Option ${optionIndex + 1}`} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          <Button type="button" variant="ghost" size="sm" onClick={() => remove(optionIndex)}>Remove</Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={() => append({ value: "" })}>
        <PlusCircle className="mr-2 h-4 w-4" />
        Add Option
      </Button>
    </div>
  );
}

export function EditableQuestions({ requisition, onUpdate }: { requisition: PurchaseRequisition; onUpdate: () => void }) {
  const { toast } = useToast();
  const { token } = useAuth();
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<QuestionsFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
        customQuestions: requisition.customQuestions?.map(q => ({
            ...q,
            options: q.options?.map(opt => ({ value: opt })) || []
        })) || []
    },
  });

  const { fields: questionFields, append: appendQuestion, remove: removeQuestion } = useFieldArray({
      control: form.control,
      name: "customQuestions",
  });

  const onSubmit = async (values: QuestionsFormValues) => {
    setIsSaving(true);
    try {
        const formattedValues = {
            ...values,
            customQuestions: values.customQuestions?.map(q => ({
            ...q,
            options: q.options?.map(opt => opt.value)
            }))
        };

        const response = await fetch(`/api/requisitions/${requisition.id}/questions`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(formattedValues),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to update questions.');
        }

        toast({ title: 'Success', description: 'Vendor questions have been updated.' });
        onUpdate();
    } catch (error) {
        toast({ variant: 'destructive', title: 'Error', description: error instanceof Error ? error.message : 'An unknown error occurred.' });
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <AccordionItem value="custom-questions">
        <AccordionTrigger>
            <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquareQuestion /> Custom Questions for Vendors
            </CardTitle>
        </AccordionTrigger>
        <AccordionContent>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <div className="space-y-6">
                        {questionFields.map((field, index) => {
                            const questionType = form.watch(`customQuestions.${index}.questionType`);
                            return (
                                <div key={field.id} className="flex gap-4 items-start p-4 border rounded-lg">
                                <div className="flex-1 space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                                    <FormField control={form.control} name={`customQuestions.${index}.questionText`} render={({ field }) => (
                                        <FormItem><FormLabel>Question {index + 1}</FormLabel><FormControl><Input placeholder="e.g., What is the warranty period?" {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={form.control} name={`customQuestions.${index}.questionType`} render={({ field }) => (
                                        <FormItem><FormLabel>Question Type</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select a type" /></SelectTrigger></FormControl><SelectContent><SelectItem value="text">Open-ended Text</SelectItem><SelectItem value="boolean">True/False</SelectItem><SelectItem value="multiple_choice">Multiple Choice</SelectItem><SelectItem value="file">File Upload</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={form.control} name={`customQuestions.${index}.isRequired`} render={({ field }) => (
                                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm col-span-2"><div className="space-y-0.5"><FormLabel>Required</FormLabel></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>
                                    )} />
                                    </div>
                                    {questionType === 'multiple_choice' && (
                                    <div className="pl-4 space-y-2">
                                        <FormLabel>Multiple Choice Options</FormLabel>
                                        <QuestionOptions index={index} />
                                    </div>
                                    )}
                                </div>
                                <Button type="button" variant="ghost" size="icon" className="mt-6" onClick={() => removeQuestion(index)}><Trash2 className="h-4 w-4" /></Button>
                                </div>
                            );
                        })}
                    </div>
                    <div className="flex justify-between items-center mt-4">
                        <Button type="button" variant="outline" size="sm" onClick={() => appendQuestion({ questionText: '', questionType: 'text', isRequired: true, options: [] })}>
                            <PlusCircle className="mr-2 h-4 w-4" /> Add Question
                        </Button>
                    </div>
                     <div className="flex justify-end">
                        <Button type="submit" disabled={isSaving}>
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                            Save Questions
                        </Button>
                    </div>
                </form>
            </Form>
        </AccordionContent>
    </AccordionItem>
  );
}
