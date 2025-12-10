

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PurchaseOrder, PurchaseRequisition, Quotation, QuoteItem, PerItemAwardDetail } from '@/lib/types';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2, Send, ArrowLeft, CheckCircle, FileText, BadgeInfo, FileUp, CircleCheck, Info, Edit, FileEdit, PlusCircle, Trash2, ThumbsDown, ThumbsUp, Timer, Image as ImageIcon } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { format, isPast } from 'date-fns';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Image from 'next/image';
import { Label } from '@/components/ui/label';

const quoteFormSchema = z.object({
  notes: z.string().optional(),
  items: z.array(z.object({
    requisitionItemId: z.string(),
    name: z.string().min(1, "Item name cannot be empty."),
    quantity: z.number(),
    unitPrice: z.coerce.number().min(0.01, "Price is required."),
    leadTimeDays: z.coerce.number().min(0, "Lead time is required."),
    brandDetails: z.string().optional(),
    imageUrl: z.string().optional(),
  })),
  answers: z.array(z.object({
      questionId: z.string(),
      answer: z.string().min(1, "This question requires an answer."),
  })).optional(),
  cpoDocumentUrl: z.string().optional(),
  experienceDocumentUrl: z.string().optional(),
  summaryDocumentUrl: z.string().optional(),
}).refine(
    (data, ctx) => {
        // This is a placeholder for the actual requisition data
        // In a real app, you'd pass the requisition data to the validation context
        // For now, we'll make cpoDocumentUrl optional and handle the logic in the component
        return true;
    }
);


const invoiceFormSchema = z.object({
    documentUrl: z.string().optional(),
    invoiceDate: z.string().min(1, "Invoice date is required"),
    invoiceFile: z.any().optional(),
});

function InvoiceSubmissionForm({ po, onInvoiceSubmitted }: { po: PurchaseOrder; onInvoiceSubmitted: () => void }) {
    const { toast } = useToast();
    const { user, token } = useAuth();
    const [isSubmitting, setSubmitting] = useState(false);
    const form = useForm<z.infer<typeof invoiceFormSchema>>({
        resolver: zodResolver(invoiceFormSchema),
        defaultValues: {
            invoiceDate: new Date().toISOString().split('T')[0],
        },
    });

    const handleFileUpload = async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('directory', 'invoices');
        
        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'File upload failed');
            }
            return result.path;
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Upload Failed',
                description: error instanceof Error ? error.message : 'Could not upload file.',
            });
            return null;
        }
    };


    const onSubmit = async (values: z.infer<typeof invoiceFormSchema>) => {
        if (!user || !po || !token) return;
        if (!values.invoiceFile || values.invoiceFile.length === 0) {
            toast({ variant: 'destructive', title: 'Error', description: 'Please upload an invoice document.' });
            return;
        }

        setSubmitting(true);
        try {

            const uploadedPath = await handleFileUpload(values.invoiceFile[0]);
            if (!uploadedPath) {
                setSubmitting(false);
                return;
            }

            const response = await fetch('/api/invoices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    purchaseOrderId: po.id,
                    vendorId: po.vendor.id,
                    invoiceDate: values.invoiceDate,
                    documentUrl: uploadedPath,
                    items: po.items,
                    totalAmount: po.totalAmount,
                    actorUserId: user.id
                }),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to submit invoice.');
            }
            toast({ title: 'Invoice Submitted', description: 'Your invoice has been sent to the procurement team for review.' });
            onInvoiceSubmitted();
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

    return (
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Submit Invoice for PO: {po.id}</DialogTitle>
                <DialogDescription>
                    Please confirm the invoice details and upload your document.
                </DialogDescription>
            </DialogHeader>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <Card className="bg-muted/50">
                        <CardHeader><CardTitle className="text-lg">Invoice Summary</CardTitle></CardHeader>
                        <CardContent>
                            <div className="space-y-2 text-sm">
                                {po.items.map(item => (
                                    <div key={item.id} className="flex justify-between">
                                        <span>{item.name} x {item.quantity}</span>
                                        <span>{item.totalPrice.toFixed(2)} ETB</span>
                                    </div>
                                ))}
                                <Separator />
                                <div className="flex justify-between font-bold">
                                    <span>Total Amount</span>
                                    <span>{po.totalAmount.toFixed(2)} ETB</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <div className="grid grid-cols-2 gap-4">
                        <FormField
                            control={form.control}
                            name="invoiceDate"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Invoice Date</FormLabel>
                                    <FormControl><Input type="date" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                         <FormField
                            control={form.control}
                            name="invoiceFile"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Invoice Document (PDF)</FormLabel>
                                     <FormControl>
                                        <Input type="file" accept=".pdf" onChange={(e) => field.onChange(e.target.files)} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Submit Invoice
                        </Button>
                    </DialogFooter>
                </form>
            </Form>
        </DialogContent>
    );
}

