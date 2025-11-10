
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
import { Loader2, PlusCircle, Award, XCircle, FileSignature, FileText, Bot, Lightbulb, ArrowLeft, Star, Undo, Check, Send, Search, BadgeHelp, BadgeCheck, BadgeX, Crown, Medal, Trophy, RefreshCw, TimerOff, ClipboardList, TrendingUp, Scale, Edit2, Users, GanttChart, Eye, CheckCircle, CalendarIcon, Timer, Landmark, Settings2, Ban, Printer, FileBarChart2, UserCog, History, AlertTriangle, FileUp, TrophyIcon, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react';
import { useForm, useFieldArray, FormProvider, useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { PurchaseOrder, PurchaseRequisition, Quotation, Vendor, QuotationStatus, EvaluationCriteria, User, CommitteeScoreSet, EvaluationCriterion, QuoteItem } from '@/lib/types';
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
import { AwardCenterDialog } from '@/components/award-center-dialog';
import { AwardStandbyButton } from '@/components/award-standby-button';
import { BestItemAwardDialog } from '@/components/best-item-award-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';


const PAGE_SIZE = 6;

const quoteFormSchema = z.object({
  notes: z.string().optional(),
  items: z.array(z.object({
    requisitionItemId: z.string(),
    name: z.string().min(1, "Item name cannot be empty."),
    quantity: z.number(),
    unitPrice: z.coerce.number().min(0.01, "Price is required."),
    leadTimeDays: z.coerce.number().min(0, "Lead time is required."),
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
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                                                <FormLabel>Lead Time (Days)</FormLabel>
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

const QuoteComparison = ({ quotes, requisition, onScore, user, isDeadlinePassed, isScoringDeadlinePassed, isAwarded, isAssigned }: { quotes: Quotation[], requisition: PurchaseRequisition, onScore: (quote: Quotation, hidePrices: boolean) => void, user: User, isDeadlinePassed: boolean, isScoringDeadlinePassed: boolean, isAwarded: boolean, isAssigned: boolean }) => {

    if (quotes.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed rounded-lg bg-muted/30">
                <BadgeHelp className="h-16 w-16 text-muted-foreground/50" />
                <h3 className="mt-6 text-xl font-semibold">No Quotes Yet</h3>
                <p className="mt-2 text-sm text-muted-foreground">No vendors have submitted a quotation for this requisition.</p>
            </div>
        );
    }
    
    const getStatusVariant = (status: QuotationStatus) => {
        switch (status) {
            case 'Awarded': return 'default';
            case 'Accepted': return 'default';
            case 'Standby': return 'secondary';
            case 'Submitted': return 'outline';
            case 'Rejected': return 'destructive';
            case 'Declined': return 'destructive';
            case 'Failed': return 'destructive';
            case 'Invoice_Submitted': return 'outline';
            case 'Partially_Awarded': return 'default';
            case 'Pending_Award': return 'secondary';
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
    
    const isTechnicalOnlyScorer = user.role.name === 'Committee_Member' && requisition.technicalCommitteeMemberIds?.includes(user.id) && !requisition.financialCommitteeMemberIds?.includes(user.id);
    const hidePrices = isTechnicalOnlyScorer && !requisition.rfqSettings?.technicalEvaluatorSeesPrices;


    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {quotes.map(quote => {
                const hasUserScored = quote.scores?.some(s => s.scorerId === user.id);
                const awardedItemsForThisQuote = quote.items.filter(item => requisition.awardedQuoteItemIds.includes(item.id));
                
                return (
                    <Card key={quote.id} className={cn("flex flex-col", (quote.status === 'Awarded' || quote.status === 'Accepted' || quote.status === 'Partially_Awarded' || quote.status === 'Pending_Award') && 'border-primary ring-2 ring-primary')}>
                       <CardHeader>
                            <CardTitle className="flex justify-between items-start">
                               <div className="flex items-center gap-2">
                                 {isDeadlinePassed && getRankIcon(quote.rank)}
                                 <span>{quote.vendorName}</span>
                               </div>
                               <Badge variant={getStatusVariant(quote.status)}>{quote.status.replace(/_/g, ' ')}</Badge>
                            </CardTitle>
                            <CardDescription>
                                <span className="text-xs">Submitted {formatDistanceToNow(new Date(quote.createdAt), { addSuffix: true })}</span>
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex-grow space-y-4">
                             {(isDeadlinePassed || quote.cpoDocumentUrl) ? (
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

                                    
                                    {quote.cpoDocumentUrl && (
                                        <div className="text-sm space-y-1 pt-2 border-t">
                                            <h4 className="font-semibold">CPO Document</h4>
                                            <Button asChild variant="link" className="p-0 h-auto">
                                                <a href={quote.cpoDocumentUrl} target="_blank" rel="noopener noreferrer">{quote.cpoDocumentUrl.split('/').pop()}</a>
                                            </Button>
                                        </div>
                                    )}
                                     {quote.experienceDocumentUrl && (
                                        <div className="text-sm space-y-1 pt-2 border-t">
                                            <h4 className="font-semibold">Experience Document</h4>
                                            <Button asChild variant="link" className="p-0 h-auto">
                                                <a href={quote.experienceDocumentUrl} target="_blank" rel="noopener noreferrer">{quote.experienceDocumentUrl.split('/').pop()}</a>
                                            </Button>
                                        </div>
                                    )}

                                    {isAwarded && awardedItemsForThisQuote.length > 0 && (
                                        <div className="text-sm space-y-2 pt-2 border-t">
                                            <h4 className="font-semibold text-green-600">Winning Items:</h4>
                                            {awardedItemsForThisQuote.map(item => (
                                                <div key={item.id} className="flex justify-between items-center text-muted-foreground">
                                                    <span>{item.name} x {item.quantity}</span>
                                                    {!hidePrices && <span className="font-mono">{item.unitPrice.toFixed(2)} ETB ea.</span>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="text-center py-8">
                                    <TimerOff className="h-8 w-8 mx-auto text-muted-foreground" />
                                    <p className="font-semibold mt-2">Details Masked</p>
                                    <p className="text-sm text-muted-foreground">Revealed after {format(new Date(requisition.deadline!), 'PPp')}</p>
                                </div>
                            )}

                            {quote.notes && (
                                <div className="text-sm space-y-1 pt-2 border-t">
                                    <h4 className="font-semibold">Notes:</h4>
                                    <p className="text-muted-foreground text-xs italic">{quote.notes}</p>
                                </div>
                            )}
                             {isAwarded && typeof quote.finalAverageScore === 'number' && (
                                 <div className="text-center pt-2 border-t">
                                    <h4 className="font-semibold text-sm">Final Score</h4>
                                    <p className="text-2xl font-bold text-primary">{quote.finalAverageScore.toFixed(2)}</p>
                                 </div>
                             )}
                        </CardContent>
                        <CardFooter className="flex flex-col gap-2">
                            {isAssigned && (
                                <Button className="w-full" variant={hasUserScored ? "secondary" : "outline"} onClick={() => onScore(quote, hidePrices)} disabled={isScoringDeadlinePassed && !hasUserScored}>
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

const committeeFormSchema = z.object({
  committeeName: z.string().min(3, "Committee name is required."),
  committeePurpose: z.string().min(10, "Purpose is required."),
  financialCommitteeMemberIds: z.array(z.string()).min(1, "At least one financial member is required."),
  technicalCommitteeMemberIds: z.array(z.string()).optional(),
}).refine(data => {
    if (!data.technicalCommitteeMemberIds) return true; // No overlap check needed if it's optional and not provided
    const financialIds = new Set(data.financialCommitteeMemberIds);
    const hasOverlap = data.technicalCommitteeMemberIds.some(id => financialIds.has(id));
    return !hasOverlap;
}, {
    message: "A member cannot be on both financial and technical committees.",
    path: ["financialCommitteeMemberIds"],
});

type CommitteeFormValues = z.infer<typeof committeeFormSchema>;

const EvaluationCommitteeManagement = ({ requisition, onCommitteeUpdated, open, onOpenChange, isAuthorized }: { requisition: PurchaseRequisition; onCommitteeUpdated: () => void; open: boolean; onOpenChange: (open: boolean) => void; isAuthorized: boolean; }) => {
    const { user, allUsers } = useAuth();
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
        if (!user || !finalDeadline) {
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
                headers: { 'Content-Type': 'application/json' },
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
    
    const committeeMembers = useMemo(() => allUsers.filter(u => u.role.name === 'Committee_Member'), [allUsers]);
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
        const otherType = type === 'financial' ? 'technical' : 'financial';
        const otherCommitteeIds = new Set(form.watch(`${otherType}CommitteeMemberIds`));

        const availableMembers = useMemo(() => {
            const lowercasedSearch = search.toLowerCase();
            return committeeMembers.filter(member =>
                !otherCommitteeIds.has(member.id) &&
                (member.name.toLowerCase().includes(lowercasedSearch) || member.email.toLowerCase().includes(lowercasedSearch))
            );
        }, [committeeMembers, search, otherCommitteeIds]);

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
        <Button variant="outline" className="w-full sm:w-auto" disabled={!isAuthorized}>
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
    const { user } = useAuth();
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
        if (!user) return;
        if (action !== 'update' && !reason.trim()) {
            toast({ variant: 'destructive', title: 'Error', description: 'A reason must be provided.'});
            return;
        }
        if (action === 'update' && (!finalNewDeadline || isBefore(finalNewDeadline, new Date()))) {
            toast({ variant: 'destructive', title: 'Error', description: 'The new deadline must be in the future.'});
            return;
        }

        
        try {
             const response = await fetch(`/api/requisitions/${requisition.id}/manage-rfq`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
    const { user } = useAuth();
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
        setExperienceDocumentRequired(requisition.rfqSettings?.experienceDocumentRequired ?? false);
    }, [requisition]);

    const deadline = useMemo(() => {
        if (!deadlineDate || !deadlineTime) return undefined;
        const [hours, minutes] = deadlineTime.split(':').map(Number);
        return setMinutes(setHours(deadlineDate, hours), minutes);
    }, [deadlineDate, deadlineTime]);


    const handleSendRFQ = async () => {
        if (!user || !deadline) return;

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
                headers: { 'Content-Type': 'application/json' },
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
        <>
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
                            <AlertTriangle className="h-4 w-4 text-amber-600" />
                            <AlertTitle>Read-Only Mode</AlertTitle>
                            <AlertDescription>
                                You do not have permission to send RFQs based on current system settings.
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
                </CardContent>
                <CardFooter className="flex flex-wrap items-center justify-between gap-2">
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
        </>
    );
};

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
    
    const form = useForm<ScoreFormValues>({
        resolver: zodResolver(scoreFormSchema),
        defaultValues: () => {
            const existingScoreSet = quote.scores?.find(s => s.scorerId === user.id);
            const initialItemScores = quote.items.map(item => {
                const existingItemScore = existingScoreSet?.itemScores.find(i => i.quoteItemId === item.id);
                return {
                    quoteItemId: item.id,
                    financialScores: (requisition.evaluationCriteria?.financialCriteria || []).map(c => {
                        const existing = existingItemScore?.scores.find(s => s.financialCriterionId === c.id);
                        return { criterionId: c.id, score: existing?.score || 0, comment: existing?.comment || "" };
                    }),
                    technicalScores: (requisition.evaluationCriteria?.technicalCriteria || []).map(c => {
                        const existing = existingItemScore?.scores.find(s => s.technicalCriterionId === c.id);
                        return { criterionId: c.id, score: existing?.score || 0, comment: existing?.comment || "" };
                    }),
                };
            });
            return {
                committeeComment: existingScoreSet?.committeeComment || "",
                itemScores: initialItemScores,
            };
        }
    });
    
    useEffect(() => {
        if (!quote || !requisition) return;
        const existingScoreSet = quote.scores?.find(s => s.scorerId === user.id);
        const initialItemScores = quote.items.map(item => {
            const existingItemScore = existingScoreSet?.itemScores.find(i => i.quoteItemId === item.id);
            return {
                quoteItemId: item.id,
                financialScores: (requisition.evaluationCriteria?.financialCriteria || []).map(c => {
                    const existing = existingItemScore?.scores.find(s => s.financialCriterionId === c.id);
                    return { criterionId: c.id, score: existing?.score || 0, comment: existing?.comment || "" };
                }),
                technicalScores: (requisition.evaluationCriteria?.technicalCriteria || []).map(c => {
                    const existing = existingItemScore?.scores.find(s => s.technicalCriterionId === c.id);
                    return { criterionId: c.id, score: existing?.score || 0, comment: existing?.comment || "" };
                }),
            };
        });
        form.reset({
            committeeComment: existingScoreSet?.committeeComment || "",
            itemScores: initialItemScores,
        });

    }, [quote, requisition, user.id, form]);

    const onSubmit = async (values: ScoreFormValues) => {
        setIsSubmitting(true);
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
            setIsSubmitting(false);
        }
    };
    
    if (!requisition.evaluationCriteria) return null;

    const existingScore = useMemo(() => quote.scores?.find(s => s.scorerId === user.id), [quote, user.id]);
    const isFinancialScorer = requisition.financialCommitteeMemberIds?.includes(user.id);
    const isTechnicalScorer = requisition.technicalCommitteeMemberIds?.includes(user.id);

    const { fields: itemScoreFields } = useFieldArray({ control: form.control, name: "itemScores" });

    if (!existingScore && isScoringDeadlinePassed) {
        return (
            <DialogContent>
                <DialogHeader><DialogTitle>Scoring Deadline Passed</DialogTitle></DialogHeader>
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
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 min-h-0 flex flex-col">
                <ScrollArea className="flex-1 pr-4 -mr-4">
                     <div className="space-y-6">
                        {itemScoreFields.map((field, itemIndex) => {
                            const quoteItem = quote.items[itemIndex];
                            const originalItem = requisition.items.find(i => i.id === quoteItem.requisitionItemId);
                            const { fields: financialScoreFields } = useFieldArray({ control: form.control, name: `itemScores.${itemIndex}.financialScores` });
                            const { fields: technicalScoreFields } = useFieldArray({ control: form.control, name: `itemScores.${itemIndex}.technicalScores` });

                            return (
                                <Card key={field.id} className="bg-muted/30">
                                    <CardHeader>
                                        <CardTitle>{quoteItem.name}</CardTitle>
                                        <CardDescription>
                                            Vendor's proposal for requested item: "{originalItem?.name}" (Qty: {quoteItem.quantity})
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        {!hidePrices && 
                                            <p className="font-mono">Unit Price: {quoteItem.unitPrice.toFixed(2)} ETB</p>
                                        }
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
                                                            name={`itemScores.${itemIndex}.financialScores.${criterionIndex}.comment`}
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
                                                            name={`itemScores.${itemIndex}.technicalScores.${criterionIndex}.comment`}
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
                                                ))}
                                            </div>
                                        )}
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
                            <AlertDialogTrigger asChild><Button type="button">Submit Score</Button></AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Confirm Your Score</AlertDialogTitle>
                                    <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Go Back & Edit</AlertDialogCancel>
                                    <AlertDialogAction onClick={form.handleSubmit(onSubmit)} disabled={isSubmitting}>
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
  onFinalize,
  onCommitteeUpdate,
  isFinalizing,
}: {
  requisition: PurchaseRequisition;
  quotations: Quotation[];
  allUsers: User[];
  onFinalize: (awardStrategy: 'all' | 'item', awards: any, awardResponseDeadline?: Date) => void;
  onCommitteeUpdate: (open: boolean) => void;
  isFinalizing: boolean;
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
    
    const allHaveScored = scoringStatus.length > 0 && scoringStatus.every(s => s.hasSubmittedFinalScores);

    const getButtonState = () => {
        if (requisition.status === 'Award_Declined') {
            return { text: "Finalize Scores & Award", disabled: true };
        }
        if (['Awarded', 'Accepted', 'PO_Created', 'Closed', 'Fulfilled', 'PostApproved'].includes(requisition.status)) {
            return { text: "Award Processed", disabled: true };
        }
        if (requisition.status.startsWith('Pending_')) {
            return { text: "Award Pending Final Approval", disabled: true };
        }
        if (isFinalizing) return { text: "Finalizing...", disabled: true };
        if (!allHaveScored) return { text: "Waiting for All Scores...", disabled: true };
        return { text: "Finalize Scores & Award", disabled: false };
    }
    const buttonState = getButtonState();


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
                                    <AvatarImage src={`https://picsum.photos/seed/${member.id}/40/40`} data-ai-hint="profile picture" />
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
            <CardFooter className="gap-2">
                 <Dialog open={isSingleAwardCenterOpen} onOpenChange={setSingleAwardCenterOpen}>
                    <DialogTrigger asChild>
                         <Button disabled={buttonState.disabled}>
                            {isFinalizing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Award to Single Vendor
                        </Button>
                    </DialogTrigger>
                    <AwardCenterDialog 
                        requisition={requisition}
                        quotations={quotations}
                        onFinalize={onFinalize}
                        onClose={() => setSingleAwardCenterOpen(false)}
                    />
                 </Dialog>
                <Dialog open={isBestItemAwardCenterOpen} onOpenChange={setBestItemAwardCenterOpen}>
                    <DialogTrigger asChild>
                        <Button disabled={buttonState.disabled} variant="outline">
                            {isFinalizing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Award by Best Item
                        </Button>
                    </DialogTrigger>
                    <BestItemAwardDialog
                        isOpen={isBestItemAwardCenterOpen}
                        onClose={() => setBestItemAwardCenterOpen(false)}
                        requisition={requisition}
                        quotations={quotations}
                        onFinalize={onFinalize}
                    />
                </Dialog>
            </CardFooter>
            {selectedMember && (
                <>
                    <ExtendDeadlineDialog 
                        isOpen={isExtendDialogOpen}
                        onClose={() => { setExtendDialogOpen(false); setSelectedMember(null); }}
                        member={selectedMember}
                        requisition={requisition}
                        onSuccess={() => onCommitteeUpdate(false)}
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
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const printRef = useRef<HTMLDivElement>(null);
    const { toast } = useToast();

    const getCriterionName = (criterionId: string, type: 'FINANCIAL' | 'TECHNICAL') => {
        const criteria = type === 'FINANCIAL'
          ? requisition.evaluationCriteria?.financialCriteria
          : requisition.evaluationCriteria?.technicalCriteria;
        return criteria?.find(c => c.id === criterionId)?.name || 'Unknown Criterion';
    }

    const getItemName = (quoteItemId: string) => {
        for (const quote of quotations) {
            const item = quote.items.find(i => i.id === quoteItemId);
            if (item) return item.name;
        }
        return 'Unknown Item';
    }

    const handleGeneratePdf = async () => {
        const input = printRef.current;
        if (!input) return;

        setIsGeneratingPdf(true);
        toast({ title: "Generating PDF...", description: "This may take a moment." });

        try {
            const canvas = await html2canvas(input, {
                scale: 2, // Increase resolution
                useCORS: true,
                backgroundColor: null // Important for dark mode
            });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const imgWidth = canvas.width;
            const imgHeight = canvas.height;
            const ratio = imgWidth / imgHeight;
            let width = pdfWidth - 20; // with margin
            let height = width / ratio;

             if (height > pdfHeight - 20) {
                 height = pdfHeight - 20;
                 width = height * ratio;
            }
            
            const x = (pdfWidth - width) / 2;
            const y = 10;

            // Add a white background to the PDF before adding the image
            pdf.setFillColor(255, 255, 255);
            pdf.rect(0, 0, pdfWidth, pdfHeight, 'F');
            
            pdf.addImage(imgData, 'PNG', x, y, width, height);
            
            pdf.save(`Scoring-Report-${requisition.id}.pdf`);
            toast({ title: "PDF Generated", description: "Your report has been downloaded." });

        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: "PDF Generation Failed", description: "An error occurred while creating the PDF." });
        } finally {
            setIsGeneratingPdf(false);
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-5xl h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Cumulative Scoring Report: How The Award Was Won</DialogTitle>
                    <DialogDescription>
                        A detailed breakdown of committee scores for requisition {requisition.id}, explaining the award decision.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex-grow overflow-hidden">
                    <ScrollArea className="h-full">
                        <div ref={printRef} className="p-1 space-y-6 bg-background text-foreground print:bg-white print:text-black">
                            {/* Header for PDF */}
                            <div className="hidden print:block text-center mb-8 pt-4">
                                <Image src="/logo.png" alt="Logo" width={40} height={40} className="mx-auto mb-2" />
                                <h1 className="text-2xl font-bold text-black">Scoring & Award Justification Report</h1>
                                <p className="text-gray-600">{requisition.title}</p>
                                <p className="text-sm text-gray-500">{requisition.id}</p>
                                <p className="text-sm text-gray-500">Report Generated: {format(new Date(), 'PPpp')}</p>
                            </div>

                            {quotations.sort((a, b) => (a.rank || 99) - (b.rank || 99)).map(quote => (
                                <Card key={quote.id} className="break-inside-avoid print:border-gray-300 print:shadow-none print:rounded-lg">
                                    <CardHeader className="print:bg-gray-100 print:rounded-t-lg">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <CardTitle className="text-xl">{quote.vendorName}</CardTitle>
                                                <CardDescription className="print:text-gray-700 pt-1">
                                                    Final Score: <span className="font-bold text-primary">{quote.finalAverageScore?.toFixed(2)}</span> | 
                                                    Rank: <span className="font-bold">{quote.rank || 'N/A'}</span> |
                                                    Total Price: <span className="font-bold">{quote.totalPrice.toLocaleString()} ETB</span>
                                                </CardDescription>
                                            </div>
                                            <Badge variant={quote.status === 'Awarded' || quote.status === 'Partially_Awarded' || quote.status === 'Accepted' ? 'default' : quote.status === 'Standby' ? 'secondary' : 'destructive'}>{quote.status.replace(/_/g, ' ')}</Badge>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-4 space-y-4">
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
                                                        <p className="text-xs text-muted-foreground print:text-gray-500">Submitted {format(new Date(scoreSet.submittedAt), 'PPp')}</p>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="space-y-4">
                                                        {scoreSet.itemScores?.map(itemScore => (
                                                            <div key={itemScore.id} className="p-3 bg-muted/30 rounded-md">
                                                                <h4 className="font-semibold text-sm mb-2 print:text-gray-800 border-b pb-1">Item: {getItemName(itemScore.quoteItemId)}</h4>
                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:grid-cols-2 mt-2">
                                                                    <div>
                                                                        <h5 className="font-semibold text-xs mb-2 print:text-gray-700">Financial ({requisition.evaluationCriteria?.financialWeight}%)</h5>
                                                                        {itemScore.scores.filter(s => s.type === 'FINANCIAL').map(s => (
                                                                            <div key={s.id} className="text-xs p-2 bg-background print:bg-gray-50 rounded-md mb-2">
                                                                                <div className="flex justify-between items-center font-medium">
                                                                                    <p>{getCriterionName(s.financialCriterionId!, 'FINANCIAL')}</p>
                                                                                    <p className="font-bold">{s.score}/100</p>
                                                                                </div>
                                                                                {s.comment && <p className="italic text-muted-foreground print:text-gray-500 mt-1 pl-1 border-l-2 print:border-gray-300">"{s.comment}"</p>}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                    <div>
                                                                        <h5 className="font-semibold text-xs mb-2 print:text-gray-700">Technical ({requisition.evaluationCriteria?.technicalWeight}%)</h5>
                                                                        {itemScore.scores.filter(s => s.type === 'TECHNICAL').map(s => (
                                                                            <div key={s.id} className="text-xs p-2 bg-background print:bg-gray-50 rounded-md mb-2">
                                                                                <div className="flex justify-between items-center font-medium">
                                                                                    <p>{getCriterionName(s.technicalCriterionId!, 'TECHNICAL')}</p>
                                                                                    <p className="font-bold">{s.score}/100</p>
                                                                                </div>
                                                                                {s.comment && <p className="italic text-muted-foreground print:text-gray-500 mt-1 pl-1 border-l-2 print:border-gray-300">"{s.comment}"</p>}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>


                                                    {scoreSet.committeeComment && <p className="text-sm italic text-muted-foreground print:text-gray-600 mt-3 p-3 bg-muted/50 print:bg-gray-100 rounded-md"><strong>Overall Comment:</strong> "{scoreSet.committeeComment}"</p>}
                                                </div>
                                            ))
                                        ) : <p className="text-sm text-muted-foreground text-center py-8 print:text-gray-500">No scores submitted for this quote.</p>}
                                    </CardContent>
                                </Card>
                            ))}
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
    const [isSubmitting, setIsSubmitting] = useState(false);
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

        setIsSubmitting(true);
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
             toast({ variant: 'destructive', title: 'Error', description: error instanceof Error ? error.message : 'An unknown error occurred.',});
        } finally {
            setIsSubmitting(false);
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
                                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !newDeadline && "text-muted-foreground")}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {newDeadline ? format(newDeadline, "PPP") : <span>Pick a date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={newDeadline} onSelect={setNewDeadline} initialFocus disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))} /></PopoverContent>
                            </Popover>
                             <Input type="time" className="w-32" value={newDeadlineTime} onChange={(e) => setNewDeadlineTime(e.target.value)} />
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
                        <p><span className="font-semibold">Assigned Role:</span> {member.role.name}</p>
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
    quotations,
    onFinalScoresSubmitted,
}: {
    user: User,
    requisition: PurchaseRequisition,
    quotations: Quotation[],
    onFinalScoresSubmitted: () => void,
}) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();
    
    const userScoredQuotesCount = quotations.filter(q => q.scores?.some(s => s.scorerId === user.id)).length;
    const allQuotesScored = quotations.length > 0 && userScoredQuotesCount === quotations.length;
    
    const assignment = useMemo(() => {
        return user.committeeAssignments?.find(a => a.requisitionId === requisition.id);
    }, [user.committeeAssignments, requisition.id]);
    
    const scoresAlreadyFinalized = assignment?.scoresSubmitted || false;

    const handleSubmitScores = async () => {
        setIsSubmitting(true);
        try {
            const response = await fetch(`/api/requisitions/${requisition.id}/submit-scores`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to submit scores');
            }
            toast({ title: 'Scores Submitted', description: 'Your final scores have been recorded.'});
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

    if (user.role.name !== 'Committee_Member') {
        return null;
    }

    if (scoresAlreadyFinalized) {
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
                <p className="text-sm text-muted-foreground">You have scored {userScoredQuotesCount} of {quotations.length} quotes.</p>
            </CardContent>
            <CardFooter>
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button disabled={!allQuotesScored || isSubmitting}>
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
                            <AlertDialogAction onClick={handleSubmitScores}>Confirm and Submit</AlertDialogAction>
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
  const { user, allUsers, role, token, rfqSenderSetting, committeeQuorum } = useAuth();
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
  const [hidePricesForScoring, setHidePricesForScoring] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isReportOpen, setReportOpen] = useState(false);
  const [actionDialog, setActionDialog] = useState<{isOpen: boolean, type: 'update' | 'cancel' | 'restart'}>({isOpen: false, type: 'restart'});
  const [currentQuotesPage, setCurrentQuotesPage] = useState(1);
  const [committeeTab, setCommitteeTab] = useState<'pending' | 'scored'>('pending');

  const isAwarded = useMemo(() => quotations.some(q => ['Awarded', 'Accepted', 'Declined', 'Failed', 'Partially_Awarded', 'Standby', 'Pending_Award'].includes(q.status)), [quotations]);
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
    return allMemberIds.every(memberId => {
        const member = allUsers.find(u => u.id === memberId);
        return member?.committeeAssignments?.some(a => a.requisitionId === requisition.id && a.scoresSubmitted) || false;
    });
  }, [requisition, quotations, allUsers]);

  const isAuthorized = useMemo(() => {
    if (!user || !role) return false;
    if (role.name === 'Admin') return true;
    if (rfqSenderSetting.type === 'all') {
      return role.name === 'Procurement_Officer';
    }
    if (rfqSenderSetting.type === 'specific') {
      return user.id === rfqSenderSetting.userId;
    }
    return false;
  }, [user, role, rfqSenderSetting]);
  
  const isAssignedCommitteeMember = useMemo(() => {
      if (!user || user.role.name !== 'Committee_Member' || !requisition) {
          return false;
      }
      return (requisition.financialCommitteeMemberIds?.includes(user.id) || requisition.technicalCommitteeMemberIds?.includes(user.id)) ?? false;
  }, [user, requisition]);


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
          const quoData: Quotation[] = await quoResponse.json();

          setVendors(venData || []);

          if (currentReq) {
              setRequisition(currentReq);
              // Sort quotations by creation date descending
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
    if (id && user && allUsers.length > 0) {
        fetchRequisitionAndQuotes();
    }
  }, [id, user, allUsers, fetchRequisitionAndQuotes]);
  
  const handleFinalizeScores = async (awardStrategy: 'all' | 'item', awards: any, awardResponseDeadline?: Date) => {
        if (!user || !requisition || !quotations) return;
        
        const quoteItemsById: { [key: string]: { price: number; quantity: number } } = {};
        quotations.forEach(q => {
            q.items.forEach(i => {
                quoteItemsById[i.id] = { price: i.unitPrice, quantity: i.quantity };
            });
        });

        const totalAwardValue = Object.values(awards).flatMap((a: any) => a.items)
            .reduce((sum, item: any) => {
                const quoteItem = quoteItemsById[item.quoteItemId];
                return sum + (quoteItem ? quoteItem.price * quoteItem.quantity : 0);
            }, 0);


        setIsFinalizing(true);
        try {
             const response = await fetch(`/api/requisitions/${requisition.id}/finalize-scores`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, awards, awardStrategy, awardResponseDeadline, totalAwardValue }),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to finalize scores.');
            }
            toast({ title: 'Success', description: 'Scores have been finalized and awards are being routed for final review.' });
            fetchRequisitionAndQuotes();
        } catch(error) {
             toast({
                variant: 'destructive',
                title: 'Error',
                description: error instanceof Error ? error.message : 'An unknown error occurred.',
            });
        } finally {
            setIsFinalizing(false);
        }
    }

  const handleNotifyVendor = async (deadline?: Date) => {
    if (!user || !requisition) return;
    setIsNotifying(true);
    try {
      const response = await fetch(`/api/requisitions/${requisition.id}/notify-vendor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
  
  const handleScoreSubmitted = () => {
      setScoringFormOpen(false);
      setSelectedQuoteForScoring(null);
      setCommitteeTab('scored'); // Switch to scored tab after submission
      fetchRequisitionAndQuotes();
  }

  const getCurrentStep = (): 'rfq' | 'committee' | 'award' | 'finalize' | 'completed' => {
      if (!requisition || !requisition.status) return 'rfq';
      const deadlinePassed = requisition.deadline ? isPast(new Date(requisition.deadline)) : false;

      if (requisition.status === 'PreApproved' && !isAwarded) return 'rfq';
      if (requisition.status === 'Accepting_Quotes' && !deadlinePassed) return 'rfq';
      if (requisition.status === 'Accepting_Quotes' && deadlinePassed) return 'committee';

      const inScoringProcess = requisition.status === 'Scoring_In_Progress' || requisition.status === 'Scoring_Complete' || requisition.status === 'Award_Declined';
      if (inScoringProcess) {
          return isScoringComplete ? 'award' : 'committee';
      }
      
      const inReviewProcess = requisition.status.startsWith('Pending_') || requisition.status === 'PostApproved' || requisition.status === 'Awarded';
      if (inReviewProcess) return 'award';

      if (isAccepted) {
        return requisition.status === 'PO_Created' ? 'completed' : 'finalize';
      }
      
      return 'rfq'; // Default fallback
  };
  const currentStep = getCurrentStep();
  
  const formatEvaluationCriteria = (criteria?: EvaluationCriteria) => {
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

  const { pendingQuotes, scoredQuotes } = useMemo(() => {
    if (!user || user.role.name !== 'Committee_Member' ) return { pendingQuotes: quotations, scoredQuotes: [] };
    const pending = quotations.filter(q => !q.scores?.some(s => s.scorerId === user.id));
    const scored = quotations.filter(q => q.scores?.some(s => s.scorerId === user.id));
    return { pendingQuotes: pending, scoredQuotes: scored };
  }, [quotations, user]);

  const quotesForDisplay = (user && user.role.name === 'Committee_Member' && committeeTab === 'pending') ? pendingQuotes : (user && user.role.name === 'Committee_Member' && committeeTab === 'scored') ? scoredQuotes : quotations;
  const totalQuotePages = Math.ceil(quotesForDisplay.length / PAGE_SIZE);
  const paginatedQuotes = useMemo(() => {
    const startIndex = (currentQuotesPage - 1) * PAGE_SIZE;
    return quotesForDisplay.slice(startIndex, startIndex + PAGE_SIZE);
  }, [quotesForDisplay, currentQuotesPage]);


  if (loading || !user) {
     return <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  
  if (!requisition) {
     return <div className="text-center p-8">Requisition not found.</div>;
  }
  
  const canManageCommittees = (role?.name === 'Procurement_Officer' || role?.name === 'Admin' || role?.name === 'Committee') && isAuthorized;
  const isReadyForNotification = requisition.status === 'PostApproved';
  const noBidsAndDeadlinePassed = isDeadlinePassed && quotations.length === 0 && requisition.status === 'Accepting_Quotes';
  const quorumNotMetAndDeadlinePassed = isDeadlinePassed && quotations.length > 0 && !isAwarded && quotations.length < committeeQuorum;
  const readyForCommitteeAssignment = isDeadlinePassed && !noBidsAndDeadlinePassed && !quorumNotMetAndDeadlinePassed;
  
  const canViewCumulativeReport = isAwarded && isScoringComplete && (
      role?.name === 'Procurement_Officer' || 
      role?.name === 'Admin' || 
      role?.name?.startsWith('Manager_') || 
      role?.name?.startsWith('Director_') ||
      role?.name?.startsWith('VP_') ||
      role?.name === 'President' ||
      role?.name?.startsWith('Committee_')
  );


  return (
    <div className="space-y-6">
        <Button variant="outline" onClick={() => router.push('/quotations')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to All Requisitions
        </Button>
        
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
                    <p className="text-sm text-muted-foreground p-4 bg-muted/50 rounded-md whitespace-pre-wrap">{formatEvaluationCriteria(requisition.evaluationCriteria)}</p>
                </CardContent>
            </Card>
        )}
        
        {noBidsAndDeadlinePassed && (role?.name === 'Procurement_Officer' || role?.name === 'Admin') && (
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
        
        {quorumNotMetAndDeadlinePassed && (role?.name === 'Procurement_Officer' || role?.name === 'Admin') && (
            <RFQReopenCard requisition={requisition} onRfqReopened={fetchRequisitionAndQuotes} />
        )}

        {currentStep === 'rfq' && !noBidsAndDeadlinePassed && !quorumNotMetAndDeadlinePassed && (role?.name === 'Procurement_Officer' || role?.name === 'Committee' || role?.name === 'Admin') && (
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
        
        <ManageRFQ 
            requisition={requisition}
            onSuccess={fetchRequisitionAndQuotes}
            isAuthorized={isAuthorized}
        />
        
        {currentStep === 'committee' && canManageCommittees && (
            readyForCommitteeAssignment ? (
                <EvaluationCommitteeManagement
                    requisition={requisition}
                    onCommitteeUpdated={fetchRequisitionAndQuotes}
                    open={isCommitteeDialogOpen}
                    onOpenChange={setCommitteeDialogOpen}
                    isAuthorized={isAuthorized}
                />
            ) : (
                <Card className="border-dashed">
                    <CardHeader>
                        <CardTitle>Evaluation Committee</CardTitle>
                        <CardDescription>Assign scorers to evaluate vendor quotations.</CardDescription>
                    </CardHeader>
                    <CardContent className="text-center py-10">
                        <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <p className="font-semibold">Quorum Not Met</p>
                        <p className="text-sm text-muted-foreground">
                            Only {quotations.length} of the required {committeeQuorum} quotes have been submitted.
                            <br />
                            Committee assignment is not yet possible.
                        </p>
                    </CardContent>
                </Card>
            )
        )}


        {(currentStep === 'committee' || currentStep === 'award' || currentStep === 'finalize' || currentStep === 'completed') && (
            <>
                {canManageCommittees && currentStep !== 'committee' && readyForCommitteeAssignment && (
                     <div className="hidden">
                        <EvaluationCommitteeManagement
                            requisition={requisition}
                            onCommitteeUpdated={fetchRequisitionAndQuotes}
                            open={isCommitteeDialogOpen}
                            onOpenChange={setCommitteeDialogOpen}
                            isAuthorized={isAuthorized}
                        />
                    </div>
                )}
                <Card>
                    <CardHeader className="flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div>
                            <CardTitle>Quotations for {requisition.id}</CardTitle>
                            <CardDescription>{requisition.title}</CardDescription>
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
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                           {canViewCumulativeReport && (
                                <Button variant="secondary" onClick={() => setReportOpen(true)}>
                                    <FileBarChart2 className="mr-2 h-4 w-4" /> View Cumulative Report
                                </Button>
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
                                {user && user.role.name === 'Committee_Member' && <TabsList className="mb-4">
                                    <TabsTrigger value="pending">Pending Your Score ({pendingQuotes.length})</TabsTrigger>
                                    <TabsTrigger value="scored">Scored by You ({scoredQuotes.length})</TabsTrigger>
                                </TabsList>}
                                <TabsContent value="pending">
                                    <QuoteComparison quotes={paginatedQuotes} requisition={requisition} onScore={handleScoreButtonClick} user={user!} isDeadlinePassed={isDeadlinePassed} isScoringDeadlinePassed={isScoringDeadlinePassed} isAwarded={isAwarded} isAssigned={isAssignedCommitteeMember} />
                                </TabsContent>
                                <TabsContent value="scored">
                                    <QuoteComparison quotes={paginatedQuotes} requisition={requisition} onScore={handleScoreButtonClick} user={user!} isDeadlinePassed={isDeadlinePassed} isScoringDeadlinePassed={isScoringDeadlinePassed} isAwarded={isAwarded} isAssigned={isAssignedCommitteeMember} />
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
            </>
        )}
        
        {isAssignedCommitteeMember && (
             <CommitteeActions 
                user={user}
                requisition={requisition}
                quotations={quotations}
                onFinalScoresSubmitted={fetchRequisitionAndQuotes}
             />
        )}
        
         {((role?.name === 'Procurement_Officer' || role?.name === 'Admin' || role?.name === 'Committee') &&
            ((requisition.financialCommitteeMemberIds?.length || 0) > 0 || (requisition.technicalCommitteeMemberIds?.length || 0) > 0) &&
            requisition.status !== 'PreApproved'
        ) && (
            <ScoringProgressTracker
                requisition={requisition}
                quotations={quotations}
                allUsers={allUsers}
                onFinalize={handleFinalizeScores}
                onCommitteeUpdate={setCommitteeDialogOpen}
                isFinalizing={isFinalizing}
            />
        )}
        
        <AwardStandbyButton 
            requisition={requisition}
            quotations={quotations}
            onSuccess={fetchRequisitionAndQuotes}
        />


        {isReadyForNotification && (role?.name === 'Procurement_Officer' || role?.name === 'Admin') && (
            <Card className="mt-6 border-amber-500">
                 <CardHeader>
                    <CardTitle>Action Required: Notify Vendor</CardTitle>
                    <CardDescription>The award has passed all reviews. You may now notify the winning vendor.</CardDescription>
                </CardHeader>
                <CardFooter>
                     <Dialog open={isNotifyDialogOpen} onOpenChange={setIsNotifyDialogOpen}>
                        <DialogTrigger asChild>
                             <Button disabled={isNotifying || requisition.status === 'Awarded'}>
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
        
        {isAccepted && requisition.status !== 'PO_Created' && role?.name !== 'Committee_Member' && (
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
    const { user } = useAuth();
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
        if (!user) return;
        if (!finalNewDeadline || isBefore(finalNewDeadline, new Date())) {
            toast({ variant: 'destructive', title: 'Error', description: 'A new deadline in the future must be set.' });
            return;
        }

        
        try {
            const response = await fetch(`/api/requisitions/${requisition.id}/reopen-rfq`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
    

    







    

    



    
 
    

    



    

    











    

    

    


