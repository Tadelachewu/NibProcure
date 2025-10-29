'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
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
import { Loader2, PlusCircle, Award, XCircle, FileSignature, FileText, Bot, Lightbulb, ArrowLeft, Star, Undo, Check, Send, Search, BadgeHelp, BadgeCheck, BadgeX, Crown, Medal, Trophy, RefreshCw, TimerOff, ClipboardList, TrendingUp, Scale, Edit2, Users, GanttChart, Eye, CheckCircle, CalendarIcon, Timer, Landmark, Settings2, Ban, Printer, FileBarChart2, UserCog, History, AlertCircle, FileUp, TrophyIcon } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AwardCenterDialog } from '@/components/award-center-dialog';
import { AwardStandbyButton } from '@/components/award-standby-button';

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

const QuoteComparison = ({ quotes, requisition, onScore, user, isDeadlinePassed, isScoringDeadlinePassed, isAwarded }: { quotes: Quotation[], requisition: PurchaseRequisition, onScore: (quote: Quotation, hidePrices: boolean) => void, user: User, isDeadlinePassed: boolean, isScoringDeadlinePassed: boolean, isAwarded: boolean }) => {

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
    
    const isTechnicalOnlyScorer = user.role === 'Committee_Member' && requisition.technicalCommitteeMemberIds?.includes(user.id) && !requisition.financialCommitteeMemberIds?.includes(user.id);
    const hidePrices = isTechnicalOnlyScorer && !requisition.rfqSettings?.technicalEvaluatorSeesPrices;


    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {quotes.sort((a, b) => (a.rank || 4) - (b.rank || 4)).map(quote => {
                const hasUserScored = quote.scores?.some(s => s.scorerId === user.id);
                return (
                    <Card key={quote.id} className={cn("flex flex-col", (quote.status === 'Awarded' || quote.status === 'Accepted' || quote.status === 'Partially_Awarded') && 'border-primary ring-2 ring-primary')}>
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

                                    {isDeadlinePassed && (
                                        <div className="text-sm space-y-2">
                                        <h4 className="font-semibold">Items:</h4>
                                            {quote.items.map(item => (
                                                <div key={item.requisitionItemId} className="flex justify-between items-center text-muted-foreground">
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
                            {user.role === 'Committee_Member' && (
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
    const { toast }
