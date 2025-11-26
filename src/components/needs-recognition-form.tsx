
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm, useFormContext } from 'react-hook-form';
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
import { PlusCircle, Trash2, Loader2, Send, Percent, Info, Save } from 'lucide-react';
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
import { Slider } from './ui/slider';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';


const evaluationCriteriaSchema = z.object({
      id: z.string(),
      name: z.string().min(1, "Criterion name is required."),
      weight: z.coerce.number().min(1, "Weight must be at least 1%.").max(100, "Weight cannot exceed 100%."),
});

const baseFormSchema = z.object({
  requesterId: z.string(),
  department: z.string().min(1, 'Department is required.'),
  title: z.string().min(5, 'Title must be at least 5 characters.'),
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
  }),
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

const formSchema = baseFormSchema.refine(data => data.evaluationCriteria.financialWeight + data.evaluationCriteria.technicalWeight === 100, {
    message: "Total weight for Financial and Technical criteria must be 100%.",
    path: ["evaluationCriteria.financialWeight"],
}).refine(data => data.evaluationCriteria.financialCriteria.reduce((acc, c) => acc + c.weight, 0) === 100, {
    message: "Total weight for financial criteria must be 100%.",
    path: ["evaluationCriteria.financialCriteria"],
}).refine(data => data.evaluationCriteria.technicalCriteria.reduce((acc, c) => acc + c.weight, 0) === 100, {
    message: "Total weight for technical criteria must be 100%.",
    path: ["evaluationCriteria.technicalCriteria"],
});


// A more lenient schema for saving drafts
const draftFormSchema = baseFormSchema.deepPartial();


interface NeedsRecognitionFormProps {
    existingRequisition?: PurchaseRequisition;
    onSuccess?: () => void;
}

