'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogClose,
    DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, Award, XCircle, FileSignature, FileText, Bot, Lightbulb, ArrowLeft, Star, Undo, Check, Send, Search, BadgeHelp, BadgeCheck, BadgeX, Crown, Medal, Trophy, RefreshCw, TimerOff, ClipboardList, TrendingUp, Scale, Edit2, Users, GanttChart, Eye, CheckCircle, CalendarIcon, Timer, Landmark, Settings2, Ban, Printer, FileBarChart2, UserCog, History, AlertCircle, FileUp, TrophyIcon, Calculator, ChevronDown, ChevronsRight, ChevronsLeft, ChevronLeft, ChevronRight, FileBadge, MessageSquare, AlertTriangle } from 'lucide-react';
import { useForm, useFieldArray, FormProvider, useFormContext, Control, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RichTextEditor, HtmlRenderer } from '@/components/editor/rich-text-editor';
import { htmlToPlainText, sanitizeHtml } from '@/lib/sanitize';
import { PurchaseOrder, PurchaseRequisition, Quotation, Vendor, QuotationStatus, EvaluationCriteria, User, CommitteeScoreSet, EvaluationCriterion, QuoteItem, PerItemAwardDetail, UserRole, CustomQuestion } from '@/lib/types';
import { format, formatDistanceToNow, isBefore, isPast, setHours, setMinutes, differenceInCalendarDays } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/auth-context';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Slider } from '@/components/ui/slider';
import { RequisitionDetailsDialog } from '@/components/requisition-details-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import Image from 'next/image';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AwardCenterDialog } from '@/components/award-center-dialog';
import { BestItemAwardDialog } from '@/components/best-item-award-dialog';
import { AwardStandbyButton } from '@/components/award-standby-button';
import { ChangeAwardDialog } from '@/components/change-award-dialog';
import { RestartRfqDialog } from '@/components/restart-rfq-dialog';
import { QuoteDetailsDialog } from '@/components/quote-details-dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { EditableCriteria } from '@/components/editable-criteria';
import { EditableQuestions } from '@/components/editable-questions';


const PAGE_SIZE = 6;

const quoteFormSchema = z.object({
    notes: z.string().optional(),
    items: z.array(z.object({
        requisitionItemId: z.string(),
        name: z.string().min(1, "Item name cannot be empty."),
        quantity: z.number(),
        unitPrice: z.coerce.number().min(0.01, "Price is required."),
        leadTimeDays: z.coerce.number().min(0, "Delivery time is required."),
    })),
});

const manualQuoteFormSchema = z.object({
    vendorId: z.string().min(1, 'Vendor is required.'),
    notes: z.string().optional(),
    items: z.array(
        z.object({
            requisitionItemId: z.string(),
            name: z.string().min(1, 'Item name cannot be empty.'),
            quantity: z.number(),
            unitPrice: z.coerce.number().min(0.01, 'Price is required.'),
            leadTimeDays: z.coerce.number().min(0, 'Delivery time is required.'),
            brandDetails: z.string().optional(),
            imageUrl: z.string().optional(),
        })
    ).optional(),
    answers: z.array(z.object({
        questionId: z.string(),
        answer: z.string()
    })).optional(),
    cpoDocumentUrl: z.string().optional(),
    experienceDocumentUrl: z.string().optional(),
    bidDocumentUrl: z.string().optional(),
});

