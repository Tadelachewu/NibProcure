
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from './ui/card';
import { PlusCircle, Trash2, Loader2, Save } from 'lucide-react';
import { Separator } from './ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { cn } from '@/lib/utils';
import { PurchaseRequisition, Urgency } from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Badge } from './ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';


const evaluationCriteriaSchema = z.object({
      id: z.string(),
      name: z.string().min(1, "Criterion name is required."),
      weight: z.coerce.number().min(1, "Weight must be at least 1%.").max(100, "Weight cannot exceed 100%."),
});

const baseFormSchema = z.object({
  requesterId: z.string(),
  department: z.string().min(1, 'Department is required.'),
  title: z.string().min(1, 'Title is required.'),
  urgency: z.enum(['Low', 'Medium', 'High', 'Critical']),
  justification: z
    .string()
    .min(10, 'Justification must be at least 10 characters.'),
  attachments: z.any().optional(),
  items: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().min(2, 'Item name is required.'),
        quantity: z.coerce.number().min(1, 'Quantity must be at least 1.'),
        unitPrice: z.coerce.number().optional(),
        description: z.string().optional(),
      })
    )
    .min(1, 'At least one item is required.'),
  evaluationCriteria: z.object({
    financialWeight: z.number().min(0).max(100),
    technicalWeight: z.number().min(0).max(100),
    financialCriteria: z.array(evaluationCriteriaSchema).min(1, "At least one financial criterion is required."),
    technicalCriteria: z.array(evaluationCriteriaSchema).min(1, "At least one technical criterion is required."),
  }).optional(),
  customQuestions: z.array(
    z.object({
      id: z.string().optional(),
      questionText: z.string().min(5, 'Question must be at least 5 characters.'),
      questionType: z.enum(['text', 'boolean', 'multiple_choice', 'file']),
      isRequired: z.boolean(),
      options: z.array(z.object({ value: z.string().min(1, "Option cannot be empty.") })).optional(),
      requisitionItemId: z.string().optional(),
    })
  ).optional(),
});

// A more lenient schema for saving drafts
const draftFormSchema = baseFormSchema.deepPartial().extend({
    title: z.string().min(1, "Title is required to save a draft."),
});

const formSchema = baseFormSchema.refine(data => {
  if (!data.evaluationCriteria) return true;
    const { financialWeight, technicalWeight, financialCriteria, technicalCriteria } = data.evaluationCriteria;

    if (financialWeight + technicalWeight !== 100) {
        return false;
    }
    if (financialCriteria.reduce((acc, c) => acc + c.weight, 0) !== 100) {
        return false;
    }
     if (technicalCriteria.reduce((acc, c) => acc + c.weight, 0) !== 100) {
        return false;
    }
    return true;
}, {
    message: "The sum of weights in each evaluation category (Overall, Financial, Technical) must equal 100%.",
    path: ["evaluationCriteria"],
});


interface NeedsRecognitionFormProps {
    existingRequisition?: PurchaseRequisition;
    onSuccess?: () => void;
}