function QuoteSubmissionForm({ requisition, quote, onQuoteSubmitted }: { requisition: PurchaseRequisition; quote?: Quotation | null; onQuoteSubmitted: () => void; }) {
    const { user, token } = useAuth();
    const [isSubmitting, setSubmitting] = useState(false);
    const { toast } = useToast();
    const isEditMode = !!quote;
    const storageKey = `quote-form-${requisition.id}`;

    const form = useForm<z.infer<typeof quoteFormSchema>>({
        resolver: zodResolver(quoteFormSchema),
        defaultValues: quote ? {
            notes: quote.notes,
            items: quote.items.map(item => ({
                ...item,
                requisitionItemId: item.requisitionItemId,
                brandDetails: item.brandDetails || '',
                imageUrl: item.imageUrl || '',
            })),
            answers: quote.answers || requisition.customQuestions?.map(q => ({ questionId: q.id, answer: '' })),
            cpoDocumentUrl: quote.cpoDocumentUrl || '',
            experienceDocumentUrl: quote.experienceDocumentUrl || '',
            summaryDocumentUrl: quote.summaryDocumentUrl || '',
        } : {
            notes: "",
            items: requisition.items.map(item => ({
                requisitionItemId: item.id,
                name: item.name,
                quantity: item.quantity,
                unitPrice: 0,
                leadTimeDays: 0,
                brandDetails: '',
                imageUrl: '',
            })),
            answers: requisition.customQuestions?.map(q => ({ questionId: q.id, answer: '' })),
            cpoDocumentUrl: '',
            experienceDocumentUrl: '',
            summaryDocumentUrl: '',
        },
    });

    useEffect(() => {
        const savedData = localStorage.getItem(storageKey);
        if (savedData && !isEditMode) { // Only restore for new quotes
            try {
                const parsedData = JSON.parse(savedData);
                form.reset(parsedData);
                toast({ title: 'Draft Restored', description: 'Your previously entered quote data has been restored.' });
            } catch (e) {
                console.error("Failed to parse saved form data", e);
            }
        }
    }, [storageKey, form, toast, isEditMode]);

    useEffect(() => {
        const subscription = form.watch((value) => {
            if (!isEditMode) {
                 localStorage.setItem(storageKey, JSON.stringify(value));
            }
        });
        return () => subscription.unsubscribe();
    }, [form, storageKey, isEditMode]);


     const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "items",
    });

    const { fields: answerFields } = useFieldArray({
        control: form.control,
        name: "answers",
    });

    const addAlternativeItem = (originalItem: { id: string, name: string, quantity: number }) => {
        append({
            requisitionItemId: originalItem.id, // Link to original item
            name: `Alternative for ${originalItem.name}`,
            quantity: originalItem.quantity,
            unitPrice: 0,
            leadTimeDays: 0,
            brandDetails: '',
            imageUrl: '',
        });
    };

    const handleFileUpload = async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('directory', 'quotes');
        
        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'File upload failed');
            }
            return result.path;
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Upload Failed',
                description: error instanceof Error ? error.message : 'Could not upload file.',
            });
            return null;
        }
    };


    const onSubmit = async (values: z.infer<typeof quoteFormSchema>) => {
        if (!user || !requisition) return;
        
        // Manual validation for required answers
        let hasError = false;
        if (requisition.customQuestions) {
            for (let i = 0; i < requisition.customQuestions.length; i++) {
                const question = requisition.customQuestions[i];
                if (question.isRequired && (!values.answers || !values.answers[i] || !values.answers[i].answer)) {
                    form.setError(`answers.${i}.answer`, { type: 'manual', message: 'A response is required for this question.'});
                    hasError = true;
                }
            }
        }
        if (hasError) {
             toast({ variant: 'destructive', title: 'Missing Information', description: 'Please answer all required questions.' });
            return;
        }

        if (requisition.cpoAmount && requisition.cpoAmount > 0 && !values.cpoDocumentUrl) {
            form.setError("cpoDocumentUrl", { type: "manual", message: "CPO Document is required." });
            return;
        }
        
        if (requisition.rfqSettings?.experienceDocumentRequired && !values.experienceDocumentUrl) {
            form.setError("experienceDocumentUrl", { type: "manual", message: "Experience Document is required." });
            return;
        }


        setSubmitting(true);
        try {
            const url = isEditMode ? `/api/quotations/${quote!.id}` : '/api/quotations';
            const method = isEditMode ? 'PATCH' : 'POST';

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    ...values,
                    requisitionId: requisition.id,
                    vendorId: user.vendorId,
                    userId: user.id // for PATCH
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Failed to ${isEditMode ? 'update' : 'submit'} quote.`);
            }
            
            localStorage.removeItem(storageKey);

            toast({
                title: 'Success!',
                description: `Your quotation has been ${isEditMode ? 'updated' : 'submitted'}.`,
            });
            onQuoteSubmitted();
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
    
    const totalQuotePrice = form.watch('items').reduce((acc, item) => acc + (item.quantity * (item.unitPrice || 0)), 0);
    const cpoDocumentValue = form.watch('cpoDocumentUrl');
    const isCpoRequired = !!(requisition.cpoAmount && requisition.cpoAmount > 0);
    const experienceDocumentValue = form.watch('experienceDocumentUrl');
    const isExperienceRequired = requisition.rfqSettings?.experienceDocumentRequired;

    const canSubmit = (!isCpoRequired || (isCpoRequired && !!cpoDocumentValue)) && (!isExperienceRequired || (isExperienceRequired && !!experienceDocumentValue));

    const originalItems = requisition.items;

    return (
        <Card>
            <CardHeader>
                <CardTitle>{quote ? 'Edit Your Quotation' : 'Submit Your Quotation'}</CardTitle>
                <CardDescription>
                    Please provide your pricing and estimated lead times for the items requested.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        {isCpoRequired && (
                             <FormField
                                control={form.control}
                                name="cpoDocumentUrl"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel>CPO Document (Required)</FormLabel>
                                    <FormControl>
                                        <Input type="file" accept=".pdf" onChange={async (e) => {
                                            if (e.target.files?.[0]) {
                                                const path = await handleFileUpload(e.target.files[0]);
                                                if (path) field.onChange(path);
                                            }
                                        }} />
                                    </FormControl>
                                    <FormDescription>
                                        A CPO of {requisition.cpoAmount?.toLocaleString()} ETB is required for this requisition.
                                    </FormDescription>
                                    <FormMessage />
                                    </FormItem>
                                )}
                             />
                        )}
                        
                        {isExperienceRequired && (
                             <FormField
                                control={form.control}
                                name="experienceDocumentUrl"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel>Experience Document (Required)</FormLabel>
                                    <FormControl>
                                        <Input type="file" accept=".pdf" onChange={async (e) => {
                                            if (e.target.files?.[0]) {
                                                const path = await handleFileUpload(e.target.files[0]);
                                                if (path) field.onChange(path);
                                            }
                                        }} />
                                    </FormControl>
                                    <FormDescription>
                                        Please upload a document detailing your relevant experience for this bid.
                                    </FormDescription>
                                    <FormMessage />
                                    </FormItem>
                                )}
                             />
                        )}

                        <FormField
                            control={form.control}
                            name="summaryDocumentUrl"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Overall Summary Document (Optional)</FormLabel>
                                <FormControl>
                                    <Input type="file" accept=".pdf" onChange={async (e) => {
                                        if (e.target.files?.[0]) {
                                            const path = await handleFileUpload(e.target.files[0]);
                                            if (path) field.onChange(path);
                                        }
                                    }} />
                                </FormControl>
                                <FormDescription>
                                    Upload a single document summarizing all your proposed items and details for evaluation.
                                </FormDescription>
                                <FormMessage />
                                </FormItem>
                            )}
                        />


                        <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                             {originalItems.map(originalItem => {
                                 const itemsForThisReqItem = fields.filter(f => f.requisitionItemId === originalItem.id);
                                 return (
                                     <div key={originalItem.id} className="p-4 border rounded-lg bg-muted/20">
                                        <div className="flex justify-between items-center mb-4">
                                            <h4 className="font-semibold">Requested Item: {originalItem.name} (Qty: {originalItem.quantity})</h4>
                                            <Button type="button" variant="outline" size="sm" onClick={() => addAlternativeItem(originalItem)}>
                                                <PlusCircle className="mr-2 h-4 w-4" /> Propose Alternative
                                            </Button>
                                        </div>
                                         <div className="space-y-4 pl-4 border-l-2">
                                         {itemsForThisReqItem.map((field, index) => {
                                             const overallIndex = fields.findIndex(f => f.id === field.id);
                                             const isAlternative = field.name !== originalItem.name;
                                             return (
                                                <Card key={field.id} className="p-4 relative bg-background">
                                                    <div className="flex justify-between items-start">
                                                        <FormField
                                                            control={form.control}
                                                            name={`items.${overallIndex}.name`}
                                                            render={({ field }) => (
                                                                <FormItem className="flex-1">
                                                                    <FormLabel>
                                                                        {isAlternative ? "Alternative Item Name" : "Item Name"} (Qty: {form.getValues(`items.${overallIndex}.quantity`)})
                                                                    </FormLabel>
                                                                    <FormControl>
                                                                        <Input placeholder="e.g., MacBook Pro 16-inch or alternative" {...field} />
                                                                    </FormControl>
                                                                    <FormMessage />
                                                                </FormItem>
                                                            )}
                                                        />
                                                        {isAlternative && (
                                                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 ml-2 mt-7" onClick={() => remove(overallIndex)}>
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                                                        <FormField
                                                            control={form.control}
                                                            name={`items.${overallIndex}.brandDetails`}
                                                            render={({ field }) => (
                                                                <FormItem className="md:col-span-2">
                                                                    <FormLabel>Brand / Model Details</FormLabel>
                                                                    <FormControl>
                                                                        <Textarea placeholder="e.g., Dell XPS 15, HP Spectre x360..." {...field} />
                                                                    </FormControl>
                                                                    <FormMessage />
                                                                </FormItem>
                                                            )}
                                                        />
                                                         <FormField
                                                            control={form.control}
                                                            name={`items.${overallIndex}.imageUrl`}
                                                            render={({ field }) => (
                                                                <FormItem>
                                                                <FormLabel>Item Image (Optional)</FormLabel>
                                                                <FormControl>
                                                                    <Input type="file" accept="image/*" onChange={async (e) => {
                                                                        if (e.target.files?.[0]) {
                                                                            const path = await handleFileUpload(e.target.files[0]);
                                                                            if (path) field.onChange(path);
                                                                        }
                                                                    }} />
                                                                </FormControl>
                                                                <FormMessage />
                                                                </FormItem>
                                                            )}
                                                         />
                                                        <FormField
                                                            control={form.control}
                                                            name={`items.${overallIndex}.unitPrice`}
                                                            render={({ field }) => (
                                                                <FormItem>
                                                                    <FormLabel>Unit Price (ETB)</FormLabel>
                                                                    <FormControl><Input type="number" step="0.01" {...field} value={field.value ?? ''} /></FormControl>
                                                                    <FormMessage />
                                                                </FormItem>
                                                            )}
                                                        />
                                                        <FormField
                                                            control={form.control}
                                                            name={`items.${overallIndex}.leadTimeDays`}
                                                            render={({ field }) => (
                                                                <FormItem>
                                                                    <FormLabel>Lead Time (Days)</FormLabel>
                                                                    <FormControl><Input type="number" {...field} /></FormControl>
                                                                    <FormMessage />
                                                                </FormItem>
                                                            )}
                                                        />
                                                    </div>
                                                </Card>
                                             )
                                         })}
                                         </div>
                                     </div>
                                 )
                             })}
                        </div>


                         {requisition.customQuestions && requisition.customQuestions.length > 0 && (
                            <>
                                <Separator />
                                <h3 className="text-lg font-medium">Additional Questions</h3>
                                <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                                {requisition.customQuestions.map((question, index) => (
                                    <Card key={question.id} className="p-4">
                                        <FormField
                                            control={form.control}
                                            name={`answers.${index}.answer`}
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>
                                                        {question.questionText}
                                                        {question.isRequired && <span className="text-destructive"> *</span>}
                                                    </FormLabel>
                                                        {question.questionType === 'text' && (
                                                          <FormControl>
                                                            <Textarea placeholder="Your answer..." {...field} />
                                                          </FormControl>
                                                        )}
                                                        {question.questionType === 'boolean' && (
                                                          <FormControl>
                                                            <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex gap-4 pt-2">
                                                              <FormItem className="flex items-center space-x-2">
                                                                <FormControl>
                                                                  <RadioGroupItem value="true" id={`${question.id}-true`} />
                                                                </FormControl>
                                                                <FormLabel htmlFor={`${question.id}-true`} className="font-normal">True</FormLabel>
                                                              </FormItem>
                                                              <FormItem className="flex items-center space-x-2">
                                                                <FormControl>
                                                                  <RadioGroupItem value="false" id={`${question.id}-false`} />
                                                                </FormControl>
                                                                <FormLabel htmlFor={`${question.id}-false`} className="font-normal">False</FormLabel>
                                                              </FormItem>
                                                            </RadioGroup>
                                                          </FormControl>
                                                        )}
                                                        {question.questionType === 'multiple_choice' && (
                                                           <FormControl>
                                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                                    <SelectTrigger>
                                                                        <SelectValue placeholder="Select an option" />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        {question.options?.map(option => (
                                                                            <SelectItem key={option} value={option}>{option}</SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                            </FormControl>
                                                        )}
                                                        {question.questionType === 'file' && (
                                                            <FormControl>
                                                                <Input type="file" onChange={async (e) => {
                                                                    if (e.target.files?.[0]) {
                                                                        const path = await handleFileUpload(e.target.files[0]);
                                                                        if (path) field.onChange(path);
                                                                    }
                                                                }} />
                                                            </FormControl>
                                                        )}
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </Card>
                                ))}
                                </div>
                            </>
                        )}
                        
                        <Separator />

                        <FormField
                            control={form.control}
                            name="notes"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Overall Notes (Optional)</FormLabel>
                                <FormControl>
                                    <Textarea placeholder="Include any notes about warranty, shipping, etc." {...field} />
                                </FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                        <Separator />
                        <div className="text-right font-bold text-xl">
                            Total Quote Price: {totalQuotePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="ghost" asChild><Link href="/vendor/dashboard">Cancel</Link></Button>
                            <Button type="submit" disabled={isSubmitting || !canSubmit}>
                                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                                {quote ? 'Update Quotation' : 'Submit Quotation'}
                            </Button>
                        </div>
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}

const DeclineReasonDialog = ({ onConfirm }: { onConfirm: (reason: string) => void }) => {
    const [reason, setReason] = useState('');
    return (
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Confirm Award Decline</DialogTitle>
                <DialogDescription>Please provide a reason for declining this award. This feedback is valuable to the procurement team.</DialogDescription>
            </DialogHeader>
            <div className="py-4">
                <Label htmlFor="decline-reason">Reason for Declining</Label>
                <Textarea id="decline-reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g., Unable to meet delivery timeline, stock unavailable..." />
            </div>
            <DialogFooter>
                 <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                 <Button variant="destructive" onClick={() => onConfirm(reason)} disabled={!reason.trim()}>
                    Confirm Decline
                 </Button>
            </DialogFooter>
        </DialogContent>
    );
};

export default function VendorRequisitionPage() {
    const [requisition, setRequisition] = useState<PurchaseRequisition | null>(null);
    const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [isResponding, setIsResponding] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [submittedQuote, setSubmittedQuote] = useState<Quotation | null>(null);
    const [isEditingQuote, setIsEditingQuote] = useState(false);
    const [declineState, setDeclineState] = useState<{ isOpen: boolean, quoteItemId?: string }>({ isOpen: false });

    const params = useParams();
    const router = useRouter();
    const id = params.id as string;
    const { token, user } = useAuth();
    const { toast } = useToast();
    
    const isAwardProcessStarted = requisition?.quotations?.some(q => ['Awarded', 'Partially_Awarded', 'Standby', 'Accepted', 'Declined', 'Failed'].includes(q.status)) ?? false;
    const isDeadlinePassed = requisition?.deadline ? isPast(new Date(requisition.deadline)) : false;
    const allowEdits = requisition?.rfqSettings?.allowQuoteEdits ?? true;

    const canEditQuote = submittedQuote?.status === 'Submitted' && !isAwardProcessStarted && !isDeadlinePassed && allowEdits;

    const awardedItems = useMemo((): PerItemAwardDetail[] => {
        if (!requisition || !user?.vendorId) return [];
        return requisition.items.flatMap(item => 
            (item.perItemAwardDetails || []).filter(detail => 
                detail.vendorId === user.vendorId && (detail.status === 'Awarded' || detail.status === 'Accepted' || detail.status === 'Declined')
            )
        );
    }, [requisition, user]);
    
    const isPartiallyAwarded = useMemo(() => {
        if ((requisition?.rfqSettings as any)?.awardStrategy !== 'item') return false;
        return awardedItems.length > 0;
    }, [requisition, awardedItems]);

    const isFullyAwarded = useMemo(() => {
        const vendorQuote = requisition?.quotations?.find(q => q.vendorId === user?.vendorId);
        return vendorQuote?.status === 'Awarded';
    }, [requisition, user]);

    const itemsToDisplayInQuoteCard = useMemo(() => {
        if (!submittedQuote) return [];
        
        // In a single-vendor award, the awarded items are on the main requisition
        if (isFullyAwarded && requisition!.awardedQuoteItemIds.length > 0) {
            const awardedItemIds = new Set(requisition!.awardedQuoteItemIds);
            return submittedQuote.items.filter(item => awardedItemIds.has(item.id));
        }

        // In a per-item award, the details are on the requisition items
        if (isPartiallyAwarded) {
            const awardedQuoteItemIds = new Set(awardedItems.map(item => item.quoteItemId));
            return submittedQuote.items.filter(item => awardedQuoteItemIds.has(item.id));
        }
        
        // If not awarded or accepted yet, show all items from the original quote
        return submittedQuote.items;
    }, [submittedQuote, isPartiallyAwarded, awardedItems, isFullyAwarded, requisition]);

    const hasPendingResponseItems = useMemo(() => {
        if (isFullyAwarded) return true; // Full award is pending
        return awardedItems.some(item => item.status === 'Awarded');
    }, [awardedItems, isFullyAwarded]);


    const isAccepted = useMemo(() => {
        if (!requisition || !user?.vendorId) return false;
    
        // For per-item awards, check if at least one item has been accepted by the vendor.
        if (isPartiallyAwarded) {
             const hasAcceptedItem = requisition.items.some(item =>
                (item.perItemAwardDetails || []).some(d => d.vendorId === user.vendorId && d.status === 'Accepted')
            );
            return hasAcceptedItem;
        }
        
        // For single-vendor awards, check the main quote status.
        const vendorQuote = requisition.quotations?.find(q => q.vendorId === user.vendorId);
        return vendorQuote?.status === 'Accepted';
    }, [requisition, user, isPartiallyAwarded]);


    const fetchRequisitionData = async () => {
        if (!id || !token || !user) return;
        
        setLoading(true);
        setError(null);
        try {
             const response = await fetch(`/api/requisitions/${id}`);
             if (!response.ok) {
                throw new Error('Failed to fetch requisition data.');
             }
             const foundReq: PurchaseRequisition = await response.json();
                          
             if (!foundReq) {
                 throw new Error('Requisition not found or not available for quoting.');
             }
             
             const quoResponse = await fetch(`/api/quotations?requisitionId=${id}`);
             const allQuotes: Quotation[] = await quoResponse.json();
             foundReq.quotations = allQuotes;
             setRequisition(foundReq);

             const vendorSubmittedQuote = allQuotes.find(q => q.vendorId === user.vendorId);
             
             if (vendorSubmittedQuote) {
                 setSubmittedQuote(vendorSubmittedQuote);
                 const poResponse = await fetch('/api/purchase-orders');
                 const allPOs: PurchaseOrder[] = await poResponse.json();
                 // Now there can be multiple POs, find all associated with this vendor and req
                 const vendorPOs = allPOs.filter(p => p.requisitionId === foundReq.id && p.vendor.id === user.vendorId);
                 setPurchaseOrders(vendorPOs);
             } else {
                setSubmittedQuote(null);
             }
             
        } catch (e) {
            setError(e instanceof Error ? e.message : 'An unknown error occurred');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRequisitionData();
    }, [id, token, user]);
    
    const handleQuoteSubmitted = () => {
        setIsEditingQuote(false);
        fetchRequisitionData();
    }
    
    const handleAwardResponse = async (action: 'accept' | 'reject', rejectionReason?: string, quoteItemId?: string) => {
        if (!submittedQuote || !user) return;
        setIsResponding(true);
        try {
            const response = await fetch(`/api/quotations/${submittedQuote.id}/respond`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, action, rejectionReason, quoteItemId })
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `Failed to ${action} award.`);
            
            toast({ title: 'Response Submitted', description: result.message });
            fetchRequisitionData();

        } catch (error) {
             toast({
                variant: 'destructive',
                title: 'Error',
                description: error instanceof Error ? error.message : 'An unknown error occurred.',
            });
        } finally {
            setIsResponding(false);
        }
    }


    if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    if (error) return <div className="text-destructive text-center p-8">{error}</div>;
    if (!requisition) return <div className="text-center p-8">Requisition not found.</div>;

    const isResponseDeadlineExpired = requisition.awardResponseDeadline ? isPast(new Date(requisition.awardResponseDeadline)) : false;
    const isStandby = isPartiallyAwarded ? awardedItems.some(i => i.status === 'Standby') : submittedQuote?.status === 'Standby';


    const QuoteDisplayCard = ({ quote, itemsToShow, showActions }: { quote: Quotation, itemsToShow: QuoteItem[], showActions: boolean }) => {
         const totalQuotedPrice = itemsToShow.reduce((acc, item) => acc + (item.unitPrice * item.quantity), 0);
         const poForItem = purchaseOrders.find(po => po.items.some(poi => itemsToShow.some(i => i.id === poi.requisitionItemId || i.name === poi.name)));
         const hasSubmittedInvoice = poForItem && (poForItem.invoices?.length || 0) > 0;

         return (
         <Card>
            <CardHeader className="flex flex-row items-start justify-between">
                <div>
                    <CardTitle>Your Submitted Quote</CardTitle>
                    <CardDescription>
                        Status: <Badge variant={quote.status === 'Awarded' || quote.status === 'Accepted' || quote.status === 'Partially_Awarded' ? 'default' : 'secondary'}>{quote.status.replace(/_/g, ' ')}</Badge>
                    </CardDescription>
                </div>
                {canEditQuote && (
                    <Button variant="outline" size="sm" onClick={() => setIsEditingQuote(true)}>
                        <FileEdit className="mr-2 h-4 w-4" /> Edit Quote
                    </Button>
                )}
            </CardHeader>
            <CardContent className="space-y-4">
                {quote.summaryDocumentUrl && (
                     <div className="text-sm">
                        <h3 className="font-semibold">Summary Document</h3>
                        <div className="flex items-center gap-2 p-2 mt-1 border rounded-md bg-muted/50 text-muted-foreground">
                            <a href={quote.summaryDocumentUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-primary"/>
                                <span>{quote.summaryDocumentUrl.split('/').pop()}</span>
                            </a>
                        </div>
                    </div>
                )}
                {quote.cpoDocumentUrl && (
                     <div className="text-sm">
                        <h3 className="font-semibold">CPO Document</h3>
                        <div className="flex items-center gap-2 p-2 mt-1 border rounded-md bg-muted/50 text-muted-foreground">
                            <a href={quote.cpoDocumentUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-primary"/>
                                <span>{quote.cpoDocumentUrl.split('/').pop()}</span>
                            </a>
                        </div>
                    </div>
                )}
                 {quote.experienceDocumentUrl && (
                     <div className="text-sm">
                        <h3 className="font-semibold">Experience Document</h3>
                        <div className="flex items-center gap-2 p-2 mt-1 border rounded-md bg-muted/50 text-muted-foreground">
                             <a href={quote.experienceDocumentUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-primary"/>
                                <span>{quote.experienceDocumentUrl.split('/').pop()}</span>
                            </a>
                        </div>
                    </div>
                )}
                <div className="space-y-2">
                    {itemsToShow && itemsToShow.length > 0 ? itemsToShow.map((item, index) => (
                        <Card key={`${item.requisitionItemId}-${index}`} className="p-3 bg-green-500/5 border-green-500/20">
                            <div className="flex justify-between">
                                <div>
                                    <p className="font-semibold">{item.name} x {item.quantity}</p>
                                    <p className="text-xs text-muted-foreground">Unit Price: {item.unitPrice.toFixed(2)} ETB</p>
                                </div>
                                <p className="font-semibold text-lg">{(item.unitPrice * item.quantity).toFixed(2)} ETB</p>
                            </div>
                            {item.brandDetails && (
                                <div className="mt-2 text-xs border-t pt-2">
                                    <p className="font-bold">Brand/Model Details:</p>
                                    <p className="text-muted-foreground italic">{item.brandDetails}</p>
                                </div>
                            )}
                        </Card>
                    )) : (
                        <div className="text-sm text-muted-foreground text-center p-4">No specific items awarded from this quote.</div>
                    )}
                </div>
                {quote.notes && (
                    <div>
                        <h3 className="font-semibold text-sm">Your Overall Notes</h3>
                        <p className="text-muted-foreground text-sm p-3 border rounded-md bg-muted/50 italic">"{quote.notes}"</p>
                    </div>
                )}
                 <Separator />
                 <div className="text-right font-bold text-2xl">
                    Total Award Value: {totalQuotedPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB
                 </div>
                 {isAccepted && poForItem && (
                    <CardFooter className="p-0 pt-4">
                        <Dialog>
                            <DialogTrigger asChild>
                                 <Button className="w-full" disabled={hasSubmittedInvoice}>
                                    {hasSubmittedInvoice ? (
                                        <><CircleCheck className="mr-2"/> Invoice Submitted for PO {poForItem.id}</>
                                    ) : (
                                        <><FileUp className="mr-2"/> Submit Invoice for PO {poForItem.id}</>
                                    )}
                                </Button>
                            </DialogTrigger>
                            <InvoiceSubmissionForm po={poForItem} onInvoiceSubmitted={() => { fetchRequisitionData(); }} />
                        </Dialog>
                    </CardFooter>
                 )}
                 {!showActions && (
                     <CardFooter className="p-0 pt-4">
                        <Alert variant="default" className="border-blue-500/50">
                            <Info className="h-4 w-4 text-blue-500" />
                            <AlertTitle>{ isStandby ? "You are on Standby" : "Quote Under Review" }</AlertTitle>
                            <AlertDescription>
                                { isStandby ? "Your quote is a backup option. You will be notified if the primary vendor declines." : (canEditQuote ? 'Your quote has been submitted. You can still edit it until the deadline passes or an award is made.' : 'Your quote is under review and can no longer be edited.')}
                            </AlertDescription>
                        </Alert>
                     </CardFooter>
                 )}
            </CardContent>
        </Card>
        )
    };

    return (
        <div className="space-y-6">
            <Button variant="outline" size="sm" onClick={() => router.push('/vendor/dashboard')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
            </Button>
            
            <Dialog open={declineState.isOpen} onOpenChange={(open) => !open && setDeclineState({isOpen: false})}>
                <DeclineReasonDialog onConfirm={(reason) => {
                    handleAwardResponse('reject', reason, declineState.quoteItemId);
                    setDeclineState({isOpen: false});
                }} />
            </Dialog>

            {hasPendingResponseItems && (
                 <Card>
                    <CardHeader>
                        <CardTitle className="text-green-600">Congratulations! You've Been Awarded!</CardTitle>
                        <CardDescription>
                            Please review and respond to the award below.
                             {requisition.awardResponseDeadline && (
                                <p className={cn("text-sm font-semibold mt-2 flex items-center gap-2", isResponseDeadlineExpired ? "text-destructive" : "text-amber-600")}>
                                    <Timer className="h-4 w-4" />
                                    <span>Respond by: {format(new Date(requisition.awardResponseDeadline), 'PPpp')}</span>
                                </p>
                             )}
                        </CardDescription>
                    </CardHeader>
                     <CardContent>
                          {isPartiallyAwarded ? (
                             <div className="space-y-4">
                                {awardedItems.filter(i => i.status === 'Awarded').map(itemAward => {
                                    const quoteItem = submittedQuote?.items.find(i => i.id === itemAward.quoteItemId);
                                    return(
                                        <Card key={itemAward.quoteItemId} className="p-4">
                                            <div className="flex justify-between items-center">
                                                <div>
                                                    <p className="font-semibold">{quoteItem?.name}</p>
                                                    <p className="text-sm text-muted-foreground">Unit Price: {quoteItem?.unitPrice.toLocaleString()} ETB</p>
                                                </div>
                                                <div className="flex gap-2">
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button size="sm" disabled={isResponding || isResponseDeadlineExpired}>
                                                                <ThumbsUp className="mr-2 h-4 w-4" /> Accept
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>Confirm Acceptance</AlertDialogTitle>
                                                                <AlertDialogDescription>Are you sure you want to accept the award for this item?</AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                <AlertDialogAction onClick={() => handleAwardResponse('accept', undefined, quoteItem?.id)}>Confirm</AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                    <Button size="sm" variant="destructive" onClick={() => setDeclineState({isOpen: true, quoteItemId: quoteItem?.id})} disabled={isResponding || isResponseDeadlineExpired}>
                                                        <ThumbsDown className="mr-2 h-4 w-4" /> Decline
                                                    </Button>
                                                </div>
                                            </div>
                                        </Card>
                                    )
                                })}
                            </div>
                         ) : (
                            <div className="flex gap-4">
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button disabled={isResponding || isResponseDeadlineExpired}>
                                            <ThumbsUp className="mr-2 h-4 w-4" /> Accept Full Award
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Confirm Full Award Acceptance</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This will accept the award for all items listed in this offer. This action cannot be undone.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => handleAwardResponse('accept')}>Confirm & Accept</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                                
                                <Button variant="destructive" onClick={() => setDeclineState({ isOpen: true })} disabled={isResponding || isResponseDeadlineExpired}>
                                    <ThumbsDown className="mr-2 h-4 w-4" /> Decline Award
                                </Button>
                            </div>
                         )}
                    </CardContent>
                 </Card>
            )}

            {isAccepted && (
                <Alert variant="default" className="border-green-600 bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-200 dark:border-green-800">
                    <CheckCircle className="h-5 w-5 !text-green-600" />
                    <AlertTitle className="font-bold text-lg">Award Accepted!</AlertTitle>
                    <AlertDescription>
                        Thank you for your confirmation. A Purchase Order has been issued for the accepted items. You may now submit an invoice.
                    </AlertDescription>
                </Alert>
            )}

            <div className="grid md:grid-cols-2 gap-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Requisition Details</CardTitle>
                        <CardDescription>
                            ID: {requisition.id}
                             {requisition.deadline && (
                                <p className="text-xs text-destructive mt-1">Quotation Deadline: {format(new Date(requisition.deadline), 'PPpp')}</p>
                            )}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {requisition.cpoAmount && requisition.cpoAmount > 0 && (
                             <Alert variant="default">
                                <BadgeInfo className="h-4 w-4" />
                                <AlertTitle>CPO Required</AlertTitle>
                                <AlertDescription>
                                A CPO of {requisition.cpoAmount.toLocaleString()} ETB is required to submit a quotation for this requisition.
                                </AlertDescription>
                            </Alert>
                        )}
                        <div>
                            <h3 className="font-semibold text-sm">Title</h3>
                            <p className="text-muted-foreground">{requisition.title}</p>
                        </div>
                        
                        <Separator />
                        <div>
                            <h3 className="font-semibold text-sm mb-2">Items Requested</h3>
                            <div className="space-y-4">
                                {requisition.items.map((item, i) => (
                                    <div key={`${item.id}-${i}`} className="p-3 border rounded-md bg-muted/50">
                                        <div className="flex justify-between items-center">
                                            <p className="font-semibold">{item.name}</p>
                                            <p className="text-sm font-mono bg-background px-2 py-1 rounded">Qty: {item.quantity}</p>
                                        </div>
                                        {item.description && (
                                            <p className="text-xs text-muted-foreground mt-2">{item.description}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                         {requisition.customQuestions && requisition.customQuestions.length > 0 && (
                            <>
                                <Separator />
                                <div>
                                    <h3 className="font-semibold text-sm mb-2">Additional Questions from Requester</h3>
                                    <div className="space-y-3 text-sm">
                                        {requisition.customQuestions.map((q,i) => (
                                            <div key={`${q.id}-${i}`}>
                                                <p className="font-medium">{q.questionText}</p>
                                                {q.questionType === 'boolean' && <p className="text-muted-foreground text-xs italic">Please answer with True/False.</p>}
                                                {q.questionType === 'multiple_choice' && (
                                                    <p className="text-muted-foreground text-xs italic">
                                                        Please choose from: {q.options?.join(', ')}
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>

                {submittedQuote && !isEditingQuote ? (
                     <QuoteDisplayCard quote={submittedQuote} itemsToShow={itemsToDisplayInQuoteCard} showActions={hasPendingResponseItems} />
                ) : (
                    <QuoteSubmissionForm 
                        requisition={requisition} 
                        quote={isEditingQuote ? submittedQuote : null} 
                        onQuoteSubmitted={handleQuoteSubmitted} 
                    />
                )}
            </div>
        </div>
    )
}
