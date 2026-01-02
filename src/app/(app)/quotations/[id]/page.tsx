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
import { useForm, useFieldArray, FormProvider, useFormContext, Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { PurchaseOrder, PurchaseRequisition, Quotation, Vendor, QuotationStatus, EvaluationCriteria, User, CommitteeScoreSet, EvaluationCriterion, QuoteItem, PerItemAwardDetail, UserRole, CustomQuestion } from '@/lib/types';
import { format, formatDistanceToNow, isBefore, isPast, setHours, setMinutes } from 'date-fns';
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

const contractFormSchema = z.object({
    fileName: z.string().min(3, "File name is required."),
    notes: z.string().min(10, "Negotiation notes are required.")
})

function AddQuoteForm({ requisition, vendors, onQuoteAdded }: { requisition: PurchaseRequisition; vendors: Vendor[], onQuoteAdded: () => void }) {
    const [isSubmitting, setSubmitting] = useState(false);
    const { toast } = useToast();
    const { user } = useAuth();

    const form = useForm<z.infer<typeof quoteFormSchema>>({
        resolver: zodResolver(quoteFormSchema),
        defaultValues: {
            notes: "",
            items: requisition.items.map(item => ({
                requisitionItemId: item.id,
                name: item.name,
                quantity: item.quantity,
                unitPrice: 0,
                leadTimeDays: 0,
            })),
        },
    });

    const { fields } = useFieldArray({
        control: form.control,
        name: "items",
    });

    const onSubmit = async (values: any) => {
        if (!user) return;
        setSubmitting(true);
        try {
            const response = await fetch('/api/quotations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...values, requisitionId: requisition.id, vendorId: user.vendorId }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to add quote.');
            }

            toast({
                title: 'Success!',
                description: 'New quotation has been added.',
            });
            onQuoteAdded();
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
            description: 'Please correct the errors in the form before adding the quotation.',
        });
    }

    // Filter for only verified vendors
    const verifiedVendors = vendors.filter(v => v.kycStatus === 'Verified');

    return (
        <DialogContent className="sm:max-w-[625px]">
            <DialogHeader>
                <DialogTitle>Add New Quotation</DialogTitle>
                <DialogDescription>
                    For requisition: <span className="font-semibold text-primary">{requisition.title}</span>
                </DialogDescription>
            </DialogHeader>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-4">
                     <FormField
                        control={form.control}
                        name="notes"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Overall Notes</FormLabel>
                            <FormControl>
                                <Textarea placeholder="Any overall notes for this quote..." {...field} />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                    <div className="space-y-4 max-h-64 overflow-y-auto pr-2">
                        {fields.map((field, index) => (
                            <Card key={field.id} className="p-4">
                                <p className="font-semibold mb-2">{field.name} (Qty: {field.quantity})</p>
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
                                </div>
                            </Card>
                        ))}
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="ghost">Cancel</Button></DialogClose>
                        <Button type="submit" disabled={isSubmitting || verifiedVendors.length === 0}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Add Quotation
                        </Button>
                    </DialogFooter>
                </form>
            </Form>
        </DialogContent>
    );
}