function ManualVendorQuotationDialog({
    requisition,
    vendors,
    existingQuotations,
    isOpen,
    onOpenChange,
    onSubmitted,
}: {
    requisition: PurchaseRequisition;
    vendors: Vendor[];
    existingQuotations: Quotation[];
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmitted: () => void;
}) {
    const { token } = useAuth();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const invitedVerifiedVendors = useMemo(() => {
        return (vendors || []).filter(v => v.kycStatus === 'Verified');
    }, [vendors, requisition.allowedVendorIds]);

    const submittedVendorIds = useMemo(() => new Set((existingQuotations || []).map(q => q.vendorId)), [existingQuotations]);
    const selectableVendors = useMemo(
        () => invitedVerifiedVendors.filter(v => !submittedVendorIds.has(v.id)),
        [invitedVerifiedVendors, submittedVendorIds]
    );

    const form = useForm<z.infer<typeof manualQuoteFormSchema>>({
        resolver: zodResolver(manualQuoteFormSchema),
        defaultValues: {
            vendorId: '',
            notes: '',
            items: requisition.items.map(item => ({
                requisitionItemId: item.id,
                name: item.name,
                quantity: item.quantity,
                unitPrice: 0,
                leadTimeDays: 0,
                brandDetails: '',
                imageUrl: '',
            })),
            answers: requisition.customQuestions?.map(q => ({ questionId: q.id, answer: '' })) ?? [],
            cpoDocumentUrl: '',
            experienceDocumentUrl: '',
            bidDocumentUrl: '',
        },
    });

    const { fields: itemFields } = useFieldArray({ control: form.control, name: 'items' });
    const { fields: answerFields } = useFieldArray({ control: form.control, name: 'answers' });

    const handleFileUpload = async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('directory', 'quotes');
        try {
            const response = await fetch('/api/upload', { method: 'POST', body: formData });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'File upload failed');
            return result.path as string;
        } catch (e) {
            toast({
                variant: 'destructive',
                title: 'Upload Failed',
                description: e instanceof Error ? e.message : 'Could not upload file.',
            });
            return null;
        }
    };

    const findQuestionText = (questionId: string) => {
        return requisition.customQuestions?.find(q => q.id === questionId)?.questionText || 'Unknown Question';
    };

    const onSubmit = async (values: z.infer<typeof manualQuoteFormSchema>) => {
        if (!token) {
            toast({ variant: 'destructive', title: 'Unauthorized', description: 'Missing session token.' });
            return;
        }

        let hasError = false;
        if (requisition.customQuestions && values.answers) {
            values.answers.forEach((ans, ai) => {
                const question = requisition.customQuestions?.find(q => q.id === ans.questionId);
                if (question?.isRequired && (!ans.answer || ans.answer.trim() === '')) {
                    form.setError(`answers.${ai}.answer`, { type: 'manual', message: 'A response is required for this question.' });
                    hasError = true;
                }
            });
        }
        if (hasError) {
            toast({ variant: 'destructive', title: 'Missing Information', description: 'Please answer all required questions.' });
            return;
        }

        if (requisition.cpoAmount && requisition.cpoAmount > 0 && !values.cpoDocumentUrl) {
            form.setError('cpoDocumentUrl', { type: 'manual', message: 'CPO Document is required.' });
            return;
        }

        if ((requisition.rfqSettings as any)?.experienceDocumentRequired && !values.experienceDocumentUrl) {
            form.setError('experienceDocumentUrl', { type: 'manual', message: 'Experience Document is required.' });
            return;
        }

        setIsSubmitting(true);
        try {
            const response = await fetch('/api/quotations/manual', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    requisitionId: requisition.id,
                    vendorId: values.vendorId,
                    items: values.items,
                    notes: values.notes,
                    answers: values.answers,
                    cpoDocumentUrl: values.cpoDocumentUrl,
                    experienceDocumentUrl: values.experienceDocumentUrl,
                    bidDocumentUrl: values.bidDocumentUrl,
                }),
            });

            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error || 'Failed to upload manual quotation.');

            toast({ title: 'Success!', description: 'Manual vendor quotation uploaded.' });
            onOpenChange(false);
            onSubmitted();
        } catch (e) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: e instanceof Error ? e.message : 'An unknown error occurred.',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Add Vendor Quotation (Manual Upload)</DialogTitle>
                    <DialogDescription>
                        Upload a quotation collected manually (for vendors not using the portal).
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 flex flex-col min-h-0">
                        <ScrollArea className="flex-1 -mx-6 px-6">
                            <div className="space-y-6 py-4">
                                <FormField
                                    control={form.control}
                                    name="vendorId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Vendor</FormLabel>
                                            <Select
                                                value={field.value || ''}
                                                onValueChange={(value) => {
                                                    field.onChange(value);
                                                }}
                                                disabled={selectableVendors.length === 0}
                                            >
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder={selectableVendors.length ? 'Select vendor' : 'No eligible vendors available'} />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {selectableVendors.map(v => (
                                                        <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            {selectableVendors.length === 0 ? (
                                                <p className="text-xs text-muted-foreground">No eligible verified vendors available.</p>
                                            ) : null}
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="notes"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Overall Notes</FormLabel>
                                            <FormControl><Textarea placeholder="Any overall notes for this quote..." {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <div className="space-y-3">
                                    <h3 className="font-semibold">Quoted Items</h3>
                                    <div className="space-y-4">
                                        {itemFields.map((it, index) => (
                                            <Card key={it.id} className="p-4">
                                                <p className="font-semibold mb-3">{form.getValues(`items.${index}.name`) || 'Item'} (Qty: {form.getValues(`items.${index}.quantity`)})</p>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <FormField
                                                        control={form.control}
                                                        name={`items.${index}.unitPrice`}
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
                                                        name={`items.${index}.leadTimeDays`}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>Delivery Time (Days)</FormLabel>
                                                                <FormControl><Input type="number" {...field} /></FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                    <FormField
                                                        control={form.control}
                                                        name={`items.${index}.brandDetails`}
                                                        render={({ field }) => (
                                                            <FormItem className="col-span-2">
                                                                <FormLabel>Brand / Model</FormLabel>
                                                                <FormControl><Input {...field} /></FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                    <FormField
                                                        control={form.control}
                                                        name={`items.${index}.imageUrl`}
                                                        render={({ field }) => (
                                                            <FormItem className="col-span-2">
                                                                <FormLabel>Item Image (Optional)</FormLabel>
                                                                <FormControl>
                                                                    <Input
                                                                        type="file"
                                                                        accept="image/*"
                                                                        onChange={async (e) => {
                                                                            const file = e.target.files?.[0];
                                                                            if (!file) return;
                                                                            const path = await handleFileUpload(file);
                                                                            if (path) form.setValue(`items.${index}.imageUrl`, path, { shouldDirty: true });
                                                                        }}
                                                                    />
                                                                </FormControl>
                                                                {field.value ? <p className="text-xs text-muted-foreground break-all">{field.value}</p> : null}
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>
                                            </Card>
                                        ))}
                                    </div>
                                </div>

                                {requisition.customQuestions && requisition.customQuestions.length > 0 && (
                                    <div className="space-y-3">
                                        <h3 className="font-semibold">Vendor Answers</h3>
                                        <div className="space-y-4">
                                            {answerFields.map((ans, index) => (
                                                <Card key={ans.id} className="p-4">
                                                    <p className="font-medium text-sm mb-2">{findQuestionText(form.getValues(`answers.${index}.questionId`) as any)}</p>
                                                    <FormField
                                                        control={form.control}
                                                        name={`answers.${index}.answer`}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormControl><Textarea {...field} placeholder="Enter answer..." /></FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                </Card>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-3">
                                    <h3 className="font-semibold">Attached Documents</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <FormField
                                            control={form.control}
                                            name="bidDocumentUrl"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Official Bid Document (Optional)</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="file"
                                                            accept=".pdf"
                                                            onChange={async (e) => {
                                                                const file = e.target.files?.[0];
                                                                if (!file) return;
                                                                const path = await handleFileUpload(file);
                                                                if (path) form.setValue('bidDocumentUrl', path, { shouldDirty: true });
                                                            }}
                                                        />
                                                    </FormControl>
                                                    {field.value ? <p className="text-xs text-muted-foreground break-all">{field.value}</p> : null}
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="cpoDocumentUrl"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>CPO Document {requisition.cpoAmount && requisition.cpoAmount > 0 ? '(Required)' : '(Optional)'}</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="file"
                                                            accept=".pdf"
                                                            onChange={async (e) => {
                                                                const file = e.target.files?.[0];
                                                                if (!file) return;
                                                                const path = await handleFileUpload(file);
                                                                if (path) form.setValue('cpoDocumentUrl', path, { shouldDirty: true });
                                                            }}
                                                        />
                                                    </FormControl>
                                                    {field.value ? <p className="text-xs text-muted-foreground break-all">{field.value}</p> : null}
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="experienceDocumentUrl"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Experience Document {(requisition.rfqSettings as any)?.experienceDocumentRequired ? '(Required)' : '(Optional)'}</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="file"
                                                            accept=".pdf"
                                                            onChange={async (e) => {
                                                                const file = e.target.files?.[0];
                                                                if (!file) return;
                                                                const path = await handleFileUpload(file);
                                                                if (path) form.setValue('experienceDocumentUrl', path, { shouldDirty: true });
                                                            }}
                                                        />
                                                    </FormControl>
                                                    {field.value ? <p className="text-xs text-muted-foreground break-all">{field.value}</p> : null}
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                </div>
                            </div>
                        </ScrollArea>

                        <DialogFooter>
                            <DialogClose asChild>
                                <Button type="button" variant="ghost" disabled={isSubmitting}>Cancel</Button>
                            </DialogClose>
                            <Button type="submit" disabled={isSubmitting || selectableVendors.length === 0}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Upload Quotation
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}

const QuoteComparison = ({ quotes, requisition, onViewDetails, onScore, user, role, isDeadlinePassed, isScoringDeadlinePassed, itemStatuses, isAwarded, isScoringComplete, isAssignedCommitteeMember, readyForCommitteeAssignment, quorumNotMetAndDeadlinePassed }: { quotes: Quotation[], requisition: PurchaseRequisition, onViewDetails: (quote: Quotation) => void, onScore: (quote: Quotation, hidePrices: boolean) => void, user: User, role: UserRole | null, isDeadlinePassed: boolean, isScoringDeadlinePassed: boolean, itemStatuses: any[], isAwarded: boolean, isScoringComplete: boolean, isAssignedCommitteeMember: boolean, readyForCommitteeAssignment: boolean, quorumNotMetAndDeadlinePassed: boolean }) => {
    const isMasked = (requisition.rfqSettings?.masked === true) || (readyForCommitteeAssignment && requisition.rfqSettings?.masked !== false) || quorumNotMetAndDeadlinePassed;

    if (quotes.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed rounded-lg bg-muted/30">
                <BadgeHelp className="h-16 w-16 text-muted-foreground/50" />
                <h3 className="mt-6 text-xl font-semibold">No Quotes Yet</h3>
                <p className="mt-2 text-sm text-muted-foreground">No vendors have submitted a quotation for this requisition.</p>
            </div>
        );
    }

    const getOverallStatusForVendor = (quote: Quotation): QuotationStatus | 'Not Awarded' | 'Partially Awarded' => {
        const isPerItemStrategy = (requisition.rfqSettings as any)?.awardStrategy === 'item';

        if (isPerItemStrategy) {
            const vendorItemStatuses = itemStatuses.filter(s => s.vendorId === quote.vendorId);
            if (vendorItemStatuses.some(s => s.status === 'Accepted')) return 'Accepted';
            if (vendorItemStatuses.some(d => d.status === 'Declined')) return 'Declined';
            if (vendorItemStatuses.some(s => s.status === 'Awarded' || s.status === 'Pending_Award')) return 'Partially Awarded';
            if (vendorItemStatuses.some(s => s.status === 'Standby')) return 'Standby';

            if (quote.status === 'Submitted') {
                return isAwarded ? 'Not Awarded' : 'Submitted';
            }
        }

        return quote.status;
    };

    const getStatusVariant = (status: QuotationStatus | 'Not Awarded' | 'Partially Awarded') => {
        switch (status) {
            case 'Awarded':
            case 'Accepted':
            case 'Pending_Award':
            case 'Partially_Awarded':
                return 'default';
            case 'Standby': return 'secondary';
            case 'Submitted': return 'outline';
            case 'Rejected':
            case 'Not Awarded':
            case 'Declined':
            case 'Failed':
                return 'destructive';
            case 'Invoice_Submitted': return 'outline';
        }
    }

    const getRankIcon = (rank?: number) => {
        switch (rank) {
            case 1: return <Crown className="h-5 w-5 text-amber-400" />;
            case 2: return <Trophy className="h-5 w-5 text-slate-400" />;
            case 3: return <Medal className="h-5 w-5 text-amber-600" />;
            default: return null;
        }
    }

    const userRoles = user.roles as UserRole[];
    const roleNames = (userRoles || []).map((r: any) => (typeof r === 'string' ? r : r?.name)).filter(Boolean);
    const isCommitteeRole = roleNames.includes('Committee_Member') || roleNames.some((r: string) => r.includes('Committee'));
    // Determine compliance committee assignment
    const committeeAssigned = (requisition.financialCommitteeMemberIds?.length || 0) > 0 || (requisition.technicalCommitteeMemberIds?.length || 0) > 0 || (requisition.complianceCommitteeMemberIds?.length || 0) > 0;
    const isAssignedCompliance = (requisition.complianceCommitteeMemberIds || []).includes(user.id) || (user.committeeAssignments || []).some((a: any) => a.requisitionId === requisition.id && a.type === 'compliance');
    const isCommitteeMember = isCommitteeRole || isAssignedCompliance;
    const needsCompliance = (requisition.rfqSettings as any)?.needsCompliance ?? true;
    // Only hide prices if compliance is required, committee is assigned, user is an assigned compliance member for this requisition, and the rfqSettings flag disallows visibility
    const assignment = (user.committeeAssignments || []).find((a: any) => a.requisitionId === requisition.id);
    const scoresSubmitted = assignment?.scoresSubmitted || false;
    const hidePrices = needsCompliance && committeeAssigned && isAssignedCompliance && !scoresSubmitted && !(requisition.rfqSettings?.technicalEvaluatorSeesPrices ?? false);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {quotes.map(quote => {
                const hasUserScored = !!(quote.scores?.some(s => s.scorerId === user.id) || quote.complianceSets?.some((c: any) => c.scorerId === user.id));
                const isPerItemStrategy = (requisition.rfqSettings as any)?.awardStrategy === 'item';
                const thisVendorItemStatuses = itemStatuses.filter(s => s.vendorId === quote.vendorId);
                const mainStatus = getOverallStatusForVendor(quote);

                const submissionLabel = quote.submissionMethod === 'Manual' ? 'Manual' : 'Electronic';
                const submissionVariant = quote.submissionMethod === 'Manual' ? 'secondary' : 'outline';

                const shouldShowItems = isPerItemStrategy && isAwarded && thisVendorItemStatuses.length > 0;

                const declinedItemAwards = isPerItemStrategy
                    ? requisition.items
                        .flatMap(item => {
                            const detail = (item.perItemAwardDetails as PerItemAwardDetail[] || [])
                                .find(detail => detail.vendorId === quote.vendorId && (detail.status === 'Declined' || detail.status === 'Failed_to_Award') && detail.rejectionReason);
                            return detail ? [{ ...detail, reqItemName: item.name }] : [];
                        })
                    : [];

                const hasDeclineReason = quote.rejectionReason || declinedItemAwards.length > 0;


                return (
                    <Card
                        key={quote.id}
                        className={cn(
                            "flex flex-col",
                            mainStatus === 'Awarded' && !isPerItemStrategy && 'border-green-600 ring-2 ring-green-600',
                            (mainStatus === 'Partially_Awarded' || mainStatus === 'Accepted') && !isPerItemStrategy && 'border-primary ring-2 ring-primary'
                        )}
                    >
                        <CardHeader>
                            <CardTitle className="flex justify-between items-start">
                                <div className="flex items-center gap-2">
                                    {isAwarded && !isPerItemStrategy && getRankIcon(quote.rank)}
                                    <span>{isMasked ? "Masked Vendor" : quote.vendorName}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Badge variant={submissionVariant as any}>{submissionLabel}</Badge>
                                    <Badge
                                        variant={getStatusVariant(mainStatus as any)}
                                        className={cn(mainStatus === 'Awarded' && 'bg-green-600 text-white hover:bg-green-600')}
                                    >
                                        {mainStatus.replace(/_/g, ' ')}
                                    </Badge>
                                    {hasDeclineReason && (
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <AlertCircle className="h-4 w-4 text-destructive inline-block ml-2 cursor-help" />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <div className="space-y-2 p-2 max-w-xs">
                                                        <p className="font-semibold">Reason for Decline:</p>
                                                        {isPerItemStrategy && declinedItemAwards.length > 0 ? (
                                                            declinedItemAwards.map((award, index) => (
                                                                <div key={index}>
                                                                    <p><strong>Item:</strong> {award.reqItemName}</p>
                                                                    <p className="italic text-muted-foreground">"{award.rejectionReason}"</p>
                                                                </div>
                                                            ))
                                                        ) : (
                                                            <p className="italic text-muted-foreground">"{quote.rejectionReason}"</p>
                                                        )}
                                                    </div>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    )}
                                </div>
                            </CardTitle>
                            <CardDescription>
                                <span className="text-xs">Submitted {formatDistanceToNow(new Date(quote.createdAt), { addSuffix: true })}</span>
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex-grow space-y-4">
                            {!isMasked && quote.bidDocumentUrl && (
                                <Button asChild variant="outline" size="sm" className="w-full">
                                    <a href={quote.bidDocumentUrl} target="_blank" rel="noopener noreferrer">
                                        <FileText className="mr-2 h-4 w-4" /> View Bid Document
                                    </a>
                                </Button>
                            )}
                            {!isMasked && quote.experienceDocumentUrl && (
                                <Button asChild variant="outline" size="sm" className="w-full">
                                    <a href={quote.experienceDocumentUrl} target="_blank" rel="noopener noreferrer">
                                        <UserCog className="mr-2 h-4 w-4" /> View Experience Document
                                    </a>
                                </Button>
                            )}
                            {(!isMasked && (isDeadlinePassed || quote.cpoDocumentUrl)) ? (
                                <>
                                    {hidePrices ? (
                                        <div className="text-center py-4">
                                            <p className="font-semibold text-muted-foreground">Pricing information is hidden for compliance evaluation.</p>
                                        </div>
                                    ) : (
                                        <>
                                            {isDeadlinePassed && <div className="text-3xl font-bold text-center">{quote.totalPrice.toLocaleString()} ETB</div>}
                                            {isDeadlinePassed && (() => {
                                                const maxLead = Math.max(...(quote.items?.map(i => Number(i.leadTimeDays) || 0) || [0]));
                                                if (quote.status === 'Accepted') {
                                                    const ref = new Date(quote.updatedAt || quote.createdAt || new Date());
                                                    const days = Math.max(0, differenceInCalendarDays(new Date(quote.deliveryDate), ref));
                                                    return <div className="text-center text-muted-foreground">Est. Delivery: {days} days after acceptance</div>;
                                                }
                                                return <div className="text-center text-muted-foreground">Est. Delivery: Delivery time in {maxLead} days after acceptance</div>;
                                            })()}
                                        </>
                                    )}

                                    {shouldShowItems && (
                                        <div className="text-sm space-y-2 pt-2 border-t">
                                            <h4 className="font-semibold">Your Item Statuses</h4>
                                            {thisVendorItemStatuses.map(item => (
                                                <div key={item.id} className="flex justify-between items-center text-muted-foreground">
                                                    <div className="flex items-center gap-2">
                                                        {getRankIcon(item.rank)}
                                                        <div className="flex flex-col">
                                                            <span className="font-medium text-foreground">{item.proposedItemName}</span>
                                                            <span className="text-xs italic">(for: {item.reqItemName})</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <Badge variant={getStatusVariant(item.status as any)}>{item.status.replace(/_/g, ' ')}</Badge>
                                                        {!hidePrices && typeof item.unitPrice === 'number' && <Badge variant="outline" className="font-mono">{item.unitPrice.toFixed(2)} ETB</Badge>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="text-center py-8">
                                    <TimerOff className="h-8 w-8 mx-auto text-muted-foreground" />
                                    <p className="font-semibold mt-2">Details Masked</p>
                                    <p className="text-sm text-muted-foreground">Requires director PIN verification to unseal vendor quotes.</p>
                                </div>
                            )}

                            {isAwarded && (
                                <div className="text-center pt-2 border-t">
                                    <h4 className="font-semibold text-sm">Total Price</h4>
                                    <p className="text-2xl font-bold text-primary">{hidePrices ? 'Hidden' : quote.totalPrice.toLocaleString() + ' ETB'}</p>
                                </div>
                            )}
                        </CardContent>
                        <CardFooter className="flex flex-col gap-2">
                            <Button className="w-full" variant="outline" onClick={() => onViewDetails(quote)} disabled={isMasked}>
                                <Eye className="mr-2 h-4 w-4" /> {isMasked ? 'Sealed' : 'View Full Quote'}
                            </Button>

                            {/* Scoring UI removed: ranking and award are now price-based */}
                        </CardFooter>
                    </Card>
                )
            })}
        </div>
    )
}

const ContractManagement = ({ requisition, onContractFinalized }: { requisition: PurchaseRequisition, onContractFinalized: () => void }) => {
    const [isSubmitting, setSubmitting] = useState(false);
    const { toast } = useToast();
    const { user } = useAuth();
    const [file, setFile] = useState<File | null>(null);

    const awardedQuote = requisition.quotations?.find(q => q.status === 'Accepted');

    const onContractSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!user || !awardedQuote || !file) {
            toast({ variant: 'destructive', title: 'Error', description: 'Please select a file to upload.' });
            return;
        }

        setSubmitting(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('directory', 'contracts');

            const uploadResponse = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });
            const uploadResult = await uploadResponse.json();
            if (!uploadResponse.ok) {
                throw new Error(uploadResult.error || 'Failed to upload file.');
            }
            const filePath = uploadResult.path;

            const notes = (event.target as any).notes.value;

            const response = await fetch(`/api/contracts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    requisitionId: requisition.id,
                    vendorId: awardedQuote.vendorId,
                    filePath: filePath,
                    notes,
                    userId: user.id
                }),
            });
            if (!response.ok) throw new Error("Failed to save contract details.");

            toast({ title: "Contract Details Saved!", description: "The PO can now be formally sent to the vendor." });
            onContractFinalized();
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error instanceof Error ? error.message : 'An unknown error occurred.',
            });
        } finally {
            setSubmitting(false);
        }
    }

    if (!awardedQuote) return null;

    return (
        <Card className="mt-6 border-primary/50">
            <CardHeader>
                <CardTitle>Contract &amp; PO Finalization</CardTitle>
                <CardDescription>
                    The vendor <span className="font-semibold">{awardedQuote?.vendorName}</span> has accepted the award.
                    A PO (<span className="font-mono">{requisition.purchaseOrderId}</span>) has been generated. Please finalize and send the documents.
                </CardDescription>
            </CardHeader>
            <form onSubmit={onContractSubmit}>
                <CardContent className="space-y-4">
                    <div>
                        <Label htmlFor="fileName">Final Contract Document</Label>
                        <Input id="fileName" name="fileName" type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                    </div>
                    <div>
                        <Label htmlFor="notes">Negotiation &amp; Finalization Notes</Label>
                        <Textarea id="notes" name="notes" rows={5} placeholder="Record key negotiation points, final terms, etc." />
                    </div>
                </CardContent>
                <CardFooter className="flex-col sm:flex-row justify-between gap-2">
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSignature className="mr-2 h-4 w-4" />}
                        Save Contract Details
                    </Button>
                    <Button asChild variant="secondary">
                        <Link href={`/purchase-orders/${requisition.purchaseOrderId}`} target="_blank">View Purchase Order</Link>
                    </Button>
                </CardFooter>
            </form>
        </Card>
    )
}

const DirectorPinVerification = ({ requisition, onUnmasked }: { requisition: PurchaseRequisition, onUnmasked: () => void }) => {
    const { user, token, role } = useAuth();
    const { toast } = useToast();
    const [pins, setPins] = React.useState<any[]>([]);
    const [unsealThreshold, setUnsealThreshold] = React.useState<number | undefined>((requisition.rfqSettings as any)?.unsealThreshold);
    const [inputs, setInputs] = React.useState<Record<string, string>>({});
    const isRfqSender = (user && ((user.roles as any[]).some(r => (typeof r === 'string' ? r === 'Procurement_Officer' : r.name === 'Procurement_Officer')) || (user.roles as any[]).some(r => (typeof r === 'string' ? r === 'Admin' : r.name === 'Admin'))));

    const DIRECTOR_ROLES = ['Finance_Director', 'Facility_Director', 'Director_Supply_Chain_and_Property_Management'];
    const DEPT_HEAD_ROLE = 'Department_Head';

    const isPresenceVerified = Boolean((requisition.rfqSettings as any)?.directorPresenceVerified) || (requisition.rfqSettings as any)?.masked === false;
    const presenceVerifiedAt = (requisition.rfqSettings as any)?.directorPresenceVerifiedAt as string | undefined;
    const effectiveThreshold = unsealThreshold ?? (requisition.rfqSettings as any)?.unsealThreshold ?? DIRECTOR_ROLES.length;

    const fetchExistingPins = async () => {
        if (!token) return;
        try {
            const res = await fetch(`/api/requisitions/${requisition.id}/pins`, { headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            if (!res.ok) return;
            setPins(Array.isArray(data.pins) ? data.pins : data.pins || []);
        } catch (e) {
            // ignore
        }
    };

    useEffect(() => { fetchExistingPins(); }, [requisition.id, token]);

    useEffect(() => {
        // keep threshold input in sync if requisition refreshed
        setUnsealThreshold((requisition.rfqSettings as any)?.unsealThreshold);
    }, [requisition]);

    const generatePins = async () => {
        if (isPresenceVerified) {
            toast({ title: 'Already verified', description: 'Director presence is already verified for this requisition.' });
            return;
        }
        if (!token) return;
        try {
            const res = await fetch(`/api/requisitions/${requisition.id}/generate-pins`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to generate pins');
            const skipped = Array.isArray(data.skippedVerifiedRecipientIds) ? data.skippedVerifiedRecipientIds.length : 0;
            toast({
                title: 'Pins generated',
                description: skipped > 0
                    ? `Pins were generated and sent to remaining directors. Skipped ${skipped} already-verified personnel.`
                    : 'Pins were generated and sent to remaining directors.',
            });
            await fetchExistingPins();
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: e instanceof Error ? e.message : 'Failed to generate pins' });
        }
    };

    const verifyPin = async (roleName: string) => {
        if (!token) return;
        const pin = inputs[roleName];
        if (!pin) { toast({ variant: 'destructive', title: 'Missing PIN', description: 'Enter PIN to verify.' }); return; }
        try {
            const res = await fetch(`/api/requisitions/${requisition.id}/verify-pin`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ roleName, pin }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Invalid');
            if (data.unmasked) {
                toast({ title: 'All verified', description: 'Vendor cards are now unmasked.' });
                onUnmasked();
            } else {
                toast({ title: 'Verified', description: 'PIN accepted successfully.' });
            }
            await fetchExistingPins();
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: e instanceof Error ? e.message : 'Verification failed' });
        }
    };

    // Directors obtain PINs via email or the dedicated Pins page.
    const isDirectorUser = user && DIRECTOR_ROLES.some(rn => (user.roles as any[]).some((x: any) => (typeof x === 'string' ? x === rn : x.name === rn)));

    const verifiedDistinctCount = React.useMemo(() => {
        const usedByIds = new Set((pins || []).filter((p: any) => p.used && p.usedById).map((p: any) => p.usedById));
        return usedByIds.size;
    }, [pins]);

    const directorRecipients = React.useMemo(() => {
        const byKey = new Map<string, { recipient: any; roleName: string }>();
        (pins || []).forEach((p: any) => {
            if (![...DIRECTOR_ROLES, DEPT_HEAD_ROLE].includes(p.roleName)) return;
            if (!p.recipient?.id) return;
            const key = `${p.roleName}:${p.recipient.id}`;
            if (!byKey.has(key)) {
                byKey.set(key, { recipient: p.recipient, roleName: p.roleName });
            }
        });
        return Array.from(byKey.values());
    }, [pins]);

    return (
        <Card className="mt-6 border-yellow-200">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    Director Presence Verification
                    {isPresenceVerified ? (
                        <Badge className="bg-green-600 text-white hover:bg-green-600">Verified</Badge>
                    ) : (
                        <Badge variant="secondary">Pending</Badge>
                    )}
                </CardTitle>
                <CardDescription>
                    {isPresenceVerified ? (
                        <>
                            Director presence is verified and vendor pricing is unmasked.
                            {presenceVerifiedAt ? ` Verified at: ${new Date(presenceVerifiedAt).toLocaleString()}.` : ''}
                        </>
                    ) : (
                        <>
                            The vendor pricing will remain masked until the configured number of directors verify.
                            Current threshold: {effectiveThreshold}. Verified: {verifiedDistinctCount}/{effectiveThreshold}.
                        </>
                    )}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    {isRfqSender && !isPresenceVerified && (
                        <div className="flex items-center gap-2">
                            <Button onClick={generatePins} variant={pins && pins.length > 0 ? 'destructive' : 'outline'}>
                                {pins && pins.length > 0 ? 'Regenerate Pins' : 'Generate Pins'}
                            </Button>
                            <p className="text-sm text-muted-foreground">{pins && pins.length > 0 ? 'Regenerates and replaces previous PINs for this requisition.' : 'Generate one-time PINs and notify directors.'}</p>
                        </div>
                    )}
                    <div className="grid md:grid-cols-3 gap-4">
                        <div className="border rounded p-3">
                            <h4 className="font-semibold mb-2">Unseal Threshold</h4>
                            <p className="text-sm text-muted-foreground mb-2">Number of director verifications required to unmask quotations.</p>
                            <div className="flex items-center gap-2">
                                <Input
                                    type="number"
                                    value={String(effectiveThreshold)}
                                    disabled={!isRfqSender || isPresenceVerified}
                                    onChange={(e) => setUnsealThreshold(Number(e.target.value))}
                                />
                                <Button onClick={async () => {
                                    if (!token) return;
                                    if (isPresenceVerified) return;
                                    try {
                                        const res = await fetch(`/api/requisitions/${requisition.id}/set-unseal-threshold`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ threshold: Number(effectiveThreshold) }) });
                                        const d = await res.json();
                                        if (!res.ok) throw new Error(d.error || 'Failed to set threshold');
                                        toast({ title: 'Threshold updated', description: `Unseal threshold set to ${d.threshold}` });
                                    } catch (e: any) {
                                        toast({ variant: 'destructive', title: 'Error', description: e?.message || 'Failed to set threshold' });
                                    }
                                }} disabled={!isRfqSender || isPresenceVerified}>Save</Button>
                            </div>
                        </div>
                        {(directorRecipients.length > 0 ? directorRecipients : [...DIRECTOR_ROLES, DEPT_HEAD_ROLE].map(rn => ({ roleName: rn, recipient: undefined } as any))).map((entry: any) => {
                            const rn = entry.roleName as string;
                            const recipient = entry.recipient as any | undefined;
                            const recipientId = recipient?.id as string | undefined;
                            const personVerified = recipientId
                                ? (pins || []).some((p: any) => p.roleName === rn && p.used && p.usedById && p.usedById === recipientId)
                                : false;
                            const canVerify = Boolean(user && (user.id === recipientId) && rn !== DEPT_HEAD_ROLE);

                            return (
                                <div key={`${rn}:${recipientId || 'none'}`} className="border rounded p-3">
                                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                                        {rn === DEPT_HEAD_ROLE ? 'Department Head' : rn.replace(/_/g, ' ')}
                                        {recipient ? (
                                            <span className="text-xs text-muted-foreground">— {recipient.name || recipient.email}</span>
                                        ) : null}
                                        {personVerified ? (
                                            <Badge className="bg-green-600 text-white hover:bg-green-600">Verified</Badge>
                                        ) : (
                                            <Badge variant="secondary">Pending</Badge>
                                        )}
                                    </h4>

                                    {recipient ? (
                                        canVerify ? (
                                            <div className="flex gap-2">
                                                <Input value={inputs[rn] || ''} onChange={(e) => setInputs(s => ({ ...s, [rn]: e.target.value }))} placeholder="Enter PIN" />
                                                <Button onClick={() => verifyPin(rn)}>Verify</Button>
                                            </div>
                                        ) : (
                                            <p className="text-sm text-muted-foreground">Awaiting {recipient.name || recipient.email} to verify.</p>
                                        )
                                    ) : (
                                        <p className="text-sm text-muted-foreground">No PIN has been issued yet for this role.</p>
                                    )}

                                    {isRfqSender && (
                                        <div className="mt-3 space-y-1">
                                            {(pins || []).filter((p: any) => p.roleName === rn && (!recipientId || p.recipient?.id === recipientId)).slice(0, 5).map((p: any) => (
                                                <div key={p.id} className="flex items-center justify-between text-xs text-muted-foreground">
                                                    <span>{p.recipient?.name || p.recipient?.email || p.recipient?.id || 'Recipient'}</span>
                                                    <span>{p.used && p.usedById ? `Verified${p.usedBy?.name ? ` by ${p.usedBy.name}` : ''}` : 'Pending'}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    {isDirectorUser && !isPresenceVerified && (
                        <div className="mt-4">
                            <p className="text-sm text-muted-foreground">
                                To view or resend your PIN, use the Pins page.
                            </p>
                            <Button asChild variant="secondary" className="mt-2">
                                <Link href="/requisitions/pins">Go to Pins</Link>
                            </Button>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};

const committeeFormSchema = z.object({
    committeeName: z.string().min(2, "Committee name must be at least 2 characters long."),
    committeePurpose: z.string().min(2, "Purpose must be at least 2 characters long."),
    // financial is optional now because some RFQs use a merged compliance committee
    financialCommitteeMemberIds: z.array(z.string()).optional(),
    technicalCommitteeMemberIds: z.array(z.string()).optional(),
    complianceCommitteeMemberIds: z.array(z.string()).optional(),
});

type CommitteeFormValues = z.infer<typeof committeeFormSchema>;

const EvaluationCommitteeManagement = ({ requisition, onCommitteeUpdated, open, onOpenChange, isAuthorized, isEditDisabled }: { requisition: PurchaseRequisition; onCommitteeUpdated: () => void; open: boolean; onOpenChange: (open: boolean) => void; isAuthorized: boolean; isEditDisabled: boolean }) => {
    const { user, allUsers, token } = useAuth();
    const { toast } = useToast();
    const [isSubmitting, setSubmitting] = useState(false);
    const [deadlineDate, setDeadlineDate] = useState<Date | undefined>(
        requisition.scoringDeadline ? new Date(requisition.scoringDeadline) : undefined
    );
    const [deadlineTime, setDeadlineTime] = useState(
        requisition.scoringDeadline ? format(new Date(requisition.scoringDeadline), 'HH:mm') : '17:00'
    );
    const [technicalViewPrices, setTechnicalViewPrices] = useState(requisition.rfqSettings?.technicalEvaluatorSeesPrices ?? true);

    const form = useForm<CommitteeFormValues>({
        resolver: zodResolver(committeeFormSchema),
        defaultValues: {
            committeeName: requisition.committeeName || "",
            committeePurpose: requisition.committeePurpose || "",
            financialCommitteeMemberIds: requisition.financialCommitteeMemberIds || [],
            technicalCommitteeMemberIds: requisition.technicalCommitteeMemberIds || [],
            complianceCommitteeMemberIds: (requisition.financialCommitteeMemberIds || []).concat(requisition.technicalCommitteeMemberIds || []).filter(Boolean),
        },
    });

    const finalDeadline = useMemo(() => {
        if (!deadlineDate) return undefined;
        const [hours, minutes] = deadlineTime.split(':').map(Number);
        return setMinutes(setHours(deadlineDate, hours), minutes);
    }, [deadlineDate, deadlineTime]);

    useEffect(() => {
        form.reset({
            committeeName: requisition.committeeName || "",
            committeePurpose: requisition.committeePurpose || "",
            financialCommitteeMemberIds: requisition.financialCommitteeMemberIds || [],
            technicalCommitteeMemberIds: requisition.technicalCommitteeMemberIds || [],
            complianceCommitteeMemberIds: (requisition.financialCommitteeMemberIds || []).concat(requisition.technicalCommitteeMemberIds || []).filter(Boolean),
        });
        if (requisition.scoringDeadline) {
            setDeadlineDate(new Date(requisition.scoringDeadline));
            setDeadlineTime(format(new Date(requisition.scoringDeadline), 'HH:mm'));
        }
        setTechnicalViewPrices(requisition.rfqSettings?.technicalEvaluatorSeesPrices ?? true);
    }, [requisition, form]);

    const handleSaveCommittee = async (values: CommitteeFormValues) => {
        if (!user || !finalDeadline || !token) {
            toast({
                variant: 'destructive',
                title: 'Invalid Deadline',
                description: 'A scoring deadline must be set.',
            });
            return;
        }

        // runtime validation for merged compliance committee
        if (requisition.rfqSettings?.needsCompliance) {
            const hasCompliance = (values as any).complianceCommitteeMemberIds && (values as any).complianceCommitteeMemberIds.length > 0;
            if (!hasCompliance) {
                toast({ variant: 'destructive', title: 'No committee members', description: 'Please assign at least one member to the Compliance Committee.' });
                return;
            }
        } else {
            const hasFinancial = (values as any).financialCommitteeMemberIds && (values as any).financialCommitteeMemberIds.length > 0;
            if (!hasFinancial) {
                toast({ variant: 'destructive', title: 'No financial members', description: 'Please assign at least one financial committee member.' });
                return;
            }
        }

        if (isBefore(finalDeadline, new Date())) {
            toast({
                variant: 'destructive',
                title: 'Invalid Deadline',
                description: 'The scoring deadline must be in the future.',
            });
            return;
        }

        setSubmitting(true);
        try {
            const payloadBody: any = {
                userId: user.id,
                scoringDeadline: finalDeadline,
                rfqSettings: {
                    ...requisition.rfqSettings,
                    technicalEvaluatorSeesPrices: technicalViewPrices
                }
            };

            if (requisition.rfqSettings?.needsCompliance) {
                // merge compliance list into both financial and technical for backend consistency
                payloadBody.financialCommitteeMemberIds = values.complianceCommitteeMemberIds || [];
                payloadBody.technicalCommitteeMemberIds = values.complianceCommitteeMemberIds || [];
                payloadBody.committeeName = values.committeeName;
                payloadBody.committeePurpose = values.committeePurpose;
            } else {
                Object.assign(payloadBody, values);
            }

            const response = await fetch(`/api/requisitions/${requisition.id}/assign-committee`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payloadBody),
            });
            const responseData = await response.json();

            if (!response.ok) {
                throw new Error(responseData.error || 'Failed to assign committee.');
            }

            toast({ title: 'Committee Updated!', description: 'The evaluation committee has been updated.' });
            onOpenChange(false);
            onCommitteeUpdated();
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error instanceof Error ? error.message : 'An unknown error occurred.',
            });
        } finally {
            setSubmitting(false);
        }
    }

    const committeeMembers = useMemo(() => allUsers.filter(u => u.departmentId === requisition.departmentId), [allUsers, requisition]);
    const assignedFinancialMembers = useMemo(() => allUsers.filter(u => requisition.financialCommitteeMemberIds?.includes(u.id)), [allUsers, requisition]);
    const assignedTechnicalMembers = useMemo(() => allUsers.filter(u => requisition.technicalCommitteeMemberIds?.includes(u.id)), [allUsers, requisition]);
    const assignedComplianceMembers = useMemo(() => {
        const ids = new Set([...(requisition.financialCommitteeMemberIds || []), ...(requisition.technicalCommitteeMemberIds || [])]);
        return allUsers.filter(u => ids.has(u.id));
    }, [allUsers, requisition]);
    const allAssignedMemberIds = useMemo(() => [...(requisition.financialCommitteeMemberIds || []), ...(requisition.technicalCommitteeMemberIds || [])], [requisition]);

    const MemberList = ({ title, description, members }: { title: string, description: string, members: User[] }) => (
        <div>
            <h4 className="font-semibold">{title}</h4>
            <p className="text-sm text-muted-foreground mb-3">{description}</p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
                {members.length > 0 ? (
                    members.map(member => (
                        <div key={member.id} className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                                <AvatarImage src={`https://picsum.photos/seed/${member.id}/40/40`} data-ai-hint="profile picture" />
                                <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium">{member.name}</span>
                        </div>
                    ))
                ) : (
                    <p className="text-sm text-muted-foreground">No members assigned.</p>
                )}
            </div>
        </div>
    );

    const MemberSelection = ({ type }: { type: 'financial' | 'technical' | 'compliance' }) => {
        const [search, setSearch] = useState("");

        const availableMembers = useMemo(() => {
            const lowercasedSearch = search.toLowerCase();
            return committeeMembers.filter(member =>
                (member.name.toLowerCase().includes(lowercasedSearch) || member.email.toLowerCase().includes(lowercasedSearch))
            );
        }, [committeeMembers, search]);

        return (
            <div className="space-y-2">
                <div className="relative pt-2">
                    <Search className="absolute left-2.5 top-5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder={`Search ${type} members...`}
                        className="pl-8 w-full"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <FormField
                    control={form.control}
                    name={`${type}CommitteeMemberIds` as any}
                    render={() => (
                        <FormItem className="flex-1 flex flex-col min-h-0">
                            <ScrollArea className="flex-1 rounded-md border h-60">
                                <div className="space-y-1 p-1">
                                    {availableMembers.map(member => (
                                        <FormField
                                            key={member.id}
                                            control={form.control}
                                            name={`${type}CommitteeMemberIds` as any}
                                            render={({ field }) => (
                                                <FormItem className="flex items-start space-x-4 rounded-md border p-2 has-[:checked]:bg-muted">
                                                    <FormControl>
                                                        <Checkbox
                                                            checked={field.value?.includes(member.id)}
                                                            onCheckedChange={(checked) => {
                                                                return checked
                                                                    ? field.onChange([...(field.value || []), member.id])
                                                                    : field.onChange(field.value?.filter((id) => id !== member.id))
                                                            }}
                                                        />
                                                    </FormControl>
                                                    <div className="flex items-start gap-3 flex-1">
                                                        <Avatar className="h-8 w-8">
                                                            <AvatarImage src={`https://picsum.photos/seed/${member.id}/32/32`} data-ai-hint="profile picture" />
                                                            <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
                                                        </Avatar>
                                                        <div className="grid gap-0.5">
                                                            <Label className="font-normal cursor-pointer text-sm">{member.name}</Label>
                                                            <p className="text-xs text-muted-foreground">{member.email}</p>
                                                        </div>
                                                    </div>
                                                </FormItem>
                                            )}
                                        />
                                    ))}
                                    {availableMembers.length === 0 && (
                                        <div className="text-center text-muted-foreground py-10">No members available.</div>
                                    )}
                                </div>
                            </ScrollArea>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>
        );
    }

    const triggerButton = (
        <Button variant="outline" className="w-full sm:w-auto" disabled={!isAuthorized || isEditDisabled}>
            {allAssignedMemberIds.length > 0 ? (
                <><Edit2 className="mr-2 h-4 w-4" /> Edit Committee</>
            ) : (
                <><Users className="mr-2 h-4 w-4" /> Assign Committee</>
            )}
        </Button>
    );

    return (
        <Card className="border-dashed">
            <CardHeader className="flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div>
                    <CardTitle>Evaluation Committee (Scorers)</CardTitle>
                    <CardDescription>
                        {requisition.committeePurpose ? `Purpose: ${requisition.committeePurpose}` : 'Assign scorers to evaluate vendor quotations.'}
                    </CardDescription>
                </div>
                <Dialog open={open} onOpenChange={onOpenChange}>
                    <DialogTrigger asChild>
                        {isAuthorized ? (
                            triggerButton
                        ) : (
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span tabIndex={0}>{triggerButton}</span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>You are not authorized to manage committees.</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        )}
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl flex flex-col max-h-[90vh]">
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(handleSaveCommittee)} className="flex flex-col flex-1 min-h-0">
                                <DialogHeader>
                                    <DialogTitle>Manage Evaluation Committee</DialogTitle>
                                    <DialogDescription>Assign members to score the quotations for this requisition.</DialogDescription>
                                </DialogHeader>
                                <div className="flex-1 overflow-y-auto space-y-4 p-1 -mx-1">
                                    <div className="grid md:grid-cols-2 gap-4">
                                        <FormField
                                            control={form.control}
                                            name="committeeName"
                                            render={({ field }) => (
                                                <FormItem><FormLabel>Committee Name</FormLabel><FormControl><Input {...field} placeholder="e.g., Q4 Laptop Procurement Committee" /></FormControl><FormMessage /></FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="committeePurpose"
                                            render={({ field }) => (
                                                <FormItem><FormLabel>Purpose / Mandate</FormLabel><FormControl><Input {...field} placeholder="e.g., To evaluate vendor submissions for REQ-..." /></FormControl><FormMessage /></FormItem>
                                            )}
                                        />
                                    </div>
                                    <div className="grid md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <FormLabel>Committee Compliance Deadline</FormLabel>
                                            <div className="flex gap-2">
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <Button
                                                            variant={"outline"}
                                                            className={cn("flex-1", !deadlineDate && "text-muted-foreground")}
                                                        >
                                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                                            {deadlineDate ? format(deadlineDate, "PPP") : <span>Pick a date</span>}
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0">
                                                        <Calendar
                                                            mode="single"
                                                            selected={deadlineDate}
                                                            onSelect={setDeadlineDate}
                                                            disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                                                            initialFocus
                                                        />
                                                    </PopoverContent>
                                                </Popover>
                                                <Input
                                                    type="time"
                                                    className="w-32"
                                                    value={deadlineTime}
                                                    onChange={(e) => setDeadlineTime(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <FormLabel>Price Visibility</FormLabel>
                                            <div className="flex items-center space-x-2 rounded-md border p-2 h-10">
                                                <Switch
                                                    id="technical-view-prices"
                                                    checked={technicalViewPrices}
                                                    onCheckedChange={setTechnicalViewPrices}
                                                />
                                                <Label htmlFor="technical-view-prices">Allow compliance evaluators to see prices</Label>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid md:grid-cols-2 gap-6">
                                        {requisition.rfqSettings?.needsCompliance ? (
                                            <div className="md:col-span-2">
                                                <h3 className="font-semibold text-lg">Compliance Committee</h3>
                                                <p className="text-sm text-muted-foreground mb-2">Merged financial and technical criteria committee for compliance checks.</p>
                                                <FormField
                                                    control={form.control}
                                                    name="complianceCommitteeMemberIds"
                                                    render={() => (
                                                        <FormItem>
                                                            <MemberSelection type="compliance" />
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>
                                        ) : (
                                            <>
                                                <div>
                                                    <h3 className="font-semibold text-lg">Financial Committee</h3>
                                                    <MemberSelection type="financial" />
                                                </div>
                                                <div>
                                                    <h3 className="font-semibold text-lg">Technical Committee</h3>
                                                    <MemberSelection type="technical" />
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <DialogFooter className="pt-4 border-t mt-4">
                                    <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                                    <Button type="submit" disabled={isSubmitting}>
                                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Save Committee
                                    </Button>
                                </DialogFooter>
                            </form>
                        </Form>
                    </DialogContent>
                </Dialog>
            </CardHeader>
            <CardContent className="space-y-6">
                {requisition.rfqSettings?.needsCompliance ? (
                    <MemberList title="Compliance Committee" description="Merged committee responsible for compliance checks (financial + technical)." members={assignedComplianceMembers} />
                ) : (
                    <>
                        <MemberList title="Financial Committee" description="Responsible for evaluating cost and financial stability." members={assignedFinancialMembers} />
                        <MemberList title="Technical Committee" description="Responsible for assessing technical specs and compliance." members={assignedTechnicalMembers} />
                    </>
                )}
                {requisition.scoringDeadline && (
                    <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground border-t pt-4">
                        <Timer className="h-4 w-4" />
                        <span className="font-semibold">Scoring Deadline:</span>
                        <span>{format(new Date(requisition.scoringDeadline), 'PPpp')}</span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

const RFQActionDialog = ({
    action,
    requisition,
    isOpen,
    onClose,
    onSuccess,
}: {
    action: 'update' | 'cancel' | 'restart',
    requisition: PurchaseRequisition,
    isOpen: boolean,
    onClose: () => void,
    onSuccess: () => void,
}) => {
    const { user, token } = useAuth();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [reason, setReason] = useState('');
    const [newDeadlineDate, setNewDeadlineDate] = useState<Date | undefined>(requisition.deadline ? new Date(requisition.deadline) : undefined);
    const [newDeadlineTime, setNewDeadlineTime] = useState<string>(requisition.deadline ? format(new Date(requisition.deadline), 'HH:mm') : '17:00');

    const finalNewDeadline = useMemo(() => {
        if (!newDeadlineDate) return undefined;
        const [hours, minutes] = newDeadlineTime.split(':').map(Number);
        return setMinutes(setHours(newDeadlineDate, hours), minutes);
    }, [newDeadlineDate, newDeadlineTime]);

    const handleSubmit = async () => {
        if (!user || !token) return;
        if (action !== 'update' && !reason.trim()) {
            toast({ variant: 'destructive', title: 'Error', description: 'A reason must be provided.' });
            return;
        }
        if (action === 'update' && (!finalNewDeadline || isBefore(finalNewDeadline, new Date()))) {
            toast({ variant: 'destructive', title: 'Error', description: 'The new deadline must be in the future.' });
            return;
        }

        setIsSubmitting(true);
        try {
            const response = await fetch(`/api/requisitions/${requisition.id}/manage-rfq`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    userId: user.id,
                    action,
                    reason,
                    newDeadline: action === 'update' ? finalNewDeadline : undefined
                }),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Failed to ${action} RFQ.`);
            }
            toast({ title: 'Success', description: `The RFQ has been successfully ${action === 'update' ? 'updated' : 'managed'}.` });
            onSuccess();
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: error instanceof Error ? error.message : 'An unknown error occurred.' });
        } finally {
            setIsSubmitting(false);
            onClose();
        }
    };

    const titles = {
        update: 'Update RFQ Deadline',
        cancel: 'Cancel RFQ',
        restart: 'Restart RFQ (No Bids)'
    };

    const descriptions = {
        update: "Provide a reason and set a new deadline for this RFQ. Vendors will be notified.",
        cancel: "Provide a reason for cancelling this RFQ. This will revert the requisition to 'PreApproved' status and reject all submitted quotes.",
        restart: "No bids were received for this RFQ. You can restart the process to send it out again, or cancel it entirely."
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{titles[action]}</DialogTitle>
                    <DialogDescription>{descriptions[action]}</DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    {action === 'update' && (
                        <div className="space-y-2">
                            <Label>New Quotation Submission Deadline</Label>
                            <div className="flex gap-2">
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant={"outline"}
                                            className={cn(
                                                "w-full justify-start text-left font-normal",
                                                !newDeadlineDate && "text-muted-foreground"
                                            )}
                                        >
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {newDeadlineDate ? format(newDeadlineDate, "PPP") : <span>Pick a date</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <Calendar
                                            mode="single"
                                            selected={newDeadlineDate}
                                            onSelect={setNewDeadlineDate}
                                            disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                                            initialFocus
                                        />
                                    </PopoverContent>
                                </Popover>
                                <Input
                                    type="time"
                                    className="w-32"
                                    value={newDeadlineTime}
                                    onChange={(e) => setNewDeadlineTime(e.target.value)}
                                />
                            </div>
                        </div>
                    )}
                    {action !== 'update' && (
                        <div>
                            <Label htmlFor="reason">Reason for Action</Label>
                            <Textarea id="reason" value={reason} onChange={e => setReason(e.target.value)} className="mt-2" />
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="ghost">Close</Button></DialogClose>
                    <Button onClick={handleSubmit} disabled={isSubmitting} variant={(action === 'cancel' || action === 'restart') ? 'destructive' : 'default'}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Confirm {action.charAt(0).toUpperCase() + action.slice(1)}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

const RFQDistribution = ({ requisition, vendors, onRfqSent, isAuthorized }: { requisition: PurchaseRequisition; vendors: Vendor[]; onRfqSent: () => void; isAuthorized: boolean; }) => {
    const [distributionType, setDistributionType] = useState('all');
    const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
    const [vendorSearch, setVendorSearch] = useState("");
    const [isSubmitting, setSubmitting] = useState(false);
    const [deadlineDate, setDeadlineDate] = useState<Date | undefined>();
    const [deadlineTime, setDeadlineTime] = useState('17:00');
    const [cpoAmount, setCpoAmount] = useState<number | undefined>(requisition.cpoAmount);
    const [rfqFile, setRfqFile] = useState<File | null>(null);
    const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

    const [allowQuoteEdits, setAllowQuoteEdits] = useState(requisition.rfqSettings?.allowQuoteEdits ?? true);
    const [experienceDocumentRequired, setExperienceDocumentRequired] = useState(requisition.rfqSettings?.experienceDocumentRequired ?? false);
    const [termsAndConditions, setTermsAndConditions] = useState<string[]>(
        Array.isArray((requisition.rfqSettings as any)?.termsAndConditions)
            ? (requisition.rfqSettings as any).termsAndConditions
            : ((requisition.rfqSettings as any)?.termsAndConditions
                ? String((requisition.rfqSettings as any).termsAndConditions)
                    .split('\n')
                    .map(t => t.trim())
                    .filter(Boolean)
                : [])
    );
    const [procurementMethod, setProcurementMethod] = useState<string>(
        requisition.procurementMethod ?? (requisition.isOpenTender ? 'OpenTender' : ((requisition.rfqSettings && (requisition.rfqSettings as any).method) || 'RFQ'))
    );
    const [vendorInstructionsHtml, setVendorInstructionsHtml] = useState<string>(
        String(((requisition.rfqSettings as any)?.vendorInstructionsHtml) || '')
    );
    const [showInstructionsPreview, setShowInstructionsPreview] = useState(false);
    const { user, token } = useAuth();
    const { toast } = useToast();

    const isSent = requisition.status === 'Accepting_Quotes' || requisition.status === 'Scoring_In_Progress' || requisition.status === 'Scoring_Complete';


    useEffect(() => {
        if (requisition.deadline) {
            setDeadlineDate(new Date(requisition.deadline));
            setDeadlineTime(format(new Date(requisition.deadline), 'HH:mm'));
        } else {
            setDeadlineDate(undefined);
            setDeadlineTime('17:00');
        }
        setCpoAmount(requisition.cpoAmount);
        setAllowQuoteEdits(requisition.rfqSettings?.allowQuoteEdits ?? true);
        setExperienceDocumentRequired(requisition.rfqSettings?.experienceDocumentRequired ?? true);
        const existingTerms = (requisition.rfqSettings as any)?.termsAndConditions;
        if (Array.isArray(existingTerms)) {
            setTermsAndConditions(existingTerms.map((t: any) => String(t).trim()).filter(Boolean));
        } else if (existingTerms) {
            setTermsAndConditions(
                String(existingTerms)
                    .split('\n')
                    .map(t => t.trim())
                    .filter(Boolean)
            );
        } else {
            setTermsAndConditions([]);
        }
        setProcurementMethod(
            requisition.procurementMethod ??
            (requisition.isOpenTender
                ? 'OpenTender'
                : ((requisition.rfqSettings && (requisition.rfqSettings as any).method) || 'RFQ'))
        );
        setVendorInstructionsHtml(String(((requisition.rfqSettings as any)?.vendorInstructionsHtml) || ''));
    }, [requisition]);

    const deadline = useMemo(() => {
        if (!deadlineDate || !deadlineTime) return undefined;
        const [hours, minutes] = deadlineTime.split(':').map(Number);
        return setMinutes(setHours(deadlineDate, hours), minutes);
    }, [deadlineDate, deadlineTime]);


    const handleSendRFQ = async () => {
        if (!user || !deadline || !token) return;

        if (procurementMethod !== 'RFQ' && procurementMethod !== 'OpenTender') {
            toast({ title: 'Coming Soon', description: `${procurementMethod} procurement method is coming soon. Only RFQ and Open Tender are supported currently.` });
            return;
        }

        // If this requisition was approved as Open Tender, enforce it and ensure announcement period ended
        if (requisition.isOpenTender) {
            if (procurementMethod !== 'OpenTender') {
                toast({ variant: 'destructive', title: 'Invalid Procurement Method', description: 'This requisition was approved as Open Tender; procurement method must remain Open Tender.' });
                return;
            }
            if (!requisition.announcementEndDate) {
                toast({ variant: 'destructive', title: 'Missing Announcement Date', description: 'This requisition is Open Tender but has no public announcement end date.' });
                return;
            }
            if (isBefore(new Date(), new Date(requisition.announcementEndDate))) {
                toast({ variant: 'destructive', title: 'Public Announcement Active', description: 'The public announcement period has not ended. You cannot send RFQ until after the announcement end date/time.' });
                return;
            }
        }

        if (isBefore(deadline, new Date())) {
            toast({
                variant: 'destructive',
                title: 'Invalid Deadline',
                description: 'The quotation submission deadline must be in the future.',
            });
            return;
        }

        if (requisition.scoringDeadline && !isBefore(deadline, new Date(requisition.scoringDeadline))) {
            toast({
                variant: 'destructive',
                title: 'Invalid Deadline',
                description: 'The quotation submission deadline must be earlier than the committee scoring deadline.',
            });
            return;
        }

        if (distributionType === 'select' && selectedVendors.length === 0) {
            toast({ variant: 'destructive', title: 'Error', description: 'Please select at least one vendor.' });
            return;
        }

        setSubmitting(true);
        try {
            let rfqDocumentUrl: string | undefined;
            if (rfqFile) {
                const form = new FormData();
                form.append('file', rfqFile);
                form.append('directory', 'rfq');
                const uploadResponse = await fetch('/api/upload', { method: 'POST', body: form });
                const uploadResult = await uploadResponse.json();
                if (!uploadResponse.ok) throw new Error(uploadResult.error || 'Failed to upload RFQ document.');
                rfqDocumentUrl = uploadResult.path;
            }
            const response = await fetch(`/api/requisitions/${requisition.id}/send-rfq`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    userId: user.id,
                    vendorIds: distributionType === 'all' ? [] : selectedVendors,
                    deadline,
                    cpoAmount,
                    rfqSettings: {
                        allowQuoteEdits,
                        experienceDocumentRequired,
                        method: procurementMethod,
                        rfqDocumentUrl,
                        termsAndConditions: termsAndConditions,
                        vendorInstructionsHtml: sanitizeHtml(vendorInstructionsHtml || ''),
                        vendorInstructionsText: htmlToPlainText(vendorInstructionsHtml || ''),
                    },
                    procurementMethod
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to send RFQ.');
            }

            toast({ title: 'RFQ Sent!', description: 'The requisition is now open for quotations from the selected vendors.' });
            onRfqSent();
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error instanceof Error ? error.message : 'An unknown error occurred.',
            });
        } finally {
            setSubmitting(false);
        }
    }


    const filteredVendors = useMemo(() => {
        const verifiedVendors = Array.isArray(vendors) ? vendors.filter(v => v.kycStatus === 'Verified') : [];
        if (!vendorSearch) {
            return verifiedVendors;
        }
        const lowercasedSearch = vendorSearch.toLowerCase();
        return verifiedVendors.filter(vendor =>
            vendor.name.toLowerCase().includes(lowercasedSearch) ||
            vendor.email.toLowerCase().includes(lowercasedSearch) ||
            vendor.contactPerson.toLowerCase().includes(lowercasedSearch)
        );
    }, [vendors, vendorSearch]);

    const canTakeAction = !isSent && isAuthorized;

    return (
        <Card className={cn(isSent && "bg-muted/30")}>
            <CardHeader>
                <div className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>RFQ Distribution</CardTitle>
                        <CardDescription>
                            {isSent
                                ? "The RFQ has been distributed to vendors."
                                : "Send the Request for Quotation to vendors to begin receiving bids."
                            }
                        </CardDescription>
                    </div>
                </div>
                <div className="space-y-2">
                    <Label>Procurement Method</Label>
                    <select value={procurementMethod} onChange={(e) => setProcurementMethod(e.target.value)} disabled={!canTakeAction} className="w-full border rounded px-2 py-1">
                        <option value="RFQ">RFQ (Request for Quotation)</option>
                        <option value="RFP">RFP (Request for Proposal) — Coming Soon</option>
                        <option value="OpenTender">Open Tender</option>
                        <option value="RestrictedTender">Restricted Tender — Coming Soon</option>
                        <option value="DirectProcurement">Direct Procurement — Coming Soon</option>
                        <option value="TwoStage">Two-Stage Bidding — Coming Soon</option>
                    </select>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <Accordion type="single" collapsible defaultValue="vendor-instructions">
                    <AccordionItem value="vendor-instructions">
                        <AccordionTrigger>
                            <span className="text-sm font-medium">Vendor Instructions</span>
                        </AccordionTrigger>
                        <AccordionContent>
                            <div className="space-y-3 mt-2">
                                <RichTextEditor
                                    value={vendorInstructionsHtml}
                                    onChange={setVendorInstructionsHtml}
                                    readOnly={!canTakeAction}
                                    placeholder="Provide clear submission instructions, required documents, and contact info."
                                    maxChars={20000}
                                />
                                <div className="flex items-center gap-2">
                                    <Button type="button" variant="outline" onClick={() => setShowInstructionsPreview(!showInstructionsPreview)}>
                                        {showInstructionsPreview ? 'Hide Preview' : 'Preview as Vendor'}
                                    </Button>
                                    <p className="text-xs text-muted-foreground">Formatting is preserved for vendors.</p>
                                </div>
                                {showInstructionsPreview && (
                                    <div className="border rounded-md p-3 bg-muted/30">
                                        <HtmlRenderer html={vendorInstructionsHtml} />
                                    </div>
                                )}
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
                {!isAuthorized && !isSent && (
                    <Alert variant="default" className="border-amber-500/50">
                        <AlertCircle className="h-4 w-4 text-amber-600" />
                        <AlertTitle>Read-Only Mode</AlertTitle>
                        <AlertDescription>
                            You do not have permission to send RFQs based on system settings.
                        </AlertDescription>
                    </Alert>
                )}
                <div className="space-y-2">
                    <Label>Quotation Submission Deadline</Label>
                    <div className="flex gap-2">
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant={"outline"}
                                    disabled={!canTakeAction}
                                    className={cn(
                                        "w-full justify-start text-left font-normal",
                                        !deadlineDate && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {deadlineDate ? format(deadlineDate, "PPP") : <span>Pick a date</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar
                                    mode="single"
                                    selected={deadlineDate}
                                    onSelect={setDeadlineDate}
                                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0)) || !canTakeAction}
                                    initialFocus
                                />
                            </PopoverContent>
                        </Popover>
                        <Input
                            type="time"
                            className="w-32"
                            value={deadlineTime}
                            onChange={(e) => setDeadlineTime(e.target.value)}
                            disabled={!canTakeAction}
                        />
                    </div>
                </div>
                <div className="space-y-2">
                    <Label>Distribution Type</Label>
                    <Select value={distributionType} onValueChange={(v) => setDistributionType(v as any)} disabled={!canTakeAction}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Send to all verified vendors</SelectItem>
                            <SelectItem value="select">Send to selected vendors</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label>RFQ Attachment (optional)</Label>
                    {!rfqFile ? (
                        <input
                            type="file"
                            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.txt"
                            onChange={(e) => {
                                const f = e.target.files?.[0] || null;
                                if (!f) return setRfqFile(null);
                                if (f.size > MAX_FILE_BYTES) {
                                    toast({ variant: 'destructive', title: 'File too large', description: 'Maximum allowed size is 25 MB.' });
                                    return;
                                }
                                setRfqFile(f);
                            }}
                            disabled={!canTakeAction}
                        />
                    ) : (
                        <div className="flex items-center justify-between gap-4 p-2 border rounded-md bg-muted/50">
                            <div className="flex items-center gap-3">
                                <div className="text-sm">
                                    <div className="font-medium">{rfqFile.name}</div>
                                    <div className="text-xs text-muted-foreground">{(rfqFile.size / 1024 / 1024).toFixed(2)} MB</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="cursor-pointer text-sm text-primary underline" aria-label="Change attached file">
                                    <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.txt" className="hidden" onChange={(e) => {
                                        const f = e.target.files?.[0] || null;
                                        if (!f) return;
                                        if (f.size > MAX_FILE_BYTES) {
                                            toast({ variant: 'destructive', title: 'File too large', description: 'Maximum allowed size is 25 MB.' });
                                            return;
                                        }
                                        setRfqFile(f);
                                    }} disabled={!canTakeAction} />
                                    Change
                                </label>
                                <button type="button" className="text-sm text-destructive underline" onClick={() => setRfqFile(null)} aria-label="Remove attached file">Remove</button>
                            </div>
                        </div>
                    )}
                    <p className="text-xs text-muted-foreground">Attach an RFQ document that vendors can read when submitting quotations. Optional. Allowed: PDF, DOCX, XLSX, PNG, JPG, TXT. Max 25 MB.</p>
                </div>

                {distributionType === 'select' && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Select Vendors</CardTitle>
                            <div className="relative mt-2">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search vendors..."
                                    className="pl-8 w-full"
                                    value={vendorSearch}
                                    onChange={(e) => setVendorSearch(e.target.value)}
                                    disabled={!canTakeAction}
                                />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <ScrollArea className="h-60">
                                <div className="space-y-4">
                                    {filteredVendors.map(vendor => (
                                        <div key={vendor.id} className="flex items-start space-x-4 rounded-md border p-4 has-[:checked]:bg-muted">
                                            <Checkbox
                                                id={`vendor-${vendor.id}`}
                                                checked={selectedVendors.includes(vendor.id)}
                                                onCheckedChange={(checked) => {
                                                    setSelectedVendors(prev =>
                                                        checked ? [...prev, vendor.id] : prev.filter(id => id !== vendor.id)
                                                    )
                                                }}
                                                className="mt-1"
                                                disabled={!canTakeAction}
                                            />
                                            <div className="flex items-start gap-4 flex-1">
                                                <Avatar>
                                                    <AvatarImage src={`https://picsum.photos/seed/${vendor.id}/40/40`} data-ai-hint="logo" />
                                                    <AvatarFallback>{vendor.name.charAt(0)}</AvatarFallback>
                                                </Avatar>
                                                <div className="grid gap-1">
                                                    <Label htmlFor={`vendor-${vendor.id}`} className="font-semibold cursor-pointer">
                                                        {vendor.name}
                                                    </Label>
                                                    <p className="text-xs text-muted-foreground">{vendor.email}</p>
                                                    <p className="text-xs text-muted-foreground">Contact: {vendor.contactPerson}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {filteredVendors.length === 0 && (
                                        <div className="text-center text-muted-foreground py-10">
                                            No vendors found matching your search.
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                )}

                <div className="space-y-2">
                    <Label htmlFor="cpoAmount">CPO Amount (ETB)</Label>
                    <div className="relative">
                        <Landmark className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            id="cpoAmount"
                            type="number"
                            placeholder="Enter required CPO amount"
                            className="pl-10"
                            value={cpoAmount || ''}
                            onChange={(e) => setCpoAmount(Number(e.target.value))}
                            disabled={!canTakeAction}
                        />
                    </div>
                    <p className="text-xs text-muted-foreground">Optional. If set, vendors must submit a CPO of this amount to qualify.</p>
                </div>
                <Accordion type="single" collapsible defaultValue="terms">
                    <AccordionItem value="terms">
                        <AccordionTrigger>
                            <span className="text-sm font-medium">Terms and Conditions</span>
                        </AccordionTrigger>
                        <AccordionContent>
                            <div className="space-y-2 mt-2">
                                <div className="space-y-2">
                                    {termsAndConditions.length > 0 && (
                                        <div className="space-y-1">
                                            {termsAndConditions.map((term, index) => (
                                                <div key={index} className="flex items-start gap-2">
                                                    <span className="mt-1 text-xs text-muted-foreground">{index + 1}.</span>
                                                    <Input
                                                        value={term}
                                                        onChange={(e) => {
                                                            const next = [...termsAndConditions];
                                                            next[index] = e.target.value;
                                                            setTermsAndConditions(next.filter(t => t.trim().length > 0));
                                                        }}
                                                        disabled={!canTakeAction}
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => {
                                                            const next = termsAndConditions.filter((_, i) => i !== index);
                                                            setTermsAndConditions(next);
                                                        }}
                                                        disabled={!canTakeAction}
                                                    >
                                                        Remove
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setTermsAndConditions([...termsAndConditions, ''])}
                                        disabled={!canTakeAction}
                                    >
                                        Add Term
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Optional. Add one term per input. Vendors will see each term separately and must accept all of them when submitting their quotations.
                                </p>
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
                <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="allow-edits">Allow Quote Edits</Label>
                            <Switch
                                id="allow-edits"
                                checked={allowQuoteEdits}
                                onCheckedChange={setAllowQuoteEdits}
                                disabled={!canTakeAction}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">If enabled, vendors can edit their submitted quotes until the deadline passes.</p>
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="experience-doc">Require Experience Document</Label>
                            <Switch
                                id="experience-doc"
                                checked={experienceDocumentRequired}
                                onCheckedChange={setExperienceDocumentRequired}
                                disabled={!canTakeAction}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">If enabled, vendors must upload a document detailing their relevant experience.</p>
                    </div>
                </div>
            </CardContent>
            <CardFooter className="flex flex-wrap items-center justify-between gap-2 pt-4">
                <div className="flex items-center gap-4">
                    <Button onClick={handleSendRFQ} disabled={isSubmitting || !deadline || !isAuthorized || isSent}>
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                        Send RFQ
                    </Button>
                    {isSent ? (
                        <Badge variant="default" className="gap-2">
                            <CheckCircle className="h-4 w-4" />
                            RFQ Distributed on {format(new Date(requisition.updatedAt), 'PP')}
                        </Badge>
                    ) : (
                        !deadline && (
                            <p className="text-xs text-muted-foreground">A quotation deadline must be set.</p>
                        )
                    )}
                </div>
            </CardFooter>
        </Card>
    );
}

const ManageRFQ = ({
    requisition,
    onSuccess,
    isAuthorized
}: {
    requisition: PurchaseRequisition,
    onSuccess: () => void,
    isAuthorized: boolean,
}) => {
    const [actionDialog, setActionDialog] = useState<{ isOpen: boolean, type: 'update' | 'cancel' | 'restart' | 'amend' }>({ isOpen: false, type: 'update' });
    const canManageRfq = isAuthorized && requisition.status === 'Accepting_Quotes' && !isPast(new Date(requisition.deadline!));

    if (!canManageRfq) return null;

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>Manage Active RFQ</CardTitle>
                    <CardDescription>Update the deadline or cancel the RFQ for this requisition.</CardDescription>
                </CardHeader>
                <CardFooter className="flex gap-2">
                    <Button variant="outline" onClick={() => setActionDialog({ isOpen: true, type: 'update' })}><Settings2 className="mr-2" /> Update RFQ</Button>
                    <Button variant="destructive" onClick={() => setActionDialog({ isOpen: true, type: 'cancel' })}><Ban className="mr-2" /> Amend RFQ</Button>
                </CardFooter>
            </Card>
            <RFQActionDialog
                action={actionDialog.type}
                requisition={requisition}
                isOpen={actionDialog.isOpen}
                onClose={() => setActionDialog({ isOpen: false, type: 'update' })}
                onSuccess={onSuccess}
            />
        </>
    )
}

const WorkflowStepper = ({ step }: { step: 'rfq' | 'committee' | 'award' | 'finalize' | 'completed' }) => {
    const getStepClass = (currentStep: string, targetStep: string) => {
        const stepOrder = ['rfq', 'committee', 'award', 'finalize', 'completed'];
        const currentIndex = stepOrder.indexOf(currentStep);
        const targetIndex = stepOrder.indexOf(targetStep);
        if (currentIndex > targetIndex) return 'completed';
        if (currentIndex === targetIndex) return 'active';
        return 'inactive';
    };

    const rfqState = getStepClass(step, 'rfq');
    const committeeState = getStepClass(step, 'committee');
    const awardState = getStepClass(step, 'award');
    const finalizeState = getStepClass(step, 'finalize');

    const stateClasses = {
        active: 'bg-primary text-primary-foreground border-primary',
        completed: 'bg-green-500 text-white border-green-500',
        inactive: 'border-border text-muted-foreground'
    };

    const textClasses = {
        active: 'text-primary',
        completed: 'text-muted-foreground',
        inactive: 'text-muted-foreground'
    }

    return (
        <div className="flex items-center justify-center space-x-1 sm:space-x-2 flex-wrap">
            <div className="flex items-center gap-2">
                <div className={cn("flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold", stateClasses[rfqState])}>
                    {rfqState === 'completed' ? <Check className="h-4 w-4" /> : '1'}
                </div>
                <span className={cn("font-medium", textClasses[rfqState])}>Send RFQ</span>
            </div>
            <div className={cn("h-px flex-1 bg-border transition-colors", (committeeState === 'active' || committeeState === 'completed') && "bg-primary")}></div>

            <div className="flex items-center gap-2">
                <div className={cn("flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold", stateClasses[committeeState])}>
                    {committeeState === 'completed' ? <Check className="h-4 w-4" /> : '2'}
                </div>
                <span className={cn("font-medium", textClasses[committeeState])}>Assign Committee &amp; Score</span>
            </div>
            <div className={cn("h-px flex-1 bg-border transition-colors", (awardState === 'active' || awardState === 'completed') && "bg-primary")}></div>

            <div className="flex items-center gap-2">
                <div className={cn("flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold", stateClasses[awardState])}>
                    {awardState === 'completed' ? <Check className="h-4 w-4" /> : '3'}
                </div>
                <span className={cn("font-medium", textClasses[awardState])}>Award</span>
            </div>
            <div className={cn("h-px flex-1 bg-border transition-colors", (finalizeState === 'active' || finalizeState === 'completed') && "bg-primary")}></div>
            <div className="flex items-center gap-2">
                <div className={cn("flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold", stateClasses[finalizeState])}>
                    {finalizeState === 'completed' ? <Check className="h-4 w-4" /> : '4'}
                </div>
                <span className={cn("font-medium", textClasses[finalizeState])}>Finalize</span>
            </div>
        </div>
    );
};

const scoreFormSchema = z.object({
    committeeComment: z.string().optional(),
    checks: z.array(z.object({
        quoteItemId: z.string(),
        comply: z.boolean(),
        comment: z.string().optional(),
    }))
});
type ScoreFormValues = z.infer<typeof scoreFormSchema>;


const ScoringItemCard = ({ itemIndex, control, quoteItem, originalItem, requisition, hidePrices, existingScore }: {
    itemIndex: number;
    control: Control<ScoreFormValues>;
    quoteItem: QuoteItem;
    originalItem?: PurchaseRequisition['items'][0];
    requisition: PurchaseRequisition;
    hidePrices: boolean;
    existingScore?: CommitteeScoreSet;
}) => {
    const form = useFormContext<ScoreFormValues>();

    return (
        <Card className="bg-muted/30">
            <CardHeader>
                <CardTitle>{quoteItem.name}</CardTitle>
                <CardDescription>
                    Vendor's proposal for requested item: "{originalItem?.name}" (Qty: {quoteItem.quantity})
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                    {quoteItem.imageUrl && (
                        <Dialog>
                            <DialogTrigger asChild>
                                <div className="md:col-span-2 relative aspect-video cursor-pointer hover:opacity-80 transition-opacity">
                                    <Image src={quoteItem.imageUrl} alt={quoteItem.name} fill style={{ objectFit: "contain" }} className="rounded-md" />
                                </div>
                            </DialogTrigger>
                            <DialogContent className="max-w-4xl h-[80vh]">
                                <DialogHeader>
                                    <DialogTitle>{quoteItem.name}</DialogTitle>
                                </DialogHeader>
                                <div className="relative w-full h-full">
                                    <Image src={quoteItem.imageUrl} alt={quoteItem.name} fill style={{ objectFit: "contain" }} />
                                </div>
                            </DialogContent>
                        </Dialog>
                    )}
                    <div>
                        <p className="font-semibold text-muted-foreground">Brand/Model Details</p>
                        <p>{quoteItem.brandDetails || 'Not Provided'}</p>
                    </div>
                    <div>
                        <p className="font-semibold text-muted-foreground">Quoted Delivery Time</p>
                        <p>{quoteItem.leadTimeDays} days</p>
                    </div>
                    {!hidePrices &&
                        <div>
                            <p className="font-semibold text-muted-foreground">Quoted Unit Price</p>
                            <p className="font-mono">{quoteItem.unitPrice.toFixed(2)} ETB</p>
                        </div>
                    }
                </div>

                <Separator />

                <div className="space-y-3">
                    <div className="flex items-center gap-4">
                        <Controller
                            control={form.control}
                            name={`checks.${itemIndex}.comply` as any}
                            render={({ field }) => (
                                <div className="flex items-center gap-4">
                                    <label className="flex items-center gap-2"><input type="radio" checked={field.value === true} onChange={() => field.onChange(true)} /> <span>Comply</span></label>
                                    <label className="flex items-center gap-2"><input type="radio" checked={field.value === false} onChange={() => field.onChange(false)} /> <span>Non‑comply</span></label>
                                </div>
                            )}
                        />
                        {!hidePrices && typeof quoteItem.unitPrice === 'number' && (
                            <Badge variant="outline" className="font-mono">{quoteItem.unitPrice.toFixed(2)} ETB</Badge>
                        )}
                    </div>

                    <Controller
                        control={form.control}
                        name={`checks.${itemIndex}.comment` as any}
                        render={({ field }) => (
                            <Input {...field} placeholder="Optional comment (explain non‑compliance)" />
                        )}
                    />
                </div>
            </CardContent>
        </Card>
    );
};


const ScoringDialog = ({
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
    const { token } = useAuth();

    const form = useForm<ScoreFormValues>({
        resolver: zodResolver(scoreFormSchema),
        defaultValues: {},
    });

    const { control: formControl } = form;
    const { fields: checkFields } = useFieldArray({ control: formControl, name: "checks" });

    const existingScore = useMemo(() => {
        return quote.scores?.find(s => s.scorerId === user.id) || quote.complianceSets?.find((c: any) => c.scorerId === user.id);
    }, [quote, user.id]);

    useEffect(() => {
        if (quote && requisition && user) {
            const initialChecks = quote.items.map(item => {
                const legacy = existingScore?.itemScores?.find((i: any) => i.quoteItemId === item.id);
                const compliance = (existingScore as any)?.itemCompliances?.find((i: any) => i.quoteItemId === item.id);
                const existingItemScore = legacy || compliance;
                const comply = legacy ? (legacy.finalScore === 1) : (compliance ? Boolean(compliance.comply) : true);
                const comment = legacy?.scores?.map((s: any) => s.comment).filter(Boolean).join('; ') || compliance?.comment || '';
                return {
                    quoteItemId: item.id,
                    comply,
                    comment
                };
            });
            form.reset({
                committeeComment: existingScore?.committeeComment || "",
                checks: initialChecks,
            });
        }
    }, [quote, requisition, user, form, existingScore]);


    const onSubmit = async (values: ScoreFormValues) => {
        if (!token) return;
        setSubmitting(true);
        try {
            const response = await fetch(`/api/quotations/${quote.id}/score`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ checks: values.checks, committeeComment: values.committeeComment, userId: user.id }),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to submit compliance checks.');
            }

            toast({ title: "Checks Submitted", description: "Your compliance evaluation has been recorded." });
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

    const onInvalid = () => {
        toast({
            variant: 'destructive',
            title: 'Validation Error',
            description: 'Please correct the errors before submitting your scores.',
        });
    }

    if (!requisition.evaluationCriteria) return null;

    const findQuestionText = (questionId: string) => requisition.customQuestions?.find(q => q.id === questionId)?.questionText || "Unknown Question";


    if (!existingScore && isScoringDeadlinePassed) {
        return (
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Compliance Deadline Passed</DialogTitle>
                </DialogHeader>
                <div className="py-4 text-center">
                    <TimerOff className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">The deadline for scoring this quotation has passed.</p>
                </div>
                <DialogFooter><DialogClose asChild><Button variant="outline">Close</Button></DialogClose></DialogFooter>
            </DialogContent>
        );
    }

    return (
        <DialogContent className="max-w-4xl flex flex-col h-[95vh]">
            <DialogHeader>
                <DialogTitle>Check Specification Compliance — {quote.vendorName}</DialogTitle>
                <DialogDescription>Mark each quoted item as Comply or Non‑comply against the requester's specifications.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="flex-1 min-h-0 flex flex-col">
                    <ScrollArea className="flex-1 pr-4 -mr-4">
                        <div className="space-y-6">
                            <div className="flex gap-2">
                                {quote.bidDocumentUrl && (
                                    <Button asChild variant="outline" size="sm" className="w-full">
                                        <a href={quote.bidDocumentUrl} target="_blank" rel="noopener noreferrer">
                                            <FileText className="mr-2 h-4 w-4" /> View Bid Document
                                        </a>
                                    </Button>
                                )}
                                {quote.experienceDocumentUrl && (
                                    <Button asChild variant="outline" size="sm" className="w-full">
                                        <a href={quote.experienceDocumentUrl} target="_blank" rel="noopener noreferrer">
                                            <UserCog className="mr-2 h-4 w-4" /> View Experience Document
                                        </a>
                                    </Button>
                                )}
                            </div>
                            {quote.answers && quote.answers.length > 0 && (
                                <Card className="bg-muted/30">
                                    <CardHeader>
                                        <CardTitle className="text-lg flex items-center gap-2"><MessageSquare />Vendor's Answers</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3 text-sm">
                                        {quote.answers.map(answer => (
                                            <div key={answer.questionId}>
                                                <p className="font-semibold">{findQuestionText(answer.questionId)}</p>
                                                <p className="text-muted-foreground pl-2 border-l-2 ml-2 mt-1">{answer.answer}</p>
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>
                            )}
                            <Accordion type="single" collapsible className="space-y-4">
                                {checkFields.map((field, itemIndex) => {
                                    const itemScoreData = form.getValues().checks[itemIndex];
                                    if (!itemScoreData) return null;

                                    const quoteItem = quote.items.find(item => item.id === itemScoreData.quoteItemId);
                                    if (!quoteItem) return null;

                                    const originalItem = requisition.items.find(i => i.id === quoteItem.requisitionItemId);

                                    return (
                                        <AccordionItem key={field.id} value={`item-${itemIndex}`} className="border rounded-lg bg-muted/20">
                                            <AccordionTrigger className="px-4 py-3">
                                                <div className="flex items-center gap-2 text-left">
                                                    <h4 className="font-semibold">{quoteItem.name}</h4>
                                                    <p className="text-xs text-muted-foreground">(for: {originalItem?.name})</p>
                                                </div>
                                            </AccordionTrigger>
                                            <AccordionContent className="p-4 border-t">
                                                <ScoringItemCard
                                                    itemIndex={itemIndex}
                                                    control={form.control}
                                                    quoteItem={quoteItem}
                                                    originalItem={originalItem}
                                                    requisition={requisition}
                                                    hidePrices={hidePrices}
                                                    existingScore={existingScore}
                                                />
                                            </AccordionContent>
                                        </AccordionItem>
                                    );
                                })}
                            </Accordion>


                            <FormField
                                control={form.control}
                                name="committeeComment"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-lg font-semibold">Overall Comment</FormLabel>
                                        <FormControl>
                                            <Textarea placeholder="Provide an overall summary or justification for your scores..." {...field} rows={4} disabled={!!existingScore} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                    </ScrollArea>

                    <DialogFooter className="pt-4 mt-4 border-t">
                        {existingScore ? (
                            <DialogClose asChild><Button>Close</Button></DialogClose>
                        ) : (
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button type="button">
                                        Submit Compliance Check
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Confirm Your Score</AlertDialogTitle>
                                        <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Go Back & Edit</AlertDialogCancel>
                                        <AlertDialogAction onClick={form.handleSubmit(onSubmit, onInvalid)} disabled={isSubmitting}>
                                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            Confirm & Submit
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

const ScoringProgressTracker = ({
    requisition,
    quotations,
    allUsers,
    onSuccess,
    onCommitteeUpdate,
    isFinalizing,
    isAuthorized
}: {
    requisition: PurchaseRequisition;
    quotations: Quotation[];
    allUsers: User[];
    onSuccess: () => void;
    onCommitteeUpdate: (open: boolean) => void;
    isFinalizing: boolean;
    isAuthorized: boolean
}) => {
    const [isExtendDialogOpen, setExtendDialogOpen] = useState(false);
    const [isReportDialogOpen, setReportDialogOpen] = useState(false);
    const [selectedMember, setSelectedMember] = useState<User | null>(null);
    const [isSingleAwardCenterOpen, setSingleAwardCenterOpen] = useState(false);
    const [isBestItemAwardCenterOpen, setBestItemAwardCenterOpen] = useState(false);

    const { toast } = useToast();
    const isScoringDeadlinePassed = requisition.scoringDeadline && isPast(new Date(requisition.scoringDeadline));

    const assignedCommitteeMembers = useMemo(() => {
        const allIds = [
            ...(requisition.financialCommitteeMemberIds || []),
            ...(requisition.technicalCommitteeMemberIds || [])
        ];
        const uniqueIds = [...new Set(allIds)];
        return allUsers.filter(u => uniqueIds.includes(u.id));
    }, [allUsers, requisition.financialCommitteeMemberIds, requisition.technicalCommitteeMemberIds]);

    const scoringStatus = useMemo(() => {
        return assignedCommitteeMembers.map(member => {
            const assignment = member.committeeAssignments?.find(a => a.requisitionId === requisition.id);
            // Only mark as submitted if scoresSubmitted is true (i.e., finalized all checks)
            const hasSubmittedFinalScores = !!assignment?.scoresSubmitted;

            let submissionDate: Date | null = null;
            if (hasSubmittedFinalScores) {
                const latestScore = quotations
                    .flatMap(q => q.scores || [])
                    .filter(s => s.scorerId === member.id)
                    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())[0];

                if (latestScore) {
                    submissionDate = new Date(latestScore.submittedAt);
                }
            }

            const isOverdue = isScoringDeadlinePassed && !hasSubmittedFinalScores;

            return {
                ...member,
                hasSubmittedFinalScores,
                isOverdue,
                submittedAt: submissionDate,
            };
        }).sort((a, b) => {
            if (a.submittedAt && b.submittedAt) return a.submittedAt.getTime() - b.submittedAt.getTime();
            if (a.submittedAt) return -1;
            if (b.submittedAt) return 1;
            return 0;
        });
    }, [assignedCommitteeMembers, quotations, isScoringDeadlinePassed, requisition.id]);

    const handleFinalizeScores = useCallback((awardStrategy: 'all' | 'item', awards: any, awardResponseDeadline?: Date, minuteDocumentUrl?: string, minuteJustification?: string) => {
        // This function will be called from the dialogs to trigger the API call in the parent.
        // It's passed down from the main page component.
    }, []);

    return (
        <Card className="mt-6">
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><GanttChart /> Compliance Progress</CardTitle>
                <CardDescription>Track the committee's compliance-check progress. The award can be finalized once all members have completed compliance checks for all quotations.</CardDescription>
            </CardHeader>
            <CardContent>
                <ul className="space-y-3">
                    {scoringStatus.map(member => (
                        <li key={member.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 rounded-md border">
                            <div className="flex items-center gap-3">
                                <Avatar>
                                    <AvatarImage src={`https://picsum.photos/seed/${member.id}/40/40`} />
                                    <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <p className="font-semibold">{member.name}</p>
                                    <p className="text-xs text-muted-foreground">{member.email}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 mt-2 sm:mt-0 w-full sm:w-auto">
                                {member.hasSubmittedFinalScores ? (
                                    <div className="text-right flex-1">
                                        <Badge variant="default" className="bg-green-600"><Check className="mr-1 h-3 w-3" /> Submitted</Badge>
                                        {member.submittedAt && (
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {formatDistanceToNow(new Date(member.submittedAt), { addSuffix: true })}
                                            </p>
                                        )}
                                    </div>
                                ) : member.isOverdue ? (
                                    <>
                                        <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" />Overdue</Badge>
                                        <Button size="sm" variant="secondary" onClick={() => { setSelectedMember(member); setExtendDialogOpen(true); }}>Extend</Button>
                                        <Button size="sm" variant="secondary" onClick={() => onCommitteeUpdate(true)}>Replace</Button>
                                        <Button size="sm" variant="outline" onClick={() => { setSelectedMember(member); setReportDialogOpen(true); }}>Report</Button>
                                    </>
                                ) : (
                                    <Badge variant="secondary">Pending</Badge>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            </CardContent>
            {selectedMember && (
                <>
                    <ExtendDeadlineDialog
                        isOpen={isExtendDialogOpen}
                        onClose={() => { setExtendDialogOpen(false); setSelectedMember(null); }}
                        member={selectedMember}
                        requisition={requisition}
                        onSuccess={onSuccess}
                    />
                    <OverdueReportDialog
                        isOpen={isReportDialogOpen}
                        onClose={() => { setReportDialogOpen(false); setSelectedMember(null); }}
                        member={selectedMember}
                    />
                </>
            )}
        </Card>
    );
};

const CumulativeScoringReportDialog = ({ requisition, quotations, isOpen, onClose }: { requisition: PurchaseRequisition; quotations: Quotation[], isOpen: boolean, onClose: () => void }) => {
    const { toast } = useToast();
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const printRef = useRef<HTMLDivElement>(null);
    const awardStrategy = (requisition.rfqSettings as any)?.awardStrategy || 'all';
    const { user } = useAuth();

    // replicate hidePrices logic for this dialog scope
    const isAssignedCompliance = Boolean(user && ((requisition.complianceCommitteeMemberIds || []).includes(user.id) || (user.committeeAssignments || []).some((a: any) => a.requisitionId === requisition.id && a.type === 'compliance')));
    const assignment = (user && (user.committeeAssignments || []).find((a: any) => a.requisitionId === requisition.id)) || undefined;
    const scoresSubmitted = Boolean(assignment?.scoresSubmitted);
    const hidePrices = isAssignedCompliance && !scoresSubmitted && !(requisition.rfqSettings?.technicalEvaluatorSeesPrices ?? false);

    const getCriterionName = (criterionId: string | null, criteria?: EvaluationCriterion[]) => {
        if (!criterionId || !criteria) return 'Unknown Criterion';
        const criterion = criteria.find(c => c.id === criterionId);
        return criterion?.name || 'Unknown Criterion';
    }

    const handleGeneratePdf = async () => {
        const input = printRef.current;
        if (!input) return;

        setIsGeneratingPdf(true);
        toast({ title: "Generating PDF...", description: "This may take a moment." });

        try {
            const canvas = await html2canvas(input, { scale: 2, useCORS: true, backgroundColor: null });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const imgWidth = canvas.width;
            const imgHeight = canvas.height;
            const ratio = imgWidth / imgHeight;
            let width = pdfWidth - 20;
            let height = width / ratio;

            if (height > pdfHeight - 20) {
                height = pdfHeight - 20;
                width = height * ratio;
            }

            const x = (pdfWidth - width) / 2;
            const y = 10;
            pdf.addImage(imgData, 'PNG', x, y, width, height);
            pdf.save(`Scoring-Report-${requisition.id}.pdf`);
            toast({ title: "PDF Generated", description: "Your report has been downloaded." });
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: "PDF Generation Failed", description: "An error occurred while creating the PDF." });
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    const getRankIcon = (rank?: number) => {
        switch (rank) {
            case 1: return <Crown className="h-4 w-4 text-amber-400" />;
            case 2: return <Trophy className="h-4 w-4 text-slate-400" />;
            case 3: return <Medal className="h-4 w-4 text-amber-600" />;
            default: return null;
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-5xl h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Cumulative Scoring Report</DialogTitle>
                    <DialogDescription>
                        This is a detailed, auditable breakdown of all committee scores for requisition {requisition.id}. It explains the award decision based on the '{awardStrategy === 'item' ? 'Best Offer (Per Item)' : 'Award All to Single Vendor'}' strategy.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex-1 overflow-hidden">
                    <ScrollArea className="h-full">
                        <div ref={printRef} className="p-1 space-y-6 bg-background text-foreground print:bg-white print:text-black">
                            <div className="hidden print:block text-center mb-8 pt-4">
                                <Image src="/logo.png" alt="Logo" width={40} height={40} className="mx-auto mb-2" />
                                <h1 className="text-2xl font-bold text-black">Scoring &amp; Award Justification Report</h1>
                                <p className="text-gray-600">{requisition.title}</p>
                                <p className="text-sm text-gray-500">{requisition.id}</p>
                                <p className="text-sm text-gray-500">Report Generated: {format(new Date(), 'PPpp')}</p>
                            </div>

                            {awardStrategy === 'all' ? (
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Overall Vendor Ranking</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <Table>
                                            <TableHeader><TableRow><TableHead>Rank</TableHead><TableHead>Vendor</TableHead><TableHead className="text-right">Total Price</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                                            <TableBody>
                                                {quotations.sort((a, b) => (a.totalPrice || 0) - (b.totalPrice || 0)).map(q => (
                                                    <TableRow key={q.id}>
                                                        <TableCell className="font-bold flex items-center gap-1">{getRankIcon(q.rank)} {q.rank}</TableCell>
                                                        <TableCell>{q.vendorName}</TableCell>
                                                        <TableCell className="text-right font-mono">{hidePrices ? 'Hidden' : (q.totalPrice?.toLocaleString() + ' ETB')}</TableCell>
                                                        <TableCell><Badge variant="outline">{q.status.replace(/_/g, ' ')}</Badge></TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </CardContent>
                                </Card>
                            ) : (
                                <Accordion type="single" collapsible className="w-full" defaultValue="item-awards">
                                    <AccordionItem value="item-awards" className="border-none">
                                        <AccordionTrigger className="text-lg font-semibold">Award Breakdown by Item</AccordionTrigger>
                                        <AccordionContent>
                                            <Card>
                                                <CardContent className="p-0">
                                                    {requisition.items.map(item => {
                                                        const awards = (item.perItemAwardDetails || []).sort((a, b) => a.rank - b.rank);
                                                        return (
                                                            <div key={item.id} className="p-4 border-b last:border-b-0">
                                                                <h4 className="font-semibold">{item.name}</h4>
                                                                <Table>
                                                                    <TableHeader><TableRow><TableHead>Rank</TableHead><TableHead>Vendor</TableHead><TableHead>Proposed Item</TableHead><TableHead className="text-right">Unit Price</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                                                                    <TableBody>
                                                                        {awards.map(award => (
                                                                            <TableRow key={award.quoteItemId}>
                                                                                <TableCell className="font-bold flex items-center gap-1">{getRankIcon(award.rank)} {award.rank}</TableCell>
                                                                                <TableCell>{award.vendorName}</TableCell>
                                                                                <TableCell>{award.proposedItemName}</TableCell>
                                                                                <TableCell className="text-right font-mono">{hidePrices ? 'Hidden' : (award.unitPrice.toFixed(2) + ' ETB')}</TableCell>
                                                                                <TableCell><Badge variant="outline">{award.status.replace(/_/g, ' ')}</Badge></TableCell>
                                                                            </TableRow>
                                                                        ))}
                                                                    </TableBody>
                                                                </Table>
                                                            </div>
                                                        )
                                                    })}
                                                </CardContent>
                                            </Card>
                                        </AccordionContent>
                                    </AccordionItem>
                                </Accordion>
                            )}

                            <Separator className="my-6" />

                            <Accordion type="single" collapsible className="w-full" defaultValue="scoring-report">
                                <AccordionItem value="scoring-report" className="border-none">
                                    <AccordionTrigger className="text-lg font-semibold">Evaluation Committee spec compliance check Report</AccordionTrigger>
                                    <AccordionContent>
                                        <Card>
                                            <CardHeader>
                                                <CardTitle>Compliance Checks</CardTitle>
                                                <CardDescription>Per-quote, per-item compliance results submitted by committee members.</CardDescription>
                                            </CardHeader>
                                            <CardContent className="p-4">
                                                {quotations.map(quote => (
                                                    <div key={quote.id} className="mb-6 border rounded-md p-3">
                                                        <div className="flex items-center justify-between mb-3">
                                                            <div>
                                                                <h4 className="font-semibold">{quote.vendorName}</h4>
                                                                <p className="text-sm text-muted-foreground">Quote ID: {quote.id}</p>
                                                            </div>
                                                            <Badge className="ml-2">{quote.status?.replace(/_/g, ' ')}</Badge>
                                                        </div>
                                                        <Table>
                                                            <TableHeader>
                                                                <TableRow>
                                                                    <TableHead>Item</TableHead>
                                                                    <TableHead>Proposed</TableHead>
                                                                    <TableHead>Committee Member</TableHead>
                                                                    <TableHead>Result</TableHead>
                                                                    <TableHead>Submitted</TableHead>
                                                                    <TableHead>Comment</TableHead>
                                                                </TableRow>
                                                            </TableHeader>
                                                            <TableBody>
                                                                {(() => {
                                                                    const sets: any[] = quote.complianceSets || [];
                                                                    // Rows from each committee member's item compliances
                                                                    const rows: JSX.Element[] = [];

                                                                    sets.forEach(set => {
                                                                        (set.itemCompliances || []).forEach((ic: any) => {
                                                                            const item = quote.items.find((i: any) => i.id === ic.quoteItemId) || { name: 'Unknown' };
                                                                            rows.push(
                                                                                <TableRow key={`${quote.id}-${set.scorerId}-${ic.quoteItemId}`}>
                                                                                    <TableCell>{item.name}</TableCell>
                                                                                    <TableCell>{ic.proposedItemName || item.name}</TableCell>
                                                                                    <TableCell>{set.scorer?.name || 'Unknown'}</TableCell>
                                                                                    <TableCell>
                                                                                        {ic.comply === true ? <Badge variant="outline">Compliant</Badge> : ic.comply === false ? <Badge variant="destructive">Non-compliant</Badge> : <Badge variant="secondary">Not Checked</Badge>}
                                                                                    </TableCell>
                                                                                    <TableCell>{set.submittedAt ? format(new Date(set.submittedAt), 'PPpp') : '—'}</TableCell>
                                                                                    <TableCell className="max-w-xs break-words">{ic.comment || '—'}</TableCell>
                                                                                </TableRow>
                                                                            );
                                                                        });
                                                                    });

                                                                    // Include items that were not checked by any committee member
                                                                    const checkedIds = new Set(sets.flatMap(s => (s.itemCompliances || []).map((ic: any) => ic.quoteItemId)));
                                                                    (quote.items || []).forEach((item: any) => {
                                                                        if (!checkedIds.has(item.id)) {
                                                                            rows.push(
                                                                                <TableRow key={`${quote.id}-notchecked-${item.id}`}>
                                                                                    <TableCell>{item.name}</TableCell>
                                                                                    <TableCell>{item.proposedItemName || item.name}</TableCell>
                                                                                    <TableCell>—</TableCell>
                                                                                    <TableCell><Badge variant="secondary">Not Checked</Badge></TableCell>
                                                                                    <TableCell>—</TableCell>
                                                                                    <TableCell>—</TableCell>
                                                                                </TableRow>
                                                                            );
                                                                        }
                                                                    });

                                                                    return rows.length > 0 ? rows : (
                                                                        <TableRow>
                                                                            <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">No compliance checks recorded for this quote.</TableCell>
                                                                        </TableRow>
                                                                    );
                                                                })()}
                                                            </TableBody>
                                                        </Table>
                                                    </div>
                                                ))}
                                            </CardContent>
                                        </Card>

                                        <Card>
                                            <CardContent className="p-4">
                                                <Accordion type="multiple" className="w-full space-y-4">
                                                    {quotations.sort((a, b) => (a.totalPrice || 0) - (b.totalPrice || 0)).map(quote => (
                                                        <AccordionItem key={quote.id} value={quote.id} className="border rounded-lg">
                                                            <AccordionTrigger className="p-4 hover:no-underline">
                                                                <div className="flex justify-between items-start w-full">
                                                                    <div>
                                                                        <h4 className="font-semibold text-lg">{quote.vendorName}</h4>
                                                                        <p className="text-sm text-muted-foreground pt-1">
                                                                            Final Score: <span className="font-bold text-primary">{quote.finalAverageScore?.toFixed(2)}</span> |
                                                                            Rank: <span className="font-bold">{quote.rank || 'N/A'}</span>
                                                                        </p>
                                                                    </div>
                                                                    <Badge variant={quote.status === 'Awarded' || quote.status === 'Partially_Awarded' || quote.status === 'Accepted' ? 'default' : quote.status === 'Standby' ? 'secondary' : 'destructive'}>{quote.status.replace(/_/g, ' ')}</Badge>
                                                                </div>
                                                            </AccordionTrigger>
                                                            <AccordionContent className="p-4 border-t">
                                                                <div className="space-y-4">
                                                                    {quote.scores && quote.scores.length > 0 ? (
                                                                        quote.scores.map(scoreSet => (
                                                                            <div key={scoreSet.scorerId} className="p-3 border rounded-md break-inside-avoid print:border-gray-200">
                                                                                <div className="flex items-center justify-between mb-3 pb-2 border-b print:border-gray-200">
                                                                                    <div className="flex items-center gap-3">
                                                                                        <Avatar className="h-8 w-8">
                                                                                            <AvatarImage src={`https://picsum.photos/seed/${scoreSet.scorerId}/32/32`} />
                                                                                            <AvatarFallback>{scoreSet.scorer?.name?.charAt(0) || 'U'}</AvatarFallback>
                                                                                        </Avatar>
                                                                                        <span className="font-semibold print:text-black">{scoreSet.scorer?.name || 'Unknown User'}</span>
                                                                                    </div>
                                                                                    <div className="text-right">
                                                                                        <span className="font-bold text-lg text-primary">{scoreSet.finalScore.toFixed(2)}</span>
                                                                                        <p className="text-xs text-muted-foreground mt-1">
                                                                                            Submitted {format(new Date(scoreSet.submittedAt), 'PPpp')}
                                                                                        </p>
                                                                                    </div>
                                                                                </div>
                                                                                <div className="space-y-4">
                                                                                    {scoreSet.itemScores.map(itemScore => {
                                                                                        const scoredQuoteItem = quote.items.find(qi => qi.id === itemScore.quoteItemId);
                                                                                        const hasFinancialScores = (requisition.evaluationCriteria?.financialCriteria?.length ?? 0) > 0;
                                                                                        const hasTechnicalScores = (requisition.evaluationCriteria?.technicalCriteria?.length ?? 0) > 0;

                                                                                        return (
                                                                                            <div key={itemScore.id} className="p-3 bg-muted/30 rounded-md">
                                                                                                <h4 className="font-semibold text-sm mb-2">Item: {scoredQuoteItem?.name || 'Unknown Item'}</h4>
                                                                                                <div className={cn("grid gap-4 print:grid-cols-2", hasFinancialScores && hasTechnicalScores ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1')}>
                                                                                                    {hasFinancialScores && itemScore.scores.some(s => s.type === 'FINANCIAL') && (
                                                                                                        <div>
                                                                                                            <h5 className="font-semibold text-xs mb-2 print:text-gray-800">Financial Scores ({requisition.evaluationCriteria?.financialWeight}%)</h5>
                                                                                                            {itemScore.scores.filter(s => s.type === 'FINANCIAL').map(s => (
                                                                                                                <div key={s.id} className="text-xs p-2 bg-background print:bg-gray-50 rounded-md mb-2">
                                                                                                                    <div className="flex justify-between items-center font-medium">
                                                                                                                        <p>{getCriterionName(s.financialCriterionId ?? null, requisition.evaluationCriteria?.financialCriteria)}</p>
                                                                                                                        <p className="font-bold">{s.score}/100</p>
                                                                                                                    </div>
                                                                                                                    {s.comment && <p className="italic text-muted-foreground print:text-gray-500 mt-1 pl-1 border-l-2 print:border-gray-300">"{s.comment}"</p>}
                                                                                                                </div>
                                                                                                            ))}
                                                                                                        </div>
                                                                                                    )}
                                                                                                    {hasTechnicalScores && itemScore.scores.some(s => s.type === 'TECHNICAL') && (
                                                                                                        <div>
                                                                                                            <h5 className="font-semibold text-xs mb-2 print:text-gray-800">Technical Scores ({requisition.evaluationCriteria?.technicalWeight}%)</h5>
                                                                                                            {itemScore.scores.filter(s => s.type === 'TECHNICAL').map(s => (
                                                                                                                <div key={s.id} className="text-xs p-2 bg-background print:bg-gray-50 rounded-md mb-2">
                                                                                                                    <div className="flex justify-between items-center font-medium">
                                                                                                                        <p>{getCriterionName(s.technicalCriterionId ?? null, requisition.evaluationCriteria?.technicalCriteria)}</p>
                                                                                                                        <p className="font-bold">{s.score}/100</p>
                                                                                                                    </div>
                                                                                                                    {s.comment && <p className="italic text-muted-foreground print:text-gray-500 mt-1 pl-1 border-l-2 print:border-gray-300">"{s.comment}"</p>}
                                                                                                                </div>
                                                                                                            ))}
                                                                                                        </div>
                                                                                                    )}
                                                                                                </div>
                                                                                            </div>
                                                                                        )
                                                                                    })}
                                                                                </div>
                                                                                {scoreSet.committeeComment && <p className="text-sm italic text-muted-foreground print:text-gray-600 mt-3 p-3 bg-muted/50 print:bg-gray-100 rounded-md"><strong>Overall Comment:</strong> "{scoreSet.committeeComment}"</p>}
                                                                            </div>
                                                                        ))
                                                                    ) : <p className="text-sm text-muted-foreground text-center py-8 print:text-gray-500">No scores submitted for this quote.</p>}
                                                                </div>
                                                            </AccordionContent>
                                                        </AccordionItem>
                                                    ))}
                                                </Accordion>
                                            </CardContent>
                                        </Card>
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>
                        </div>
                    </ScrollArea>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Close</Button>
                    <Button onClick={handleGeneratePdf} disabled={isGeneratingPdf}>
                        {isGeneratingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
                        Print / Export PDF
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
const ExtendDeadlineDialog = ({ isOpen, onClose, member, requisition, onSuccess }: { isOpen: boolean, onClose: () => void, member: User, requisition: PurchaseRequisition, onSuccess: () => void }) => {
    const { toast } = useToast();
    const { user } = useAuth();
    const [isSubmitting, setSubmitting] = useState(false);
    const [newDeadline, setNewDeadline] = useState<Date | undefined>();
    const [newDeadlineTime, setNewDeadlineTime] = useState('17:00');

    const finalNewDeadline = useMemo(() => {
        if (!newDeadline) return undefined;
        const [hours, minutes] = newDeadlineTime.split(':').map(Number);
        return setMinutes(setHours(newDeadline, hours), minutes);
    }, [newDeadline, newDeadlineTime]);

    const handleSubmit = async () => {
        if (!user || !finalNewDeadline) return;
        if (isBefore(finalNewDeadline, new Date())) {
            toast({ variant: 'destructive', title: 'Error', description: 'The new deadline must be in the future.' });
            return;
        }

        setSubmitting(true);
        try {
            const response = await fetch(`/api/requisitions/${requisition.id}/extend-scoring-deadline`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, newDeadline: finalNewDeadline })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to extend deadline.');
            }

            toast({ title: 'Success', description: 'Scoring deadline has been extended for all committee members.' });
            onSuccess();
            onClose();

        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error instanceof Error ? error.message : 'An unknown error occurred.',
            });
        } finally {
            setSubmitting(false);
        }
    }


    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Extend Compliance Deadline</DialogTitle>
                    <DialogDescription>Set a new compliance deadline for all committee members of this requisition.</DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    <div className="space-y-2">
                        <Label>New Compliance Deadline</Label>
                        <div className="flex gap-2">
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn("w-full justify-start text-left font-normal", !newDeadline && "text-muted-foreground")}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {newDeadline ? format(newDeadline, "PPP") : <span>Pick a new date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar mode="single" selected={newDeadline} onSelect={setNewDeadline} disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))} initialFocus />
                                </PopoverContent>
                            </Popover>
                            <Input type="time" className="w-32" value={newDeadlineTime} onChange={(e) => setNewDeadlineTime(e.target.value)} />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Procurement Method</Label>
                        <select value={procurementMethod} onChange={(e) => setProcurementMethod(e.target.value)} disabled={!canTakeAction} className="w-full border rounded px-2 py-1">
                            <option value="RFQ">RFQ (Request for Quotation)</option>
                            <option value="RFP">RFP (Request for Proposal) — Coming Soon</option>
                            <option value="OpenTender">Open Tender</option>
                            <option value="RestrictedTender">Restricted Tender — Coming Soon</option>
                            <option value="DirectProcurement">Direct Procurement — Coming Soon</option>
                            <option value="TwoStage">Two-Stage Bidding — Coming Soon</option>
                        </select>
                    </div>
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                    <Button onClick={handleSubmit} disabled={isSubmitting || !finalNewDeadline}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Confirm Extension
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

const OverdueReportDialog = ({ isOpen, onClose, member }: { isOpen: boolean, onClose: () => void, member: User }) => {
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Overdue Member Report</DialogTitle>
                    <DialogDescription>
                        This is a placeholder for a detailed report about the overdue committee member for internal follow-up.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    <p>This is a placeholder for a detailed report about the overdue committee member for internal follow-up.</p>
                    <div className="p-4 border rounded-md bg-muted/50">
                        <p><span className="font-semibold">Member Name:</span> {member.name}</p>
                        <p><span className="font-semibold">Email:</span> {member.email}</p>
                        <p><span className="font-semibold">Assigned Role:</span> {(member.roles as any[])?.map(r => r.name).join(', ').replace(/_/g, ' ')}</p>
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={onClose}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}


const CommitteeActions = ({
    user,
    requisition,
    onFinalScoresSubmitted,
}: {
    user: ReturnType<typeof useAuth>['user'],
    requisition: PurchaseRequisition,
    onFinalScoresSubmitted: () => void,
}) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submittedOverride, setSubmittedOverride] = useState(false);
    const { toast } = useToast();
    const { token } = useAuth();

    if (!user) {
        return null;
    }

    const isCommitteeUser = useMemo(() => (user.roles as UserRole[]).some(r => r.includes('Committee')), [user.roles]);

    const assignment = useMemo(() => user.committeeAssignments?.find(a => a.requisitionId === requisition.id), [user.committeeAssignments, requisition.id]);
    const scoresAlreadyFinalized = assignment?.scoresSubmitted || false;
    const scoresFinalized = scoresAlreadyFinalized || submittedOverride;

    if (!isCommitteeUser) {
        return null;
    }

    const userScoredQuotesCount = requisition.quotations?.filter(q => (q.scores?.some(s => s.scorerId === user.id) || (q as any).complianceSets?.some((c: any) => c.scorerId === user.id))).length || 0;
    const allQuotesScored = (requisition.quotations?.length || 0) > 0 && userScoredQuotesCount === requisition.quotations?.length;

    const handleSubmitScores = async () => {
        if (!token) return;
        if (scoresFinalized) return;
        setIsSubmitting(true);
        try {
            const response = await fetch(`/api/requisitions/${requisition.id}/submit-scores`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ userId: user.id })
            });

            if (response.status === 409) {
                setSubmittedOverride(true);
                toast({ title: 'Compliance Submitted', description: 'Your final compliance checks were already submitted.' });
                onFinalScoresSubmitted();
                return;
            }

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to submit scores');
            }
            toast({ title: 'Compliance Submitted', description: 'Your final compliance checks have been recorded.' });
            setSubmittedOverride(true);
            onFinalScoresSubmitted();
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error instanceof Error ? error.message : 'An unknown error occurred.',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (scoresFinalized) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Committee Actions</CardTitle>
                    <CardDescription>Finalize your compliance checks for this requisition.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button variant="outline" disabled>
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Compliance Submitted
                    </Button>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Committee Actions</CardTitle>
                <CardDescription>Finalize your evaluation for this requisition.</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground">You have completed compliance checks for {userScoredQuotesCount} of {requisition.quotations?.length || 0} quotes.</p>
            </CardContent>
            <CardFooter>
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button disabled={!allQuotesScored || isSubmitting || scoresFinalized}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Submit Final Compliance Checks
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure you want to submit?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This will finalize your scores for this requisition. You will not be able to make further changes.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleSubmitScores} disabled={isSubmitting || !allQuotesScored}>Confirm and Submit</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </CardFooter>
        </Card>
    );
};

const NotifyVendorDialog = ({
    isOpen,
    onClose,
    onConfirm,
}: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (deadline?: Date) => void;
}) => {
    const [deadlineDate, setDeadlineDate] = useState<Date | undefined>();
    const [deadlineTime, setDeadlineTime] = useState('17:00');

    const finalDeadline = useMemo(() => {
        if (!deadlineDate) return undefined;
        const [hours, minutes] = deadlineTime.split(':').map(Number);
        return setMinutes(setHours(deadlineDate, hours), minutes);
    }, [deadlineDate, deadlineTime]);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Notify Vendor and Set Deadline</DialogTitle>
                    <DialogDescription>
                        Confirm to send the award notification. You can optionally set a new response deadline for the vendor.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-2">
                    <Label>Vendor Response Deadline (Optional)</Label>
                    <div className="flex gap-2">
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant={"outline"}
                                    className={cn("w-full justify-start text-left font-normal", !deadlineDate && "text-muted-foreground")}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {deadlineDate ? format(deadlineDate, "PPP") : <span>Set a new deadline</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar
                                    mode="single"
                                    selected={deadlineDate}
                                    onSelect={setDeadlineDate}
                                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                                    initialFocus
                                />
                            </PopoverContent>
                        </Popover>
                        <Input
                            type="time"
                            className="w-32"
                            value={deadlineTime}
                            onChange={(e) => setDeadlineTime(e.target.value)}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button onClick={() => onConfirm(finalDeadline)}>Confirm & Notify</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};


export default function QuotationDetailsPage() {
    const router = useRouter();
    const params = useParams();
    const { toast } = useToast();
    const { user, allUsers, role, rolePermissions, rfqSenderSetting, committeeQuorum, token } = useAuth();
    const id = params.id as string;

    const [requisition, setRequisition] = useState<PurchaseRequisition | null>(null);
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [quotations, setQuotations] = useState<Quotation[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCommitteeDialogOpen, setCommitteeDialogOpen] = useState(false);
    const [isScoringFormOpen, setScoringFormOpen] = useState(false);
    const [isFinalizing, setIsFinalizing] = useState(false);
    const [isNotifying, setIsNotifying] = useState(false);
    const [isNotifyDialogOpen, setIsNotifyDialogOpen] = useState(false);
    const [selectedQuoteForScoring, setSelectedQuoteForScoring] = useState<Quotation | null>(null);
    const [selectedQuoteForDetails, setSelectedQuoteForDetails] = useState<Quotation | null>(null);

    // Trigger server-side deadline job once on page load so expired awarded items are processed.
    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const resp = await fetch('/api/cron/trigger-deadline', { method: 'POST' });
                if (!resp.ok) {
                    console.warn('[QUOTATION PAGE] Cron trigger returned', resp.status);
                } else {
                    const json = await resp.json();
                    if (json.ran) console.log('[QUOTATION PAGE] Deadline cron triggered on page load');
                }
            } catch (err) {
                if (!mounted) return;
                console.warn('[QUOTATION PAGE] Failed to trigger deadline cron on load', err);
            }
        })();
        return () => { mounted = false; };
    }, []);
    const [hidePricesForScoring, setHidePricesForScoring] = useState(false);
    const [isChangingAward, setIsChangingAward] = useState(false);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [isReportOpen, setReportOpen] = useState(false);
    const [actionDialog, setActionDialog] = useState<{ isOpen: boolean, type: 'update' | 'cancel' | 'restart' }>({ isOpen: false, type: 'restart' });
    const [currentQuotesPage, setCurrentQuotesPage] = useState(1);
    const [committeeTab, setCommitteeTab] = useState<'pending' | 'scored'>('pending');
    const [isRestartRfqOpen, setIsRestartRfqOpen] = useState(false);
    const [isSingleAwardCenterOpen, setSingleAwardCenterOpen] = useState(false);
    const [isBestItemAwardCenterOpen, setBestItemAwardCenterOpen] = useState(false);
    const [showNoCompliantDialog, setShowNoCompliantDialog] = useState(false);
    const [deadlineCheckPerformed, setDeadlineCheckPerformed] = useState(false);
    const [isManualQuoteOpen, setIsManualQuoteOpen] = useState(false);
    const [isChangeOpen, setIsChangeOpen] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);

    // Trigger the award-deadline job when this page is opened, but avoid repeated runs.
    useEffect(() => {
        if (!deadlineCheckPerformed) {
            setDeadlineCheckPerformed(true);
            void fetch('/api/cron/trigger-deadline').catch((err) => {
                // non-fatal: log locally
                console.debug('[UI] trigger-deadline call failed:', err);
            });
        }
    }, [deadlineCheckPerformed]);


    const isAuthorized = useMemo(() => {
        if (!user || !role) return false;
        const userRoles = user.roles as UserRole[];
        if (userRoles.includes('Admin')) return true;

        const assigned = requisition?.assignedRfqSenderIds || [];
        if (assigned.length > 0) {
            return assigned.includes(user.id);
        }

        if (rfqSenderSetting.type === 'specific') {
            return rfqSenderSetting.userIds?.includes(user.id) ?? false;
        }
        if (rfqSenderSetting.type === 'all') {
            return userRoles.includes('Procurement_Officer');
        }
        return false;
    }, [user, role, rfqSenderSetting, requisition]);

    const isAccepted = useMemo(() => quotations.some(q => q.status === 'Accepted' || q.status === 'Partially_Awarded'), [quotations]);

    const isDeadlinePassed = useMemo(() => {
        if (!requisition) return false;
        return requisition.deadline ? isPast(new Date(requisition.deadline)) : false;
    }, [requisition]);

    const isScoringDeadlinePassed = useMemo(() => {
        if (!requisition || !requisition.scoringDeadline) return false;
        return isPast(new Date(requisition.scoringDeadline));
    }, [requisition]);

    const isScoringComplete = useMemo(() => {
        if (!requisition) return false;
        const allMemberIds = [
            ...(requisition.financialCommitteeMemberIds || []),
            ...(requisition.technicalCommitteeMemberIds || [])
        ];
        if (allMemberIds.length === 0) return false;
        if (quotations.length === 0) return false;

        // Check if every assigned member has finalized their scores.
        const uniqueMemberIds = [...new Set(allMemberIds)];
        return uniqueMemberIds.every(memberId => {
            const member = allUsers.find(u => u.id === memberId);
            return member?.committeeAssignments?.some(a => a.requisitionId === requisition.id && a.scoresSubmitted) || false;
        });
    }, [requisition, quotations, allUsers]);

    const isAwarded = useMemo(() => {
        if (!requisition || !requisition.status) return false;
        const awardProcessStatuses = ['PostApproved', 'Awarded', 'Award_Declined', 'PO_Created', 'Closed', 'Fulfilled', 'Partially_Closed'];
        return awardProcessStatuses.includes(requisition.status) || requisition.status.startsWith('Pending_');
    }, [requisition]);

    // Whether the deadline passed but the number of quotations is below the committee quorum
    const quorumNotMetAndDeadlinePassed = useMemo(() => {
        const deadlinePassed = isDeadlinePassed;
        return deadlinePassed && !isAwarded && quotations.length > 0 && quotations.length < committeeQuorum;
    }, [isDeadlinePassed, isAwarded, quotations.length, committeeQuorum]);


    const isAssignedCommitteeMember = useMemo(() => {
        if (!user || !role || !requisition) {
            return false;
        }
        const userRoles = user.roles as UserRole[];
        if (!userRoles.some(r => r.includes('Committee'))) return false;

        return (requisition.financialCommitteeMemberIds?.includes(user.id) || requisition.technicalCommitteeMemberIds?.includes(user.id)) ?? false;
    }, [user, role, requisition]);

    const isReviewer = useMemo(() => {
        if (!user || !role || !requisition) return false;
        // A user is a reviewer if they have permission to access the award reviews page.
        const allowedPaths = rolePermissions['Combined'] || [];
        return allowedPaths.includes('/award-reviews');
    }, [user, role, requisition, rolePermissions]);

    const readyForCommitteeAssignment = useMemo(() => {
        if (!requisition) return false;
        const deadlinePassed = requisition.deadline ? isPast(new Date(requisition.deadline)) : false;
        const hasEnoughQuotes = quotations.length >= committeeQuorum;
        const needsCompliance = (requisition.rfqSettings as any)?.needsCompliance ?? true;
        return deadlinePassed && hasEnoughQuotes && requisition.status === 'Accepting_Quotes' && needsCompliance;
    }, [requisition, quotations.length, committeeQuorum]);

    const currentStep = useMemo((): 'rfq' | 'committee' | 'award' | 'finalize' | 'completed' => {
        if (!requisition || !requisition.status) return 'rfq';
        if (readyForCommitteeAssignment) return 'committee';

        const completeStatuses = ['Fulfilled', 'Closed'];
        if (completeStatuses.includes(requisition.status)) return 'completed';

        const finalizeStatuses = ['PO_Created', 'Partially_Closed'];
        if (finalizeStatuses.includes(requisition.status) || isAccepted) return 'finalize';

        const awardStatuses = ['Awarded', 'PostApproved', 'Award_Declined'];
        if (awardStatuses.includes(requisition.status) || requisition.status.startsWith('Pending_')) return 'award';

        const committeeStatuses = ['Scoring_In_Progress', 'Scoring_Complete'];
        if (committeeStatuses.includes(requisition.status)) return 'committee';

        const needsComplianceFlag = (requisition.rfqSettings as any)?.needsCompliance ?? true;
        if (requisition.status === 'Accepting_Quotes' && isDeadlinePassed && needsComplianceFlag) return 'committee';

        return 'rfq';
    }, [requisition, isAccepted, isDeadlinePassed, readyForCommitteeAssignment]);

    const { pendingQuotes, scoredQuotes } = useMemo(() => {
        if (!user || !(user.roles as string[]).some(r => r.includes('Committee'))) return { pendingQuotes: quotations, scoredQuotes: [] };
        const hasUserChecked = (q: any) => {
            return !!(q.scores?.some((s: any) => s.scorerId === user.id) || q.complianceSets?.some((c: any) => c.scorerId === user.id));
        }
        const pending = quotations.filter(q => !hasUserChecked(q));
        const scored = quotations.filter(q => hasUserChecked(q));
        return { pendingQuotes: pending, scoredQuotes: scored };
    }, [quotations, user]);

    const quotesForDisplay = quotations;
    const totalQuotePages = Math.ceil(quotesForDisplay.length / PAGE_SIZE);
    const itemStatuses = useMemo(() => {
        if (!requisition || !requisition.items) return [] as any[];
        return requisition.items.flatMap(item => {
            const details = (item.perItemAwardDetails as PerItemAwardDetail[] | undefined) || [];
            return details.map(d => ({
                id: d.quoteItemId || `${item.id}-${d.vendorId}-${d.rank}`,
                vendorId: d.vendorId,
                rank: d.rank,
                proposedItemName: d.proposedItemName,
                reqItemName: item.name,
                status: d.status,
                score: d.score,
                quotationId: d.quotationId,
            }));
        });
    }, [requisition]);

    const fetchRequisitionAndQuotes = useCallback(async () => {
        if (!id) return;
        setLoading(true);

        try {
            const [reqResponse, venResponse, quoResponse] = await Promise.all([
                fetch(`/api/requisitions/${id}`),
                fetch('/api/vendors'),
                fetch(`/api/quotations?requisitionId=${id}`),
            ]);
            const currentReq = await reqResponse.json();
            const venData = await venResponse.json();
            let quoData: Quotation[] = await quoResponse.json();

            if (currentReq) {
                setVendors(venData || []);

                // --- Start of new frontend calculation logic ---
                if (currentReq.evaluationCriteria && quoData.length > 0) {
                    quoData = quoData.map(quote => {
                        const itemBids: { requisitionItemId: string; championBidScore: number; }[] = [];

                        // Build set of quoteItemIds marked non-compliant by any committee member
                        const nonCompliantIds = new Set<string>((quote.complianceSets || []).flatMap((s: any) => (s.itemCompliances || []).filter((ic: any) => ic.comply === false).map((ic: any) => ic.quoteItemId)));

                        for (const reqItem of currentReq.items) {
                            // Exclude proposals (quote items) that are marked non-compliant
                            const proposalsForItem = quote.items.filter(item => item.requisitionItemId === reqItem.id && !nonCompliantIds.has(item.id));
                            if (proposalsForItem.length === 0) continue;

                            const calculatedProposals = proposalsForItem.map(proposal => {
                                let totalItemScore = 0;
                                let scoreCount = 0;
                                quote.scores?.forEach(scoreSet => {
                                    const itemScore = scoreSet.itemScores.find(is => is.quoteItemId === proposal.id);
                                    if (itemScore) {
                                        totalItemScore += itemScore.finalScore;
                                        scoreCount++;
                                    }
                                });
                                return scoreCount > 0 ? totalItemScore / scoreCount : 0;
                            });

                            const championBidScore = Math.max(...calculatedProposals);
                            itemBids.push({ requisitionItemId: reqItem.id, championBidScore });
                        }

                        const finalVendorScore = itemBids.length > 0
                            ? itemBids.reduce((acc, bid) => acc + bid.championBidScore, 0) / itemBids.length
                            : 0;

                        return { ...quote, finalAverageScore: finalVendorScore };
                    });
                }
                // --- End of new frontend calculation logic ---

                setRequisition({ ...currentReq, quotations: quoData });
                setQuotations(quoData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            } else {
                toast({ variant: 'destructive', title: 'Error', description: 'Requisition not found.' });
            }

        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch data.' });
        } finally {
            setLoading(false);
        }
    }, [id, toast]);

    useEffect(() => {
        if (id && user) {
            fetchRequisitionAndQuotes();
        }
    }, [id, user, fetchRequisitionAndQuotes]);

    useEffect(() => {
        if (!requisition || !user || !token || deadlineCheckPerformed) return;

        const checkAndDecline = async () => {
            let needsRefetch = false;

            if (requisition.awardResponseDeadline && isPast(new Date(requisition.awardResponseDeadline))) {
                const awardStrategy = (requisition.rfqSettings as any)?.awardStrategy;

                if (awardStrategy === 'item') {
                    for (const item of requisition.items) {
                        const perItemDetails = (item.perItemAwardDetails as PerItemAwardDetail[] | undefined) || [];
                        const awardedDetail = perItemDetails.find(d => d.status === 'Awarded' || d.status === 'Pending_Award');

                        if (awardedDetail) {
                            needsRefetch = true;
                            await fetch(`/api/quotations/${awardedDetail.quotationId}/respond`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                body: JSON.stringify({ actor: user, action: 'reject', quoteItemId: awardedDetail.quoteItemId, rejectionReason: 'deadline is passed' })
                            });
                        }
                    }
                } else { // Single award
                    const awardedQuote = quotations.find(q => q.status === 'Awarded' || q.status === 'Pending_Award');
                    if (awardedQuote) {
                        needsRefetch = true;
                        await fetch(`/api/quotations/${awardedQuote.id}/respond`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                            body: JSON.stringify({ actor: user, action: 'reject', rejectionReason: 'deadline is passed' })
                        });
                    }
                }
            }

            setDeadlineCheckPerformed(true);

            if (needsRefetch) {
                toast({ title: 'Deadline Expired', description: 'An awarded vendor failed to respond in time. The award has been automatically declined.' });
                fetchRequisitionAndQuotes();
            }
        };

        checkAndDecline();
    }, [requisition, quotations, user, token, toast, fetchRequisitionAndQuotes, deadlineCheckPerformed]);


    const handleFinalizeScores = async (
        awardStrategy: 'all' | 'item',
        awards: any,
        awardResponseDeadline?: Date,
        minuteDocumentUrl?: string,
        minuteJustification?: string
    ) => {
        if (!user || !requisition || !quotations || !token) return;


        setIsFinalizing(true);
        try {
            const response = await fetch(`/api/requisitions/${requisition.id}/finalize-scores`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ userId: user.id, awards, awardStrategy, awardResponseDeadline, minuteDocumentUrl, minuteJustification }),
            });
            if (!response.ok) {
                const errorData = await response.json();
                // Special handling for no compliant vendor error
                if (errorData.error && errorData.error.includes('No vendor is compliant for all champion bids')) {
                    setShowNoCompliantDialog(true);
                    return;
                }
                throw new Error(errorData.error || 'Failed to finalize scores.');
            }
            toast({ title: 'Success', description: 'Scores have been finalized and awards are being routed for final review.' });
            fetchRequisitionAndQuotes();
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error instanceof Error ? error.message : 'An unknown error occurred.',
            });
        } finally {
            setIsFinalizing(false);
            setSingleAwardCenterOpen(false);
            setBestItemAwardCenterOpen(false);
        }
    };
    // Handler for Restart RFQ from error dialog
    const handleRestartRfqFromError = () => {
        setShowNoCompliantDialog(false);
        setActionDialog({ isOpen: true, type: 'restart' });
    };

    // Handler for Change Award Type from error dialog
    const handleChangeAwardTypeFromError = () => {
        setShowNoCompliantDialog(false);
        setBestItemAwardCenterOpen(true);
    };

    const handleAwardChange = async () => {
        if (!user || !id || !requisition || !token) return;
        setIsChangingAward(true);
        try {
            const response = await fetch(`/api/requisitions/${id}/promote-standby`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ userId: user.id }),
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Failed to handle award change.' }));
                throw new Error(errorData.error);
            }
            toast({ title: `Action Successful`, description: `The award status has been updated.` });
            fetchRequisitionAndQuotes();
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error instanceof Error ? error.message : 'An unknown error occurred.',
            });
        } finally {
            setIsChangingAward(false);
        }
    }

    const handleNotifyVendor = async (deadline?: Date) => {
        if (!user || !requisition || !token) return;
        setIsNotifying(true);
        try {
            const response = await fetch(`/api/requisitions/${requisition.id}/notify-vendor`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ userId: user.id, awardResponseDeadline: deadline })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({} as any));
                throw new Error(errorData.error || "Failed to notify vendor.");
            }

            const data = await response.json().catch(() => ({} as any));
            const serverMessage = (data as any)?.message as string | undefined;
            const isComingSoon = typeof serverMessage === 'string' && serverMessage.toLowerCase().includes('coming soon');

            toast({
                title: isComingSoon ? 'Notification coming soon' : 'Vendor Notified',
                description: isComingSoon
                    ? 'Manual quotation award will proceed without vendor portal response.'
                    : (serverMessage || 'The winning vendor has been notified and the award is pending their response.')
            });
            fetchRequisitionAndQuotes();
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error instanceof Error ? error.message : 'An unknown error occurred.',
            });
        } finally {
            setIsNotifying(false);
        }
    }

    const handleScoreButtonClick = (quote: Quotation, hidePrices: boolean) => {
        setSelectedQuoteForScoring(quote);
        setHidePricesForScoring(hidePrices);
        setScoringFormOpen(true);
    }

    const handleViewDetailsClick = (quote: Quotation) => {
        setSelectedQuoteForDetails(quote);
    };

    const handleScoreSubmitted = () => {
        setScoringFormOpen(false);
        setSelectedQuoteForScoring(null);
        setCommitteeTab('scored'); // Switch to scored tab after submission
        fetchRequisitionAndQuotes();
    }

    const isProcurementActionAllowed = isAuthorized && (requisition?.status === 'PreApproved' || requisition?.status === 'Accepting_Quotes');

    const invitedVendorsForStatus = useMemo(() => {
        if (!requisition) return [] as Vendor[];

        const verifiedVendors = Array.isArray(vendors)
            ? vendors.filter((v) => v.kycStatus === 'Verified')
            : ([] as Vendor[]);

        const invitedIds = Array.isArray(requisition.allowedVendorIds)
            ? requisition.allowedVendorIds
            : ([] as string[]);

        if (invitedIds.length === 0) {
            return verifiedVendors;
        }

        const invitedIdSet = new Set(invitedIds);
        return verifiedVendors.filter((v) => invitedIdSet.has(v.id));
    }, [requisition, vendors]);

    if (loading || !user || !requisition) {
        return <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }

    const canManageCommittees = isAuthorized;
    const isMasked = (requisition.rfqSettings?.masked === true) || (readyForCommitteeAssignment && requisition.rfqSettings?.masked !== false);
    const canAddManualQuotation = isAuthorized && requisition.status === 'Accepting_Quotes' && (!isMasked || quorumNotMetAndDeadlinePassed);
    const isReadyForNotification = requisition?.status === 'PostApproved';
    const noBidsAndDeadlinePassed = isDeadlinePassed && quotations.length === 0 && requisition?.status === 'Accepting_Quotes';

    const canViewCumulativeReport = isAwarded && isScoringComplete && (isAuthorized || isAssignedCommitteeMember || isReviewer);

    const showAwardingCenter = (requisition.status === 'Scoring_Complete') && isAuthorized;
    const awardIsDeclined = requisition.status === 'Award_Declined';

    const isPerItemStrategy = (requisition.rfqSettings as any)?.awardStrategy === 'item';
    const hasDeclinedWithStandby = isPerItemStrategy && requisition.items.some(item => {
        const details = (item.perItemAwardDetails as any[]) || [];
        return details.some(d => d.status === 'Declined') && details.some(d => d.status === 'Standby');
    });
    const hasFailedOrDeclined = isPerItemStrategy && requisition.items.some(item => {
        const details = (item.perItemAwardDetails as any[]) || [];
        return details.some(d => d.status === 'Declined' || d.status === 'Failed_to_Award');
    });

    const hasAssignedCommittee = (requisition.financialCommitteeMemberIds && requisition.financialCommitteeMemberIds.length > 0) || (requisition.technicalCommitteeMemberIds && requisition.technicalCommitteeMemberIds.length > 0);
    const isScoringStarted = requisition.status !== 'PreApproved' && requisition.status !== 'Accepting_Quotes';


    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <Button variant="outline" onClick={() => router.back()}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                </Button>
                <div className="flex items-center gap-2">
                    {isAwarded && (
                        <Button asChild variant="secondary" onClick={() => router.push(`/requisitions/${id}/award-details`)}>
                            <Link href={`/requisitions/${id}/award-details`}><Calculator className="mr-2 h-4 w-4" /> View Calculation</Link>
                        </Button>
                    )}
                    {requisition.rfqSettings?.improvedIdeasEnabled && (
                        <>
                            <Button variant="secondary" onClick={() => setIsChangeOpen(true)}>Change Award</Button>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="destructive">Cancel Award</Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-56 p-3">
                                    <div className="space-y-2">
                                        <div className="font-medium">Cancel Award To</div>
                                        <div className="flex flex-col gap-2">
                                            <Button onClick={async () => {
                                                if (!user) return;
                                                setIsCancelling(true);
                                                try {
                                                    const res = await fetch(`/api/requisitions/${id}/reset-award`, {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                                                        body: JSON.stringify({ userId: user.id, toStatus: 'ready_for_rfq' })
                                                    });
                                                    const j = await res.json();
                                                    if (!res.ok) throw new Error(j.error || j.details || 'Failed');
                                                    await fetchRequisitionAndQuotes();
                                                } catch (err) {
                                                    console.error(err);
                                                } finally {
                                                    setIsCancelling(false);
                                                }
                                            }}>Ready for RFQ</Button>
                                            <Button onClick={async () => {
                                                if (!user) return;
                                                setIsCancelling(true);
                                                try {
                                                    const res = await fetch(`/api/requisitions/${id}/reset-award`, {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                                                        body: JSON.stringify({ userId: user.id, toStatus: 'ready_to_award' })
                                                    });
                                                    const j = await res.json();
                                                    if (!res.ok) throw new Error(j.error || j.details || 'Failed');
                                                    await fetchRequisitionAndQuotes();
                                                } catch (err) {
                                                    console.error(err);
                                                } finally {
                                                    setIsCancelling(false);
                                                }
                                            }}>Ready to Award</Button>
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </>
                    )}
                    <Button variant="secondary" onClick={() => setReportOpen(true)}>
                        <FileBarChart2 className="mr-2 h-4 w-4" /> View Spec Compliance Report
                    </Button>
                </div>
            </div>


            <Card className="p-4 sm:p-6">
                <WorkflowStepper step={currentStep} />
            </Card>

            {isProcurementActionAllowed && (
                <Accordion type="multiple" className="w-full space-y-4">
                    <EditableCriteria requisition={requisition} onUpdate={fetchRequisitionAndQuotes} />
                    <EditableQuestions requisition={requisition} onUpdate={fetchRequisitionAndQuotes} />
                </Accordion>
            )}

            {noBidsAndDeadlinePassed && isAuthorized && (
                <Card className="border-amber-500">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-amber-600"><AlertTriangle /> RFQ Closed: No Bids Received</CardTitle>
                        <CardDescription>The deadline for this Request for Quotation has passed and no vendors submitted a bid.</CardDescription>
                    </CardHeader>
                    <CardFooter className="gap-2">
                        <Button onClick={() => setActionDialog({ isOpen: true, type: 'restart' })}>
                            <RefreshCw className="mr-2 h-4 w-4" /> Restart RFQ
                        </Button>
                        <Button variant="destructive" onClick={() => setActionDialog({ isOpen: true, type: 'cancel' })}>
                            <XCircle className="mr-2 h-4 w-4" /> Cancel RFQ
                        </Button>
                    </CardFooter>
                </Card>
            )}

            {quorumNotMetAndDeadlinePassed && isAuthorized && (
                <RFQReopenCard requisition={requisition} onRfqReopened={fetchRequisitionAndQuotes} />
            )}

            {currentStep === 'rfq' && !noBidsAndDeadlinePassed && !quorumNotMetAndDeadlinePassed && (
                <div className="grid md:grid-cols-2 gap-6 items-start">
                    <RFQDistribution
                        requisition={requisition}
                        vendors={vendors}
                        onRfqSent={fetchRequisitionAndQuotes}
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
            )}

            {isAuthorized && requisition.deadline && (
                <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="invited-vendors">
                        <AccordionTrigger>
                            <CardTitle className="text-lg">Invited Vendors</CardTitle>
                        </AccordionTrigger>
                        <AccordionContent>
                            <CardDescription className="mb-4">
                                Track which invited vendors have submitted a quotation.
                            </CardDescription>
                            {invitedVendorsForStatus.length === 0 ? (
                                <div className="text-sm text-muted-foreground">No invited vendors found.</div>
                            ) : (
                                <div className="rounded-md border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Vendor</TableHead>
                                                <TableHead>Status</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {invitedVendorsForStatus.map((vendor) => {
                                                const hasSubmitted = quotations.some((q) => q.vendorId === vendor.id);
                                                return (
                                                    <TableRow key={vendor.id}>
                                                        <TableCell className="font-medium">{vendor.name}</TableCell>
                                                        <TableCell>
                                                            <Badge
                                                                variant={hasSubmitted ? 'default' : 'secondary'}
                                                                className={hasSubmitted ? 'bg-green-600 text-white hover:bg-green-600' : undefined}
                                                            >
                                                                {hasSubmitted ? 'Submitted' : 'Not Submitted'}
                                                            </Badge>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            )}

            <ManageRFQ
                requisition={requisition}
                onSuccess={fetchRequisitionAndQuotes}
                isAuthorized={isAuthorized}
            />

            {(currentStep === 'committee' || readyForCommitteeAssignment) && canManageCommittees && (
                <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="committee-management">
                        <AccordionTrigger>
                            <CardTitle className="flex items-center gap-2 text-lg"><Users /> Evaluation Committee (Scorers)</CardTitle>
                        </AccordionTrigger>
                        <AccordionContent>
                            {isMasked ? (
                                <Card className="border-amber-500 bg-amber-50">
                                    <CardHeader>
                                        <CardTitle>Director Verification Required</CardTitle>
                                        <CardDescription>Vendor cards stay sealed and committee assignment is locked until all three directors enter their PINs.</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <DirectorPinVerification requisition={requisition} onUnmasked={fetchRequisitionAndQuotes} />
                                    </CardContent>
                                </Card>
                            ) : (
                                (() => {
                                    const needsCompliance = (requisition.rfqSettings as any)?.needsCompliance;
                                    const isRfqSender = user && ((user.roles || []).some((r: any) => (typeof r === 'string' ? r === 'Procurement_Officer' : r?.name === 'Procurement_Officer')) || (user.roles || []).some((r: any) => (typeof r === 'string' ? r === 'Admin' : r?.name === 'Admin')));
                                    if (needsCompliance === undefined && isRfqSender && !quorumNotMetAndDeadlinePassed) {
                                        return (
                                            <Card className="border">
                                                <CardHeader>
                                                    <CardTitle>Require Compliance Checks?</CardTitle>
                                                    <CardDescription>Choose whether this RFQ needs committee compliance checks before award.</CardDescription>
                                                </CardHeader>
                                                <CardContent>
                                                    <p className="text-sm text-muted-foreground">If you choose <strong>Yes</strong>, the committee will perform item-level comply/non-compliant checks before the award stage. If <strong>No</strong>, the requisition will skip compliance and proceed directly to award/finalize.</p>
                                                    <div className="mt-4 flex items-center gap-3">
                                                        <Button onClick={async () => {
                                                            try {
                                                                const res = await fetch(`/api/requisitions/${requisition.id}/set-needs-compliance`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ needsCompliance: true }) });
                                                                if (!res.ok) throw new Error((await res.json()).error || 'Failed');
                                                                fetchRequisitionAndQuotes();
                                                            } catch (e) { console.error(e); }
                                                        }}>Yes — Require Compliance</Button>
                                                        <Button variant="outline" onClick={async () => {
                                                            try {
                                                                const res = await fetch(`/api/requisitions/${requisition.id}/set-needs-compliance`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ needsCompliance: false }) });
                                                                if (!res.ok) throw new Error((await res.json()).error || 'Failed');
                                                                fetchRequisitionAndQuotes();
                                                            } catch (e) { console.error(e); }
                                                        }}>No — Skip Compliance</Button>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        );
                                    }
                                    if (needsCompliance === true) {
                                        return (
                                            <EvaluationCommitteeManagement
                                                requisition={requisition}
                                                onCommitteeUpdated={fetchRequisitionAndQuotes}
                                                open={isCommitteeDialogOpen}
                                                onOpenChange={setCommitteeDialogOpen}
                                                isAuthorized={isAuthorized}
                                                isEditDisabled={isAwarded}
                                            />
                                        );
                                    }
                                    return (
                                        <Card className="border">
                                            <CardHeader>
                                                <CardTitle>Compliance Skipped</CardTitle>
                                                <CardDescription>This RFQ is configured to skip committee compliance checks and can proceed to award/finalize.</CardDescription>
                                            </CardHeader>
                                            <CardContent>
                                                <p className="text-sm text-muted-foreground">You may proceed to the award center to finalize the award.</p>
                                            </CardContent>
                                        </Card>
                                    );
                                })()
                            )}
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            )}


            {(currentStep !== 'rfq') && (
                <div className="w-full flex flex-col gap-4">
                    {/* Quotation Overview Accordion (now on top) */}
                    <Accordion type="single" collapsible className="w-full" defaultValue="quotation-overview">
                        <AccordionItem value="quotation-overview">
                            <AccordionTrigger>
                                <CardTitle className="flex items-center gap-2 text-lg"><FileBadge /> Quotation Overview</CardTitle>
                            </AccordionTrigger>
                            <AccordionContent>
                                {readyForCommitteeAssignment && isMasked && (
                                    <Card className="mb-4 border-amber-200">
                                        <CardHeader>
                                            <CardTitle>Director Verification</CardTitle>
                                            <CardDescription>Generate one-time PINs and verify directors to unseal vendor quotes.</CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            <DirectorPinVerification requisition={requisition} onUnmasked={fetchRequisitionAndQuotes} />
                                        </CardContent>
                                    </Card>
                                )}

                                <Card className="border-0 shadow-none">
                                    <CardHeader>
                                        <CardDescription className="text-base font-semibold text-foreground">{requisition.title}</CardDescription>
                                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs">
                                            {requisition.deadline && (
                                                <div className="flex items-center gap-1.5 font-medium text-muted-foreground">
                                                    <CalendarIcon className="h-4 w-4" />
                                                    <span>Quote Deadline:</span>
                                                    <span className="font-semibold text-foreground">{format(new Date(requisition.deadline), 'PPpp')}</span>
                                                </div>
                                            )}
                                            {requisition.scoringDeadline && (
                                                <div className="flex items-center gap-1.5 font-medium text-muted-foreground">
                                                    <Timer className="h-4 w-4" />
                                                    <span>Compliance Deadline:</span>
                                                    <span className="font-semibold text-foreground">{format(new Date(requisition.scoringDeadline), 'PPpp')}</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-4 mt-2 text-sm" />
                                        {canAddManualQuotation && (
                                            <div className="mt-4 flex items-center justify-end">
                                                <Button onClick={() => setIsManualQuoteOpen(true)}>
                                                    <FileUp className="mr-2 h-4 w-4" />
                                                    Add Vendor Quotation
                                                </Button>
                                            </div>
                                        )}
                                    </CardHeader>
                                    <CardContent>
                                        {loading ? (
                                            <div className="flex items-center justify-center h-24">
                                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                            </div>
                                        ) : (
                                            <QuoteComparison quotes={quotesForDisplay} requisition={requisition} onViewDetails={handleViewDetailsClick} onScore={handleScoreButtonClick} user={user!} role={role} isDeadlinePassed={isDeadlinePassed} isScoringDeadlinePassed={isScoringDeadlinePassed} itemStatuses={itemStatuses} isAwarded={isAwarded} isScoringComplete={isScoringComplete} isAssignedCommitteeMember={isAssignedCommitteeMember} readyForCommitteeAssignment={readyForCommitteeAssignment} quorumNotMetAndDeadlinePassed={quorumNotMetAndDeadlinePassed} />
                                        )}
                                    </CardContent>

                                    {totalQuotePages > 1 && (
                                        <CardFooter className="flex items-center justify-end gap-2 pt-4">
                                            <span className="text-sm text-muted-foreground">Page {currentQuotesPage} of {totalQuotePages}</span>
                                            <Button variant="outline" size="icon" onClick={() => setCurrentQuotesPage(1)} disabled={currentQuotesPage === 1}><ChevronsLeft /></Button>
                                            <Button variant="outline" size="icon" onClick={() => setCurrentQuotesPage(p => p - 1)} disabled={currentQuotesPage === 1}><ChevronLeft /></Button>
                                            <Button variant="outline" size="icon" onClick={() => setCurrentQuotesPage(p => p + 1)} disabled={currentQuotesPage === totalQuotePages}><ChevronRight /></Button>
                                            <Button variant="outline" size="icon" onClick={() => setCurrentQuotesPage(totalQuotePages)} disabled={currentQuotesPage === totalQuotePages}><ChevronsRight /></Button>
                                        </CardFooter>
                                    )}

                                    {isAccepted && (
                                        <CardFooter>
                                            <Alert variant="default" className="w-full border-green-600">
                                                <CheckCircle className="h-4 w-4 text-green-600" />
                                                <AlertTitle>Award Accepted</AlertTitle>
                                                <AlertDescription>
                                                    The vendor has accepted the award. The PO has been generated.
                                                </AlertDescription>
                                            </Alert>
                                        </CardFooter>
                                    )}
                                </Card>

                                <ManualVendorQuotationDialog
                                    requisition={requisition}
                                    vendors={vendors}
                                    existingQuotations={quotations}
                                    isOpen={isManualQuoteOpen}
                                    onOpenChange={setIsManualQuoteOpen}
                                    onSubmitted={fetchRequisitionAndQuotes}
                                />
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>

                    {isChangeOpen && requisition && quotations && (
                        <ChangeAwardDialog isOpen={isChangeOpen} onClose={() => { setIsChangeOpen(false); fetchRequisitionAndQuotes(); }} requisition={requisition} quotations={quotations} />
                    )}

                    {/* Compliance Progress Accordion (now at bottom) */}
                    {(readyForCommitteeAssignment && (requisition.rfqSettings?.needsCompliance) && (isAuthorized)) && (
                        <Accordion type="single" collapsible className="w-full" defaultValue="compliance-progress">
                            <AccordionItem value="compliance-progress">
                                <AccordionTrigger>
                                    <CardTitle className="flex items-center gap-2 text-lg"><GanttChart /> Compliance Progress</CardTitle>
                                </AccordionTrigger>
                                <AccordionContent>
                                    <ScoringProgressTracker
                                        requisition={requisition}
                                        quotations={quotations}
                                        allUsers={allUsers}
                                        onSuccess={fetchRequisitionAndQuotes}
                                        onCommitteeUpdate={() => fetchRequisitionAndQuotes()}
                                        isFinalizing={isFinalizing}
                                        isAuthorized={isAuthorized}
                                    />
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    )}
                </div>
            )}

            {(showAwardingCenter || awardIsDeclined || (isPerItemStrategy && (hasDeclinedWithStandby || hasFailedOrDeclined))) && (
                <Accordion type="single" collapsible className="w-full" defaultValue="awarding-center">
                    <AccordionItem value="awarding-center">
                        <AccordionTrigger>
                            <CardTitle className="flex items-center gap-2 text-lg"><TrophyIcon /> Awarding Center</CardTitle>
                        </AccordionTrigger>
                        <AccordionContent>
                            <Card className="mt-6 border-amber-400">
                                <CardHeader>
                                    <CardDescription>
                                        {showAwardingCenter && 'Scoring is complete. Finalize scores and decide on the award strategy for this requisition.'}
                                        {awardIsDeclined && 'An award was declined. You may now promote a standby vendor or restart the RFQ for any failed items.'}
                                        {isPerItemStrategy && hasDeclinedWithStandby && 'Per-item awards: declined items with standby detected — you may promote standby vendors.'}
                                        {isPerItemStrategy && hasFailedOrDeclined && 'Per-item awards: failed or declined items detected — you may restart RFQs for those items.'}
                                    </CardDescription>
                                </CardHeader>
                                <CardFooter className="gap-4">
                                    <AwardStandbyButton
                                        requisition={requisition}
                                        quotations={quotations}
                                        onPromote={handleAwardChange}
                                        isChangingAward={isChangingAward}
                                    />

                                    {showAwardingCenter && (
                                        <>
                                            <Dialog open={isSingleAwardCenterOpen} onOpenChange={setSingleAwardCenterOpen}>
                                                <DialogTrigger asChild>
                                                    <Button disabled={isFinalizing || !isAuthorized}>Award All to Single Vendor</Button>
                                                </DialogTrigger>
                                                <AwardCenterDialog
                                                    requisition={requisition}
                                                    quotations={quotations}
                                                    onFinalize={handleFinalizeScores}
                                                    onClose={() => setSingleAwardCenterOpen(false)}
                                                />
                                            </Dialog>

                                            {requisition.items.length > 1 && (
                                                <Dialog open={isBestItemAwardCenterOpen} onOpenChange={setBestItemAwardCenterOpen}>
                                                    <DialogTrigger asChild>
                                                        <Button variant="secondary" disabled={isFinalizing || !isAuthorized}>
                                                            Award by Best Offer (Per Item)
                                                        </Button>
                                                    </DialogTrigger>
                                                    <BestItemAwardDialog
                                                        requisition={requisition}
                                                        quotations={quotations}
                                                        onFinalize={handleFinalizeScores}
                                                        isOpen={isBestItemAwardCenterOpen}
                                                        onClose={() => setBestItemAwardCenterOpen(false)}
                                                    />
                                                </Dialog>
                                            )}
                                        </>
                                    )}

                                    <RestartRfqDialog
                                        requisition={requisition}
                                        vendors={vendors}
                                        onRfqRestarted={fetchRequisitionAndQuotes}
                                    />
                                </CardFooter>
                            </Card>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            )}


            {isReadyForNotification && isAuthorized && (
                <Card className="mt-6 border-amber-500">
                    <CardHeader>
                        <CardTitle>Action Required: Notify Vendor</CardTitle>
                        <CardDescription>The award has passed all reviews. You may now notify the winning vendor.</CardDescription>
                    </CardHeader>
                    <CardFooter>
                        <Dialog open={isNotifyDialogOpen} onOpenChange={setIsNotifyDialogOpen}>
                            <DialogTrigger asChild>
                                <Button disabled={isNotifying || requisition.status === 'Awarded' || !isAuthorized}>
                                    {isNotifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    {requisition.status === 'Awarded' ? 'Notification Sent' : 'Send Award Notification'}
                                </Button>
                            </DialogTrigger>
                            <NotifyVendorDialog
                                isOpen={isNotifyDialogOpen}
                                onClose={() => setIsNotifyDialogOpen(false)}
                                onConfirm={(deadline) => {
                                    handleNotifyVendor(deadline);
                                    setIsNotifyDialogOpen(false);
                                }}
                            />
                        </Dialog>
                    </CardFooter>
                </Card>
            )}

            {isAccepted && requisition.status !== 'PO_Created' && role && !(user.roles as string[]).some(r => r.includes('Committee')) && (
                <ContractManagement requisition={requisition} onContractFinalized={fetchRequisitionAndQuotes} />
            )}
            {requisition && (
                <RequisitionDetailsDialog
                    requisition={requisition}
                    isOpen={isDetailsOpen}
                    onClose={() => setIsDetailsOpen(false)}
                />
            )}
            {requisition && quotations && (
                <CumulativeScoringReportDialog
                    requisition={requisition}
                    quotations={quotations}
                    isOpen={isReportOpen}
                    onClose={() => setReportOpen(false)}
                />
            )}
            {selectedQuoteForDetails && requisition && (
                <QuoteDetailsDialog
                    quote={selectedQuoteForDetails}
                    requisition={requisition}
                    isOpen={!!selectedQuoteForDetails}
                    onClose={() => setSelectedQuoteForDetails(null)}
                />
            )}
            <RFQActionDialog
                action={actionDialog.type}
                requisition={requisition}
                isOpen={actionDialog.isOpen}
                onClose={() => setActionDialog({ isOpen: false, type: 'restart' })}
                onSuccess={fetchRequisitionAndQuotes}
            />

            {/* Dialog for No Compliant Vendor Error */}
            <Dialog open={showNoCompliantDialog} onOpenChange={setShowNoCompliantDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>No Vendor is Compliant for All Champion Bids</DialogTitle>
                        <DialogDescription>
                            The system could not award all items to a single vendor because no vendor is compliant for all champion bids. Please choose an action:
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="destructive" onClick={handleRestartRfqFromError}>Restart RFQ (reset to PreApproved)</Button>
                        <Button variant="secondary" onClick={handleChangeAwardTypeFromError}>Change Award Type (Best Offer Per Item)</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

const RFQReopenCard = ({ requisition, onRfqReopened }: { requisition: PurchaseRequisition; onRfqReopened: () => void; }) => {
    const { user, token } = useAuth();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [newDeadlineDate, setNewDeadlineDate] = useState<Date | undefined>();
    const [newDeadlineTime, setNewDeadlineTime] = useState<string>('17:00');

    const finalNewDeadline = useMemo(() => {
        if (!newDeadlineDate) return undefined;
        const [hours, minutes] = newDeadlineTime.split(':').map(Number);
        return setMinutes(setHours(newDeadlineDate, hours), minutes);
    }, [newDeadlineDate, newDeadlineTime]);

    const handleReopen = async () => {
        if (!user || !token) return;
        if (!finalNewDeadline || isBefore(finalNewDeadline, new Date())) {
            toast({ variant: 'destructive', title: 'Error', description: 'A new deadline in the future must be set.' });
            return;
        }

        setIsSubmitting(true);
        try {
            const response = await fetch(`/api/requisitions/${requisition.id}/reopen-rfq`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ userId: user.id, newDeadline: finalNewDeadline }),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Failed to re-open RFQ.`);
            }
            toast({ title: 'Success', description: `The RFQ has been re-opened to new vendors.` });
            onRfqReopened();
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: error instanceof Error ? error.message : 'An unknown error occurred.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Card className="border-amber-500">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-600"><AlertTriangle /> Quorum Not Met</CardTitle>
                <CardDescription>
                    The submission deadline has passed, but not enough quotes were submitted. You can re-open the RFQ to all other verified vendors.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label>New Quotation Submission Deadline</Label>
                    <div className="flex gap-2">
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !newDeadlineDate && "text-muted-foreground")}>
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {newDeadlineDate ? format(newDeadlineDate, "PPP") : <span>Pick a new date</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar mode="single" selected={newDeadlineDate} onSelect={setNewDeadlineDate} disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))} initialFocus />
                            </PopoverContent>
                        </Popover>
                        <Input type="time" className="w-32" value={newDeadlineTime} onChange={(e) => setNewDeadlineTime(e.target.value)} />
                    </div>
                </div>
            </CardContent>
            <CardFooter>
                <Button onClick={handleReopen} disabled={isSubmitting || !finalNewDeadline}>
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Re-open RFQ
                </Button>
            </CardFooter>
        </Card>
    );

}