export function NeedsRecognitionForm({ existingRequisition, onSuccess }: NeedsRecognitionFormProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const { user, departments } = useAuth();
  const isEditMode = !!existingRequisition;

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
      evaluationCriteria: {
          financialWeight: 40,
          technicalWeight: 60,
          financialCriteria: [{ id: `FIN-${Date.now()}`, name: 'Total Cost of Ownership', weight: 100 }],
          technicalCriteria: [
              { id: `TEC-${Date.now()}`, name: 'Adherence to Specifications', weight: 50 },
              { id: `TEC-${Date.now()+1}`, name: 'Warranty and Support', weight: 50 },
          ],
      },
      items: [{ id: `ITEM-${Date.now()}`, name: '', quantity: 1, unitPrice: 0, description: '' }],
      customQuestions: [],
    },
  });

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

  const { fields: questionFields, append: appendQuestion, remove: removeQuestion } = useFieldArray({
      control: form.control,
      name: "customQuestions",
  });
  
  const { fields: financialFields, append: appendFinancial, remove: removeFinancial } = useFieldArray({
    control: form.control, name: "evaluationCriteria.financialCriteria",
  });
  const { fields: technicalFields, append: appendTechnical, remove: removeTechnical } = useFieldArray({
      control: form.control, name: "evaluationCriteria.technicalCriteria",
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
      console.error(validationResult.error.flatten().fieldErrors);
      setLoading(false);
      // Manually trigger form validation to show errors
      await form.trigger();
      return;
    }
    
    try {
        const formattedValues = {
            ...values,
            customQuestions: values.customQuestions?.map(q => ({
            ...q,
            options: q.options?.map(opt => opt.value)
            }))
        };

        const status = isDraft ? 'Draft' : 'Pending_Approval';
        const body = { ...formattedValues, id: existingRequisition?.id, status: status, userId: user?.id };
        
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

  const handleFormSubmit = async () => {
    await onFinalSubmit(form.getValues(), false);
  };


  const financialWeight = form.watch('evaluationCriteria.financialWeight');
  const financialTotal = (form.watch('evaluationCriteria.financialCriteria') || []).reduce((acc, c) => acc + (Number(c.weight) || 0), 0);
  const technicalTotal = (form.watch('evaluationCriteria.technicalCriteria') || []).reduce((acc, c) => acc + (Number(c.weight) || 0), 0);

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
          <form onSubmit={(e) => { e.preventDefault(); handleFormSubmit(); }} className="space-y-8">
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
                         <Select onValueChange={field.onChange} value={field.value} disabled={isEditMode}>
                            <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder="Select your department" />
                            </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                            {departments.map(dept => (
                                <SelectItem key={dept.id} value={dept.name}>{dept.name}</SelectItem>
                            ))}
                            </SelectContent>
                        </Select>
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

            <div>
              <h3 className="text-lg font-medium mb-4">Items</h3>
              <div className="space-y-6">
                {fields.map((field, index) => (
                  <div
                    key={field.id}
                    className="flex gap-4 items-start p-4 border rounded-lg relative"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 flex-1">
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
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      onClick={() => remove(index)}
                      className="mt-6"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
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
            </div>

             <Separator />

            <div className="space-y-6">
                 <h3 className="text-lg font-medium">Evaluation Criteria</h3>
                 <FormDescription>Define how vendor quotes will be scored by the committee.</FormDescription>
                
                 <FormField
                    control={form.control}
                    name="evaluationCriteria.financialWeight"
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
                                        form.setValue('evaluationCriteria.technicalWeight', 100 - value[0]);
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
                                    <FormField control={form.control} name={`evaluationCriteria.financialCriteria.${index}.name`} render={({field}) => (
                                        <FormItem className="flex-1"><FormLabel className={cn(index>0 && "sr-only")}>Criterion</FormLabel><FormControl><Input {...field} placeholder="e.g., Price Competitiveness"/></FormControl><FormMessage/></FormItem>
                                    )}/>
                                    <FormField control={form.control} name={`evaluationCriteria.financialCriteria.${index}.weight`} render={({field}) => (
                                        <FormItem className="w-28"><FormLabel className={cn(index>0 && "sr-only")}>Weight</FormLabel><FormControl><div className="relative"><Input type="number" {...field} className="pr-7"/><Percent className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground"/></div></FormControl><FormMessage/></FormItem>
                                    )}/>
                                    <Button type="button" variant="ghost" size="icon" onClick={() => removeFinancial(index)}><Trash2 className="h-4 w-4"/></Button>
                                </div>
                            ))}
                            <Button type="button" variant="outline" size="sm" onClick={() => appendFinancial({ id: `FIN-${Date.now()}`, name: '', weight: 0})}><PlusCircle className="mr-2"/>Add Financial Criterion</Button>
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
                                    <FormField control={form.control} name={`evaluationCriteria.technicalCriteria.${index}.name`} render={({field}) => (
                                        <FormItem className="flex-1"><FormLabel className={cn(index>0 && "sr-only")}>Criterion</FormLabel><FormControl><Input {...field} placeholder="e.g., Product Quality"/></FormControl><FormMessage/></FormItem>
                                    )}/>
                                    <FormField control={form.control} name={`evaluationCriteria.technicalCriteria.${index}.weight`} render={({field}) => (
                                        <FormItem className="w-28"><FormLabel className={cn(index>0 && "sr-only")}>Weight</FormLabel><FormControl><div className="relative"><Input type="number" {...field} className="pr-7"/><Percent className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground"/></div></FormControl><FormMessage/></FormItem>
                                    )}/>
                                    <Button type="button" variant="ghost" size="icon" onClick={() => removeTechnical(index)}><Trash2 className="h-4 w-4"/></Button>
                                </div>
                            ))}
                             <Button type="button" variant="outline" size="sm" onClick={() => appendTechnical({ id: `TEC-${Date.now()}`, name: '', weight: 0})}><PlusCircle className="mr-2"/>Add Technical Criterion</Button>
                        </CardContent>
                    </Card>
                </div>
                 {form.formState.errors.evaluationCriteria?.financialCriteria && (
                    <Alert variant="destructive" className="mt-2">
                        <Info className="h-4 w-4" />
                        <AlertTitle>Error in Financial Criteria</AlertTitle>
                        <AlertDescription>{form.formState.errors.evaluationCriteria.financialCriteria.root?.message}</AlertDescription>
                    </Alert>
                )}
                 {form.formState.errors.evaluationCriteria?.technicalCriteria && (
                    <Alert variant="destructive" className="mt-2">
                        <Info className="h-4 w-4" />
                        <AlertTitle>Error in Technical Criteria</AlertTitle>
                        <AlertDescription>{form.formState.errors.evaluationCriteria.technicalCriteria.root?.message}</AlertDescription>
                    </Alert>
                )}
            </div>

            <Separator />
            
            <div>
              <h3 className="text-lg font-medium mb-4">Custom Questions for Vendors</h3>
              <FormDescription>Add questions to gather specific information from vendors with their quotes.</FormDescription>
              <div className="space-y-6 mt-4">
                {questionFields.map((field, index) => {
                  const questionType = form.watch(`customQuestions.${index}.questionType`);
                  return (
                    <div key={field.id} className="flex gap-4 items-start p-4 border rounded-lg">
                      <div className="flex-1 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                          <FormField
                            control={form.control}
                            name={`customQuestions.${index}.questionText`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Question {index + 1}</FormLabel>
                                <FormControl>
                                  <Input placeholder="e.g., What is the warranty period?" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                           <FormField
                              control={form.control}
                              name={`customQuestions.${index}.questionType`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Question Type</FormLabel>
                                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                      <SelectTrigger><SelectValue placeholder="Select a type" /></SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="text">Open-ended Text</SelectItem>
                                      <SelectItem value="boolean">True/False</SelectItem>
                                      <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                                      <SelectItem value="file">File Upload</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                             <FormField
                                control={form.control}
                                name={`customQuestions.${index}.requisitionItemId`}
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel>Link to Item (Optional)</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value || "general"}>
                                        <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select an item" />
                                        </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="general">General (Not item-specific)</SelectItem>
                                            {itemsWatch.map((item, itemIndex) => (
                                                <SelectItem key={item.id} value={item.id!}>
                                                    {`Item ${itemIndex + 1}: ${item.name || 'Untitled Item'}`}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                    </FormItem>
                                )}
                            />
                              <FormField
                                control={form.control}
                                name={`customQuestions.${index}.isRequired`}
                                render={({ field }) => (
                                  <FormItem className="flex flex-col pt-2">
                                    <FormLabel>Required</FormLabel>
                                    <FormControl>
                                       <Switch
                                          checked={field.value}
                                          onCheckedChange={field.onChange}
                                        />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                        </div>
                         {questionType === 'multiple_choice' && (
                          <div className="pl-4 space-y-2">
                            <FormLabel>Multiple Choice Options</FormLabel>
                            <QuestionOptions index={index} />
                          </div>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="mt-6"
                        onClick={() => removeQuestion(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between items-center mt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => appendQuestion({ questionText: '', questionType: 'text', isRequired: true, options: [] })}
                >
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add Question
                </Button>
              </div>
            </div>

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
                
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button type="button" disabled={loading}>
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                            Submit for Approval
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Are you ready to submit?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This will submit the requisition to your department head for approval. You will not be able to edit it after submission unless it is rejected.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleFormSubmit}>
                                Yes, Submit for Approval
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function QuestionOptions({ index }: { index: number }) {
  const { control } = useFormContext();
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