const QuoteComparison = ({ quotes, requisition, onViewDetails, onScore, user, role, isDeadlinePassed, isScoringDeadlinePassed, itemStatuses, isAwarded, isScoringComplete, isAssignedCommitteeMember, readyForCommitteeAssignment }: { quotes: Quotation[], requisition: PurchaseRequisition, onViewDetails: (quote: Quotation) => void, onScore: (quote: Quotation, hidePrices: boolean) => void, user: User, role: UserRole | null, isDeadlinePassed: boolean, isScoringDeadlinePassed: boolean, itemStatuses: any[], isAwarded: boolean, isScoringComplete: boolean, isAssignedCommitteeMember: boolean, readyForCommitteeAssignment: boolean }) => {
    const isMasked = (requisition.rfqSettings?.masked === true) || (readyForCommitteeAssignment && requisition.rfqSettings?.masked !== false);

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
    const isTechnicalOnlyScorer = userRoles.includes('Committee_Member') && requisition.technicalCommitteeMemberIds?.includes(user.id) && !requisition.financialCommitteeMemberIds?.includes(user.id);
                const hidePrices = isTechnicalOnlyScorer && !requisition.rfqSettings?.technicalEvaluatorSeesPrices;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {quotes.map(quote => {
                const hasUserScored = quote.scores?.some(s => s.scorerId === user.id);
                const isPerItemStrategy = (requisition.rfqSettings as any)?.awardStrategy === 'item';
                const thisVendorItemStatuses = itemStatuses.filter(s => s.vendorId === quote.vendorId);
                const mainStatus = getOverallStatusForVendor(quote);

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
                                        <FileText className="mr-2 h-4 w-4"/> View Bid Document
                                    </a>
                                </Button>
                            )}
                             {!isMasked && quote.experienceDocumentUrl && (
                                <Button asChild variant="outline" size="sm" className="w-full">
                                    <a href={quote.experienceDocumentUrl} target="_blank" rel="noopener noreferrer">
                                        <UserCog className="mr-2 h-4 w-4"/> View Experience Document
                                    </a>
                                </Button>
                            )}
                            {(!isMasked && (isDeadlinePassed || quote.cpoDocumentUrl)) ? (
                                <>
                                    {hidePrices ? (
                                        <div className="text-center py-4">
                                            <p className="font-semibold text-muted-foreground">Pricing information is hidden for technical evaluation.</p>
                                        </div>
                                    ) : (
                                        <>
                                            {isDeadlinePassed && <div className="text-3xl font-bold text-center">{quote.totalPrice.toLocaleString()} ETB</div>}
                                            {isDeadlinePassed && <div className="text-center text-muted-foreground">Est. Delivery: {format(new Date(quote.deliveryDate), 'PP')}</div>}
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
                                                        {typeof item.score === 'number' && <Badge variant="outline" className="font-mono">{item.score.toFixed(2)} pts</Badge>}
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

                             {isAwarded && typeof quote.finalAverageScore === 'number' && !isPerItemStrategy && (
                                 <div className="text-center pt-2 border-t">
                                    <h4 className="font-semibold text-sm">Final Score</h4>
                                    <p className="text-2xl font-bold text-primary">{quote.finalAverageScore.toFixed(2)}</p>
                                 </div>
                             )}
                        </CardContent>
                        <CardFooter className="flex flex-col gap-2">
                            <Button className="w-full" variant="outline" onClick={() => onViewDetails(quote)} disabled={isMasked}>
                                <Eye className="mr-2 h-4 w-4" /> {isMasked ? 'Sealed' : 'View Full Quote'}
                            </Button>
                             {isAssignedCommitteeMember && isDeadlinePassed && (
                                    <Button className="w-full" variant={hasUserScored ? "secondary" : "default"} onClick={() => onScore(quote, !!hidePrices)} disabled={isScoringDeadlinePassed && !hasUserScored}>
                                    {hasUserScored ? <Check className="mr-2 h-4 w-4"/> : <Edit2 className="mr-2 h-4 w-4" />}
                                    {hasUserScored ? 'View Your Score' : 'Score this Quote'}
                                </Button>
                            )}
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
    const [inputs, setInputs] = React.useState<Record<string,string>>({});
    const isRfqSender = (user && ((user.roles as any[]).some(r => (typeof r === 'string' ? r === 'Procurement_Officer' : r.name === 'Procurement_Officer')) || (user.roles as any[]).some(r => (typeof r === 'string' ? r === 'Admin' : r.name === 'Admin'))));

    const DIRECTOR_ROLES = ['Finance_Director','Facility_Director','Director_Supply_Chain_and_Property_Management'];

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
    const isDirectorUser = user && DIRECTOR_ROLES.some(rn => (user.roles as any[]).some((x:any) => (typeof x === 'string' ? x === rn : x.name === rn)));

    const verifiedDistinctCount = React.useMemo(() => {
        const usedByIds = new Set((pins || []).filter((p:any) => p.used && p.usedById).map((p:any) => p.usedById));
        return usedByIds.size;
    }, [pins]);

    const directorRecipients = React.useMemo(() => {
        const byKey = new Map<string, { recipient: any; roleName: string }>();
        (pins || []).forEach((p:any) => {
            if (!DIRECTOR_ROLES.includes(p.roleName)) return;
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
                                    } catch (e:any) {
                                        toast({ variant: 'destructive', title: 'Error', description: e?.message || 'Failed to set threshold' });
                                    }
                                }} disabled={!isRfqSender || isPresenceVerified}>Save</Button>
                            </div>
                        </div>
                        {(directorRecipients.length > 0 ? directorRecipients : DIRECTOR_ROLES.map(rn => ({ roleName: rn, recipient: undefined } as any))).map((entry: any) => {
                            const rn = entry.roleName as string;
                            const recipient = entry.recipient as any | undefined;
                            const recipientId = recipient?.id as string | undefined;
                            const personVerified = recipientId
                                ? (pins || []).some((p:any) => p.roleName === rn && p.used && p.usedById && p.usedById === recipientId)
                                : false;
                            const canVerify = Boolean(user && (user.id === recipientId));

                            return (
                                <div key={`${rn}:${recipientId || 'none'}`} className="border rounded p-3">
                                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                                        {rn.replace(/_/g, ' ')}
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
                                            {(pins || []).filter((p:any) => p.roleName === rn && (!recipientId || p.recipient?.id === recipientId)).slice(0, 5).map((p:any) => (
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
  financialCommitteeMemberIds: z.array(z.string()).min(1, "At least one financial member is required."),
  technicalCommitteeMemberIds: z.array(z.string()).optional(),
});

type CommitteeFormValues = z.infer<typeof committeeFormSchema>;

const EvaluationCommitteeManagement = ({ requisition, onCommitteeUpdated, open, onOpenChange, isAuthorized, isEditDisabled }: { requisition: PurchaseRequisition; onCommitteeUpdated: () => void; open: boolean; onOpenChange: (open: boolean) => void; isAuthorized: boolean; isEditDisabled: boolean }) => {
    const { user, allUsers, token } = useAuth();
    const { toast } = useToast();
    const [isSubmitting, setSubmitting] = useState(false);
    const [deadlineDate, setDeadlineDate] = useState<Date|undefined>(
        requisition.scoringDeadline ? new Date(requisition.scoringDeadline) : undefined
    );
    const [deadlineTime, setDeadlineTime] = useState(
        requisition.scoringDeadline ? format(new Date(requisition.scoringDeadline), 'HH:mm') : '17:00'
    );
    const [technicalViewPrices, setTechnicalViewPrices] = useState(requisition.rfqSettings?.technicalEvaluatorSeesPrices ?? false);

    const form = useForm<CommitteeFormValues>({
        resolver: zodResolver(committeeFormSchema),
        defaultValues: {
            committeeName: requisition.committeeName || "",
            committeePurpose: requisition.committeePurpose || "",
            financialCommitteeMemberIds: requisition.financialCommitteeMemberIds || [],
            technicalCommitteeMemberIds: requisition.technicalCommitteeMemberIds || [],
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
        });
        if (requisition.scoringDeadline) {
            setDeadlineDate(new Date(requisition.scoringDeadline));
            setDeadlineTime(format(new Date(requisition.scoringDeadline), 'HH:mm'));
        }
        setTechnicalViewPrices(requisition.rfqSettings?.technicalEvaluatorSeesPrices ?? false);
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
            const response = await fetch(`/api/requisitions/${requisition.id}/assign-committee`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    userId: user.id,
                    ...values,
                    scoringDeadline: finalDeadline,
                    rfqSettings: {
                        ...requisition.rfqSettings,
                        technicalEvaluatorSeesPrices: technicalViewPrices
                    }
                }),
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

    const committeeMembers = useMemo(() => allUsers.filter(u => (u.roles as any[])?.some(r => r.name === 'Committee_Member')), [allUsers]);
    const assignedFinancialMembers = useMemo(() => allUsers.filter(u => requisition.financialCommitteeMemberIds?.includes(u.id)), [allUsers, requisition]);
    const assignedTechnicalMembers = useMemo(() => allUsers.filter(u => requisition.technicalCommitteeMemberIds?.includes(u.id)), [allUsers, requisition]);
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

    const MemberSelection = ({ type }: { type: 'financial' | 'technical' }) => {
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
                    name={`${type}CommitteeMemberIds`}
                    render={() => (
                    <FormItem className="flex-1 flex flex-col min-h-0">
                        <ScrollArea className="flex-1 rounded-md border h-60">
                            <div className="space-y-1 p-1">
                            {availableMembers.map(member => (
                                <FormField
                                    key={member.id}
                                    control={form.control}
                                    name={`${type}CommitteeMemberIds`}
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
                                        <FormLabel>Committee Scoring Deadline</FormLabel>
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
                                                        disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))}
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
                                            <Label htmlFor="technical-view-prices">Allow technical evaluators to see prices</Label>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid md:grid-cols-2 gap-6">
                                     <div>
                                        <h3 className="font-semibold text-lg">Financial Committee</h3>
                                        <MemberSelection type="financial" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-lg">Technical Committee</h3>
                                        <MemberSelection type="technical" />
                                    </div>
                                </div>
                        </div>
                        <DialogFooter className="pt-4 border-t mt-4">
                            <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                                Save Committee
                            </Button>
                        </DialogFooter>
                        </form>
                        </Form>
                    </DialogContent>
                </Dialog>
            </CardHeader>
            <CardContent className="space-y-6">
                 <MemberList title="Financial Committee" description="Responsible for evaluating cost and financial stability." members={assignedFinancialMembers} />
                 <MemberList title="Technical Committee" description="Responsible for assessing technical specs and compliance." members={assignedTechnicalMembers} />
                 {requisition.scoringDeadline && (
                    <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground border-t pt-4">
                        <Timer className="h-4 w-4"/>
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
            toast({ variant: 'destructive', title: 'Error', description: 'A reason must be provided.'});
            return;
        }
        if (action === 'update' && (!finalNewDeadline || isBefore(finalNewDeadline, new Date()))) {
            toast({ variant: 'destructive', title: 'Error', description: 'The new deadline must be in the future.'});
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
            toast({ title: 'Success', description: `The RFQ has been successfully ${action === 'update' ? 'updated' : 'managed'}.`});
            onSuccess();
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: error instanceof Error ? error.message : 'An unknown error occurred.'});
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
                                            disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))}
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
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
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
    const [deadlineDate, setDeadlineDate] = useState<Date|undefined>();
    const [deadlineTime, setDeadlineTime] = useState('17:00');
    const [cpoAmount, setCpoAmount] = useState<number | undefined>(requisition.cpoAmount);

    const [allowQuoteEdits, setAllowQuoteEdits] = useState(requisition.rfqSettings?.allowQuoteEdits ?? true);
    const [experienceDocumentRequired, setExperienceDocumentRequired] = useState(requisition.rfqSettings?.experienceDocumentRequired ?? false);
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
    }, [requisition]);

    const deadline = useMemo(() => {
        if (!deadlineDate || !deadlineTime) return undefined;
        const [hours, minutes] = deadlineTime.split(':').map(Number);
        return setMinutes(setHours(deadlineDate, hours), minutes);
    }, [deadlineDate, deadlineTime]);


    const handleSendRFQ = async () => {
        if (!user || !deadline || !token) return;

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
                        experienceDocumentRequired
                    }
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
            </CardHeader>
            <CardContent className="space-y-4">
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
                                    disabled={(date) => date < new Date(new Date().setHours(0,0,0,0)) || !canTakeAction}
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
    const [actionDialog, setActionDialog] = useState<{isOpen: boolean, type: 'update' | 'cancel' | 'restart'}>({isOpen: false, type: 'update'});
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
                    <Button variant="outline" onClick={() => setActionDialog({isOpen: true, type: 'update'})}><Settings2 className="mr-2"/> Update RFQ</Button>
                    <Button variant="destructive" onClick={() => setActionDialog({isOpen: true, type: 'cancel'})}><Ban className="mr-2"/> Cancel RFQ</Button>
                </CardFooter>
            </Card>
            <RFQActionDialog
                action={actionDialog.type}
                requisition={requisition}
                isOpen={actionDialog.isOpen}
                onClose={() => setActionDialog({isOpen: false, type: 'update'})}
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
                    {rfqState === 'completed' ? <Check className="h-4 w-4"/> : '1'}
                </div>
                <span className={cn("font-medium", textClasses[rfqState])}>Send RFQ</span>
            </div>
             <div className={cn("h-px flex-1 bg-border transition-colors", (committeeState === 'active' || committeeState === 'completed') && "bg-primary")}></div>

            <div className="flex items-center gap-2">
                <div className={cn("flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold", stateClasses[committeeState])}>
                    {committeeState === 'completed' ? <Check className="h-4 w-4"/> : '2'}
                </div>
                <span className={cn("font-medium", textClasses[committeeState])}>Assign Committee &amp; Score</span>
            </div>
             <div className={cn("h-px flex-1 bg-border transition-colors", (awardState === 'active' || awardState === 'completed') && "bg-primary")}></div>

            <div className="flex items-center gap-2">
                <div className={cn("flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold", stateClasses[awardState])}>
                    {awardState === 'completed' ? <Check className="h-4 w-4"/> : '3'}
                </div>
                <span className={cn("font-medium", textClasses[awardState])}>Award</span>
            </div>
            <div className={cn("h-px flex-1 bg-border transition-colors", (finalizeState === 'active' || finalizeState === 'completed') && "bg-primary")}></div>
             <div className="flex items-center gap-2">
                <div className={cn("flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold", stateClasses[finalizeState])}>
                    {finalizeState === 'completed' ? <Check className="h-4 w-4"/> : '4'}
                </div>
                <span className={cn("font-medium", textClasses[finalizeState])}>Finalize</span>
            </div>
        </div>
    );
};

const scoreFormSchema = z.object({
  committeeComment: z.string().min(1, "An overall comment is required."),
  itemScores: z.array(z.object({
      quoteItemId: z.string(),
      financialScores: z.array(z.object({
      criterionId: z.string(),
      score: z.coerce.number().min(0).max(100),
      comment: z.string().min(1, "A comment is required for this criterion."),
      })).optional(),
      technicalScores: z.array(z.object({
      criterionId: z.string(),
      score: z.coerce.number().min(0).max(100),
      comment: z.string().min(1, "A comment is required for this criterion."),
      })).optional(),
  }))
});
type ScoreFormValues = z.infer<typeof scoreFormSchema>;


const ScoringItemCard = ({ itemIndex, control, quoteItem, originalItem, requisition, isFinancialScorer, isTechnicalScorer, hidePrices, existingScore }: {
    itemIndex: number;
    control: Control<ScoreFormValues>;
    quoteItem: QuoteItem;
    originalItem?: PurchaseRequisition['items'][0];
    requisition: PurchaseRequisition;
    isFinancialScorer: boolean;
    isTechnicalScorer: boolean;
    hidePrices: boolean;
    existingScore?: CommitteeScoreSet;
}) => {
    const { fields: financialScoreFields } = useFieldArray({ control, name: `itemScores.${itemIndex}.financialScores` });
    const { fields: technicalScoreFields } = useFieldArray({ control, name: `itemScores.${itemIndex}.technicalScores` });

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
                                    <Image src={quoteItem.imageUrl} alt={quoteItem.name} fill style={{objectFit:"contain"}} className="rounded-md" />
                                </div>
                            </DialogTrigger>
                            <DialogContent className="max-w-4xl h-[80vh]">
                                <DialogHeader>
                                <DialogTitle>{quoteItem.name}</DialogTitle>
                                </DialogHeader>
                                <div className="relative w-full h-full">
                                <Image src={quoteItem.imageUrl} alt={quoteItem.name} fill style={{objectFit:"contain"}} />
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

                <Separator/>

                {isFinancialScorer && !hidePrices && (
                    <div className="space-y-4">
                        <h4 className="font-semibold text-lg flex items-center gap-2"><Scale /> Financial Evaluation ({requisition.evaluationCriteria?.financialWeight}%)</h4>
                        { financialScoreFields.map((criterionField, criterionIndex) => (
                            <div key={criterionField.id} className="space-y-2 rounded-md border p-4 bg-background">
                                <div className="flex justify-between items-center">
                                    <FormLabel>{requisition.evaluationCriteria?.financialCriteria[criterionIndex].name}</FormLabel>
                                    <Badge variant="secondary">Weight: {requisition.evaluationCriteria?.financialCriteria[criterionIndex].weight}%</Badge>
                                </div>
                                <FormField
                                    control={form.control}
                                    name={`itemScores.${itemIndex}.financialScores.${criterionIndex}.score`}
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormControl>
                                                <div className="flex items-center gap-4">
                                                    <Slider
                                                        defaultValue={[field.value]}
                                                        max={100}
                                                        step={1}
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
                                    name={`itemScores.${itemIndex}.financialScores.${criterionIndex}.comment`}
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormControl>
                                                <Textarea placeholder="A comment for this criterion is required..." {...field} rows={2} disabled={!!existingScore} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        ))}
                    </div>
                )}
                {isTechnicalScorer && (
                    <div className="space-y-4">
                        <h4 className="font-semibold text-lg flex items-center gap-2"><TrendingUp /> Technical Evaluation ({requisition.evaluationCriteria?.technicalWeight}%)</h4>
                        {technicalScoreFields.map((criterionField, criterionIndex) => (
                            <div key={criterionField.id} className="space-y-2 rounded-md border p-4 bg-background">
                                <div className="flex justify-between items-center">
                                    <FormLabel>{requisition.evaluationCriteria?.technicalCriteria[criterionIndex].name}</FormLabel>
                                    <Badge variant="secondary">Weight: {requisition.evaluationCriteria?.technicalCriteria[criterionIndex].weight}%</Badge>
                                </div>
                                 <FormField
                                    control={form.control}
                                    name={`itemScores.${itemIndex}.technicalScores.${criterionIndex}.score`}
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormControl>
                                                <div className="flex items-center gap-4">
                                                    <Slider
                                                        defaultValue={[field.value]}
                                                        max={100}
                                                        step={1}
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
                                    name={`itemScores.${itemIndex}.technicalScores.${criterionIndex}.comment`}
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormControl>
                                                <Textarea placeholder="A comment for this criterion is required..." {...field} rows={2} disabled={!!existingScore} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        ))}
                    </div>
                )}
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
        defaultValues: {}, // Initialize empty
    });

    const { control: formControl } = form;
    const { fields: itemScoreFields } = useFieldArray({ control: formControl, name: "itemScores" });

    const existingScore = useMemo(() => quote.scores?.find(s => s.scorerId === user.id), [quote, user.id]);
    const isFinancialScorer = requisition.financialCommitteeMemberIds?.includes(user.id) ?? false;
    const isTechnicalScorer = requisition.technicalCommitteeMemberIds?.includes(user.id) ?? false;

    useEffect(() => {
        if (quote && requisition && user) {
            const initialItemScores = quote.items.map(item => {
                const existingItemScore = existingScore?.itemScores.find(i => i.quoteItemId === item.id);
                return {
                    quoteItemId: item.id,
                    financialScores: isFinancialScorer ? (requisition.evaluationCriteria?.financialCriteria || []).map(c => {
                        const existing = existingItemScore?.scores.find(s => s.financialCriterionId === c.id);
                        return { criterionId: c.id, score: existing?.score || 0, comment: existing?.comment || "" };
                    }) : [],
                    technicalScores: isTechnicalScorer ? (requisition.evaluationCriteria?.technicalCriteria || []).map(c => {
                        const existing = existingItemScore?.scores.find(s => s.technicalCriterionId === c.id);
                        return { criterionId: c.id, score: existing?.score || 0, comment: existing?.comment || "" };
                    }) : [],
                };
            });
            form.reset({
                committeeComment: existingScore?.committeeComment || "",
                itemScores: initialItemScores,
            });
        }
    }, [quote, requisition, user, form, existingScore, isFinancialScorer, isTechnicalScorer]);


    const onSubmit = async (values: ScoreFormValues) => {
        if (!token) return;
        setSubmitting(true);
        try {
            const response = await fetch(`/api/quotations/${quote.id}/score`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
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
                    <DialogTitle>Scoring Deadline Passed</DialogTitle>
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
                <DialogTitle>Score Quotation from {quote.vendorName}</DialogTitle>
                <DialogDescription>Evaluate each item in the quote against the requester's criteria.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="flex-1 min-h-0 flex flex-col">
                <ScrollArea className="flex-1 pr-4 -mr-4">
                     <div className="space-y-6">
                        <div className="flex gap-2">
                             {quote.bidDocumentUrl && (
                                 <Button asChild variant="outline" size="sm" className="w-full">
                                     <a href={quote.bidDocumentUrl} target="_blank" rel="noopener noreferrer">
                                         <FileText className="mr-2 h-4 w-4"/> View Bid Document
                                     </a>
                                 </Button>
                            )}
                            {quote.experienceDocumentUrl && (
                                <Button asChild variant="outline" size="sm" className="w-full">
                                    <a href={quote.experienceDocumentUrl} target="_blank" rel="noopener noreferrer">
                                        <UserCog className="mr-2 h-4 w-4"/> View Experience Document
                                    </a>
                                </Button>
                            )}
                        </div>
                        {quote.answers && quote.answers.length > 0 && (
                            <Card className="bg-muted/30">
                                <CardHeader>
                                    <CardTitle className="text-lg flex items-center gap-2"><MessageSquare/>Vendor's Answers</CardTitle>
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
                            {itemScoreFields.map((field, itemIndex) => {
                                const itemScoreData = form.getValues().itemScores[itemIndex];
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
                                                isFinancialScorer={isFinancialScorer}
                                                isTechnicalScorer={isTechnicalScorer}
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
                                    Submit Final Score
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
                <CardTitle className="flex items-center gap-2"><GanttChart /> Scoring Progress</CardTitle>
                <CardDescription>Track the committee's scoring progress. The award can be finalized once all members have submitted their scores for all quotations.</CardDescription>
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
                                {member.hasSubmittedFinalScores && member.submittedAt ? (
                                    <div className="text-right flex-1">
                                        <Badge variant="default" className="bg-green-600"><Check className="mr-1 h-3 w-3" /> Submitted</Badge>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {formatDistanceToNow(new Date(member.submittedAt), { addSuffix: true })}
                                        </p>
                                    </div>
                                ) : member.isOverdue ? (
                                    <>
                                     <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" />Overdue</Badge>
                                     <Button size="sm" variant="secondary" onClick={()=>{ setSelectedMember(member); setExtendDialogOpen(true); }}>Extend</Button>
                                     <Button size="sm" variant="secondary" onClick={() => onCommitteeUpdate(true)}>Replace</Button>
                                     <Button size="sm" variant="outline" onClick={()=>{ setSelectedMember(member); setReportDialogOpen(true); }}>Report</Button>
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
        switch(rank) {
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
                                            <TableHeader><TableRow><TableHead>Rank</TableHead><TableHead>Vendor</TableHead><TableHead className="text-right">Final Score</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                                            <TableBody>
                                                {quotations.sort((a,b) => (b.finalAverageScore || 0) - (a.finalAverageScore || 0)).map(q => (
                                                    <TableRow key={q.id}>
                                                        <TableCell className="font-bold flex items-center gap-1">{getRankIcon(q.rank)} {q.rank}</TableCell>
                                                        <TableCell>{q.vendorName}</TableCell>
                                                        <TableCell className="text-right font-mono">{q.finalAverageScore?.toFixed(2)}</TableCell>
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
                                                        const awards = (item.perItemAwardDetails || []).sort((a,b) => a.rank - b.rank);
                                                        return (
                                                                <div key={item.id} className="p-4 border-b last:border-b-0">
                                                                    <h4 className="font-semibold">{item.name}</h4>
                                                                    <Table>
                                                                        <TableHeader><TableRow><TableHead>Rank</TableHead><TableHead>Vendor</TableHead><TableHead>Proposed Item</TableHead><TableHead className="text-right">Score</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                                                                        <TableBody>
                                                                            {awards.map(award => (
                                                                                <TableRow key={award.quoteItemId}>
                                                                                    <TableCell className="font-bold flex items-center gap-1">{getRankIcon(award.rank)} {award.rank}</TableCell>
                                                                                    <TableCell>{award.vendorName}</TableCell>
                                                                                    <TableCell>{award.proposedItemName}</TableCell>
                                                                                    <TableCell className="text-right font-mono">{award.score.toFixed(2)}</TableCell>
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

                             <Separator className="my-6"/>

                            <Accordion type="single" collapsible className="w-full" defaultValue="scoring-report">
                                <AccordionItem value="scoring-report" className="border-none">
                                    <AccordionTrigger className="text-lg font-semibold">Evaluation Committee Scoring Report</AccordionTrigger>
                                    <AccordionContent>
                                     <Card>
                                         <CardContent className="p-4">
                                             <Accordion type="multiple" className="w-full space-y-4">
                                                 {quotations.sort((a,b) => (b.finalAverageScore || 0) - (a.finalAverageScore || 0)).map(quote => (
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
                        {isGeneratingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Printer className="mr-2 h-4 w-4"/>}
                        Print / Export PDF
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
    


const ExtendDeadlineDialog = ({ isOpen, onClose, member, requisition, onSuccess }: { isOpen: boolean, onClose: () => void, member: User, requisition: PurchaseRequisition, onSuccess: () => void }) => {
    const { toast } = useToast();
    const { user } = useAuth();
    const [isSubmitting, setSubmitting] = useState(false);
    const [newDeadline, setNewDeadline] = useState<Date|undefined>();
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
                    <DialogTitle>Extend Scoring Deadline</DialogTitle>
                    <DialogDescription>Set a new scoring deadline for all committee members of this requisition.</DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    <div className="space-y-2">
                        <Label>New Scoring Deadline</Label>
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
                                    <Calendar mode="single" selected={newDeadline} onSelect={setNewDeadline} disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))} initialFocus/>
                                </PopoverContent>
                            </Popover>
                            <Input type="time" className="w-32" value={newDeadlineTime} onChange={(e) => setNewDeadlineTime(e.target.value)}/>
                        </div>
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
    
    const userScoredQuotesCount = requisition.quotations?.filter(q => q.scores?.some(s => s.scorerId === user.id)).length || 0;
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
                toast({ title: 'Scores Submitted', description: 'Your final scores were already submitted.'});
                onFinalScoresSubmitted();
                return;
            }

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to submit scores');
            }
            toast({ title: 'Scores Submitted', description: 'Your final scores have been recorded.'});
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
                    <CardDescription>Finalize your evaluation for this requisition.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button variant="outline" disabled>
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Scores Submitted
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
                <p className="text-sm text-muted-foreground">You have scored {userScoredQuotesCount} of {requisition.quotations?.length || 0} quotes.</p>
            </CardContent>
            <CardFooter>
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button disabled={!allQuotesScored || isSubmitting || scoresFinalized}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Submit Final Scores
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
  const [hidePricesForScoring, setHidePricesForScoring] = useState(false);
  const [isChangingAward, setIsChangingAward] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isReportOpen, setReportOpen] = useState(false);
  const [actionDialog, setActionDialog] = useState<{isOpen: boolean, type: 'update' | 'cancel' | 'restart'}>({isOpen: false, type: 'restart'});
  const [currentQuotesPage, setCurrentQuotesPage] = useState(1);
  const [committeeTab, setCommitteeTab] = useState<'pending' | 'scored'>('pending');
  const [isRestartRfqOpen, setIsRestartRfqOpen] = useState(false);
  const [isSingleAwardCenterOpen, setSingleAwardCenterOpen] = useState(false);
  const [isBestItemAwardCenterOpen, setBestItemAwardCenterOpen] = useState(false);
  const [deadlineCheckPerformed, setDeadlineCheckPerformed] = useState(false);


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
    return deadlinePassed && hasEnoughQuotes && requisition.status === 'Accepting_Quotes';
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
    
    if (requisition.status === 'Accepting_Quotes' && isDeadlinePassed) return 'committee';
    
    return 'rfq';
  }, [requisition, isAccepted, isDeadlinePassed, readyForCommitteeAssignment]);
  
  const { pendingQuotes, scoredQuotes } = useMemo(() => {
    if (!user || !(user.roles as string[]).some(r => r.includes('Committee')) ) return { pendingQuotes: quotations, scoredQuotes: [] };
    const pending = quotations.filter(q => !q.scores?.some(s => s.scorerId === user.id));
    const scored = quotations.filter(q => q.scores?.some(s => s.scorerId === user.id));
    return { pendingQuotes: pending, scoredQuotes: scored };
  }, [quotations, user]);
  
  const quotesForDisplay = (user && (user.roles as string[]).some(r => r.includes('Committee')) && committeeTab === 'pending') ? pendingQuotes : (user && (user.roles as string[]).some(r => r.includes('Committee')) && committeeTab === 'scored') ? scoredQuotes : quotations;
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
                  const itemBids: {requisitionItemId: string; championBidScore: number;}[] = [];

                  for (const reqItem of currentReq.items) {
                      const proposalsForItem = quote.items.filter(item => item.requisitionItemId === reqItem.id);
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

            setRequisition({...currentReq, quotations: quoData});
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
}

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
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to notify vendor.");
      }

      toast({
        title: "Vendor Notified",
        description: "The winning vendor has been notified and the award is pending their response."
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
  const isReadyForNotification = requisition?.status === 'PostApproved';
  const noBidsAndDeadlinePassed = isDeadlinePassed && quotations.length === 0 && requisition?.status === 'Accepting_Quotes';
  const quorumNotMetAndDeadlinePassed = isDeadlinePassed && !isAwarded && quotations.length > 0 && quotations.length < committeeQuorum;
  
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
                {canViewCumulativeReport && (
                    <Button variant="secondary" onClick={() => setReportOpen(true)}>
                        <FileBarChart2 className="mr-2 h-4 w-4" /> View Scoring Report
                    </Button>
                )}
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
                    <CardTitle className="flex items-center gap-2 text-amber-600"><AlertTriangle/> RFQ Closed: No Bids Received</CardTitle>
                    <CardDescription>The deadline for this Request for Quotation has passed and no vendors submitted a bid.</CardDescription>
                </CardHeader>
                <CardFooter className="gap-2">
                    <Button onClick={() => setActionDialog({isOpen: true, type: 'restart'})}>
                        <RefreshCw className="mr-2 h-4 w-4" /> Restart RFQ
                    </Button>
                    <Button variant="destructive" onClick={() => setActionDialog({isOpen: true, type: 'cancel'})}>
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
                            <EvaluationCommitteeManagement
                                requisition={requisition}
                                onCommitteeUpdated={fetchRequisitionAndQuotes}
                                open={isCommitteeDialogOpen}
                                onOpenChange={setCommitteeDialogOpen}
                                isAuthorized={isAuthorized}
                                isEditDisabled={isScoringDeadlinePassed || isAwarded}
                            />
                        )}
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        )}

        {(currentStep !== 'rfq') && (
            <Accordion type="single" collapsible className="w-full" defaultValue="quotation-overview">
                 <AccordionItem value="quotation-overview">
                    <AccordionTrigger>
                        <CardTitle className="flex items-center gap-2 text-lg"><FileBadge/> Quotation Overview</CardTitle>
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
                                            <CalendarIcon className="h-4 w-4"/>
                                            <span>Quote Deadline:</span>
                                            <span className="font-semibold text-foreground">{format(new Date(requisition.deadline), 'PPpp')}</span>
                                        </div>
                                    )}
                                    {requisition.scoringDeadline && (
                                        <div className="flex items-center gap-1.5 font-medium text-muted-foreground">
                                            <Timer className="h-4 w-4"/>
                                            <span>Scoring Deadline:</span>
                                            <span className="font-semibold text-foreground">{format(new Date(requisition.scoringDeadline), 'PPpp')}</span>
                                        </div>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent>
                                {loading ? (
                                    <div className="flex items-center justify-center h-24">
                                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                    </div>
                                ) : (
                                    <Tabs value={committeeTab} onValueChange={(value) => setCommitteeTab(value as any)} defaultValue="pending">
                                        {user && (user.roles as string[]).some(r => r.includes('Committee')) && <TabsList className="mb-4">
                                            <TabsTrigger value="pending">Pending Your Score ({pendingQuotes.length})</TabsTrigger>
                                            <TabsTrigger value="scored">Scored by You ({scoredQuotes.length})</TabsTrigger>
                                        </TabsList>}
                                        <TabsContent value="pending">
                                            <QuoteComparison quotes={quotesForDisplay} requisition={requisition} onViewDetails={handleViewDetailsClick} onScore={handleScoreButtonClick} user={user!} role={role} isDeadlinePassed={isDeadlinePassed} isScoringDeadlinePassed={isScoringDeadlinePassed} itemStatuses={itemStatuses} isAwarded={isAwarded} isScoringComplete={isScoringComplete} isAssignedCommitteeMember={isAssignedCommitteeMember} readyForCommitteeAssignment={readyForCommitteeAssignment} />
                                        </TabsContent>
                                        <TabsContent value="scored">
                                            <QuoteComparison quotes={quotesForDisplay} requisition={requisition} onViewDetails={handleViewDetailsClick} onScore={handleScoreButtonClick} user={user!} role={role} isDeadlinePassed={isDeadlinePassed} isScoringDeadlinePassed={isScoringDeadlinePassed} itemStatuses={itemStatuses} isAwarded={isAwarded} isScoringComplete={isScoringComplete} isAssignedCommitteeMember={isAssignedCommitteeMember} readyForCommitteeAssignment={readyForCommitteeAssignment} />
                                        </TabsContent>
                                    </Tabs>
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

                            <Dialog open={isScoringFormOpen} onOpenChange={setScoringFormOpen}>
                                {selectedQuoteForScoring && requisition && user && (
                                    <ScoringDialog
                                        quote={selectedQuoteForScoring}
                                        requisition={requisition}
                                        user={user}
                                        onScoreSubmitted={handleScoreSubmitted}
                                        isScoringDeadlinePassed={isScoringDeadlinePassed}
                                        hidePrices={hidePricesForScoring}
                                    />
                                )}
                            </Dialog>
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
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        )}
        
        {isAssignedCommitteeMember && (
             <CommitteeActions
                user={user}
                requisition={requisition}
                onFinalScoresSubmitted={fetchRequisitionAndQuotes}
             />
        )}
        
        {isAuthorized && hasAssignedCommittee && requisition.status !== 'PreApproved' && (
             <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="scoring-progress">
                    <AccordionTrigger>
                        <CardTitle className="flex items-center gap-2 text-lg"><GanttChart /> Scoring Progress</CardTitle>
                    </AccordionTrigger>
                    <AccordionContent>
                        <ScoringProgressTracker
                            requisition={requisition}
                            quotations={quotations}
                            allUsers={allUsers}
                            onSuccess={fetchRequisitionAndQuotes}
                            onCommitteeUpdate={setCommitteeDialogOpen}
                            isFinalizing={isFinalizing}
                            isAuthorized={isAuthorized}
                        />
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
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
            onClose={() => setActionDialog({isOpen: false, type: 'restart'})}
            onSuccess={fetchRequisitionAndQuotes}
        />
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
                <CardTitle className="flex items-center gap-2 text-amber-600"><AlertTriangle/> Quorum Not Met</CardTitle>
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
                                <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal",!newDeadlineDate && "text-muted-foreground")}>
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {newDeadlineDate ? format(newDeadlineDate, "PPP") : <span>Pick a new date</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar mode="single" selected={newDeadlineDate} onSelect={setNewDeadlineDate} disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))} initialFocus/>
                            </PopoverContent>
                        </Popover>
                        <Input type="time" className="w-32" value={newDeadlineTime} onChange={(e) => setNewDeadlineTime(e.target.value)}/>
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
};