export function NeedsRecognitionForm({ existingRequisition, onSuccess }: NeedsRecognitionFormProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const { user, departments } = useAuth();
  const isEditMode = !!existingRequisition;
  const storageKey = isEditMode ? `requisition-form-${existingRequisition.id}` : 'new-requisition-form';

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: isEditMode ? {
        ...existingRequisition,
        requesterId: existingRequisition.requesterId,
        department: existingRequisition.department || user?.department,
        title: existingRequisition.title,
        urgency: existingRequisition.urgency || 'Low',
        justification: existingRequisition.justification,
        evaluationCriteria: existingRequisition.evaluationCriteria,
        items: existingRequisition.items.map(item => ({
            id: item.id,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            description: item.description,
        })),
        customQuestions: existingRequisition.customQuestions?.map(q => ({
            ...q,
            options: q.options?.map(opt => ({ value: opt })) || []
        }))
    } : {
      requesterId: user?.id || '',
      department: user?.department || '',
      title: '',
      urgency: 'Low',
      justification: '',
      items: [{ id: `ITEM-${Date.now()}`, name: '', quantity: 1, unitPrice: 0, description: '' }],
    },
  });

  // Load from localStorage on mount
  useEffect(() => {
    const savedData = localStorage.getItem(storageKey);
    if (savedData) {
        try {
            const parsedData = JSON.parse(savedData);
            form.reset(parsedData);
            toast({ title: 'Form Restored', description: 'Your previously entered data has been restored.' });
        } catch (e) {
            console.error("Failed to parse saved form data", e);
        }
    }
  }, [storageKey, form, toast]);

  // Save to localStorage on change
  useEffect(() => {
      const subscription = form.watch((value) => {
          localStorage.setItem(storageKey, JSON.stringify(value));
      });
      return () => subscription.unsubscribe();
  }, [form, storageKey]);


  useEffect(() => {
    // If user data loads after form initialization, update the fields
    if (user && !isEditMode) {
        form.setValue('department', user.department || '');
        form.setValue('requesterId', user.id || '');
    }
  }, [user, form, isEditMode]);

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  const itemsWatch = form.watch('items');

  const onFinalSubmit = async (values: z.infer<typeof formSchema>, isDraft: boolean) => {
    setLoading(true);

    const schemaToUse = isDraft ? draftFormSchema : formSchema;
    const validationResult = schemaToUse.safeParse(values);

    if (!validationResult.success) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please check the form for errors before submitting.",
      });
      try {
        const fieldErrors = validationResult.error?.flatten?.()?.fieldErrors ?? {};
        console.error(fieldErrors);
      } catch (e) {
        console.error('Validation error (unable to flatten):', validationResult.error ?? e);
      }
      setLoading(false);
      // Manually trigger form validation to show errors
      await form.trigger();
      return;
    }
    
    try {
        const formattedValues = {
            ...validationResult.data,
            customQuestions: validationResult.data.customQuestions?.map(q => ({
            ...q,
            options: q.options?.map(opt => opt.value)
            }))
        };

        const status = isDraft ? 'Draft' : 'Pending_Approval';
        const body = { ...formattedValues, id: existingRequisition?.id, status: status, requesterId: user?.id };
        
        const response = await fetch('/api/requisitions', {
            method: isEditMode ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to ${isEditMode ? 'update' : 'create'} requisition.`);
        }

        toast({
            title: `Requisition ${isEditMode ? 'Updated' : (isDraft ? 'Saved' : 'Submitted')}`,
            description: `Your purchase requisition has been successfully ${isEditMode ? 'updated' : (isDraft ? 'saved as a draft' : 'submitted for approval')}.`,
        });
        
        localStorage.removeItem(storageKey); // Clear saved data on success

        if (onSuccess) {
            onSuccess();
        } else {
            form.reset();
        }
    } catch (error) {
        toast({
            variant: 'destructive',
            title: 'Submission Failed',
            description: error instanceof Error ? error.message : 'An unknown error occurred.',
        });
    } finally {
        setLoading(false);
    }
  }

  const handleSaveDraft = () => {
    onFinalSubmit(form.getValues(), true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEditMode ? 'Edit Purchase Requisition' : 'New Purchase Requisition'}</CardTitle>
        <CardDescription>
          {isEditMode ? `Editing requisition ${existingRequisition.id}. Make your changes and resubmit for approval.` : 'Fill out the form below to request a new purchase.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
         {isEditMode && existingRequisition.approverComment && (
            <Alert variant="destructive" className="mb-6">
                <AlertTitle>Rejection Reason from Approver</AlertTitle>
                <AlertDescription>"{existingRequisition.approverComment}"</AlertDescription>
            </Alert>
         )}
        <Form {...form}>
          <form onSubmit={(e) => { e.preventDefault(); }} className="space-y-8">
            <div className="grid md:grid-cols-2 gap-8">
                <FormItem>
                  <FormLabel>Your Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Jane Doe" value={user?.name || ''} disabled />
                  </FormControl>
                </FormItem>
                 <FormField
                    control={form.control}
                    name="department"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Department</FormLabel>
                        <FormControl>
                            <Input {...field} disabled />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
            </div>
            
            <div className="grid md:grid-cols-2 gap-8">
                <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Requisition Title</FormLabel>
                    <FormControl>
                        <Input
                        placeholder="e.g. New Laptops for Design Team"
                        {...field}
                        />
                    </FormControl>
                    <FormDescription>
                        A short, descriptive title for your request.
                    </FormDescription>
                    <FormMessage />
                    </FormItem>
                )}
                />
                 <FormField
                  control={form.control}
                  name="urgency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Urgency</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a priority level" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(['Low', 'Medium', 'High', 'Critical'] as Urgency[]).map(level => (
                            <SelectItem key={level} value={level}>{level}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                       <FormDescription>
                        How urgently is this request needed?
                    </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
            </div>

            <Separator />

             <Accordion type="single" collapsible defaultValue="item-0">
                <AccordionItem value="items-section">
                    <AccordionTrigger className="text-lg font-medium">Items</AccordionTrigger>
                    <AccordionContent className="pt-4">
                         <div className="space-y-6">
                            {fields.map((field, index) => (
                            <Accordion key={field.id} type="single" collapsible className="border rounded-lg" defaultValue={`item-${index}`}>
                                <AccordionItem value={`item-${index}`}>
                                <div className="flex items-center px-4 py-2 bg-muted/50 rounded-t-lg">
                                    <AccordionTrigger className="flex-1 py-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold">{form.watch(`items.${index}.name`) || `Item ${index + 1}`}</span>
                                            <Badge variant="outline">Qty: {form.watch(`items.${index}.quantity`) || 0}</Badge>
                                        </div>
                                    </AccordionTrigger>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => remove(index)}
                                        className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                                <AccordionContent className="p-4">
                                     <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                                        <FormField
                                            control={form.control}
                                            name={`items.${index}.name`}
                                            render={({ field }) => (
                                            <FormItem className="md:col-span-3">
                                                <FormLabel>Item Name</FormLabel>
                                                <FormControl>
                                                <Input
                                                    placeholder="e.g. MacBook Pro 16-inch"
                                                    {...field}
                                                />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name={`items.${index}.quantity`}
                                            render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Quantity</FormLabel>
                                                <FormControl>
                                                <Input type="number" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name={`items.${index}.description`}
                                            render={({ field }) => (
                                            <FormItem className="md:col-span-5">
                                                <FormLabel>Description (Optional)</FormLabel>
                                                <FormControl>
                                                <Textarea
                                                    placeholder="Add any specific details, model numbers, or specifications here..."
                                                    {...field}
                                                />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                            )}
                                        />
                                        </div>
                                </AccordionContent>
                                </AccordionItem>
                            </Accordion>
                            ))}
                        </div>
                        <div className="flex justify-between items-center mt-4">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                append({ id: `ITEM-${Date.now()}`, name: '', quantity: 1, unitPrice: 0, description: '' })
                                }
                            >
                                <PlusCircle className="mr-2 h-4 w-4" />
                                Add Item
                            </Button>
                        </div>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>


             <Separator />

            
             <FormField
              control={form.control}
              name="justification"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Business Justification</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Explain why this purchase is necessary..."
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <Separator />

            <div className="grid md:grid-cols-2 gap-8">
              <FormField
                control={form.control}
                name="attachments"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>File Attachments</FormLabel>
                    <FormControl>
                      <Input type="file" {...form.register('attachments')} />
                    </FormControl>
                    <FormDescription>
                      Attach any relevant documents (quotes, specs, etc.).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="flex justify-end items-center gap-4">
                <Button type="button" onClick={handleSaveDraft} variant="secondary" disabled={loading}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save as Draft
                </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}


