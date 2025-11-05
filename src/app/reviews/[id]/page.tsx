
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, Check, X, Eye, FileBarChart2, Info, Printer, ShieldQuestion, User, History } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { PurchaseRequisition, Quotation, EvaluationCriteria, AuditLog, Minute } from '@/lib/types';
import { format, formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/auth-context';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RequisitionDetailsDialog } from '@/components/requisition-details-dialog';
import Image from 'next/image';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const reviewFormSchema = z.object({
  justification: z.string().min(10, { message: "A justification for the decision is required." }),
});

type ReviewFormValues = z.infer<typeof reviewFormSchema>;

const CumulativeScoringReportDialog = ({ requisition, quotations, isOpen, onClose }: { requisition: PurchaseRequisition; quotations: Quotation[], isOpen: boolean, onClose: () => void }) => {
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const printRef = useRef<HTMLDivElement>(null);
    const { toast } = useToast();

    const getCriterionName = (criterionId: string, criteria?: any[]) => {
        return criteria?.find(c => c.id === criterionId)?.name || 'Unknown Criterion';
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
            let width = pdfWidth - 20; // with margin
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
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-5xl h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Cumulative Scoring Report</DialogTitle>
                    <DialogDescription>
                        A detailed breakdown of committee scores for requisition {requisition.id}.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex-grow overflow-hidden">
                    <ScrollArea className="h-full">
                        <div ref={printRef} className="p-1 space-y-6">
                            {quotations.sort((a, b) => (a.rank || 99) - (b.rank || 99)).map(quote => (
                                <Card key={quote.id}>
                                    <CardHeader>
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <CardTitle className="text-xl">{quote.vendorName}</CardTitle>
                                                <CardDescription>
                                                    Final Score: <span className="font-bold text-primary">{quote.finalAverageScore?.toFixed(2)}</span> | Rank: <span className="font-bold">{quote.rank || 'N/A'}</span>
                                                </CardDescription>
                                            </div>
                                            <Badge variant={quote.status === 'Awarded' || quote.status === 'Partially_Awarded' || quote.status === 'Accepted' ? 'default' : quote.status === 'Standby' ? 'secondary' : 'destructive'}>{quote.status.replace(/_/g, ' ')}</Badge>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        {quote.scores?.map(scoreSet => (
                                            <div key={scoreSet.scorerId} className="p-3 border rounded-md">
                                                <div className="flex items-center justify-between mb-3 pb-2 border-b">
                                                    <div className="flex items-center gap-3">
                                                        <Avatar className="h-8 w-8"><AvatarImage src={`https://picsum.photos/seed/${scoreSet.scorerId}/32/32`} /><AvatarFallback>{scoreSet.scorer?.name?.charAt(0) || 'U'}</AvatarFallback></Avatar>
                                                        <span className="font-semibold">{scoreSet.scorer?.name || 'Unknown User'}</span>
                                                    </div>
                                                    <span className="font-bold text-lg text-primary">{scoreSet.finalScore.toFixed(2)}</span>
                                                </div>
                                                {scoreSet.committeeComment && <p className="text-sm italic text-muted-foreground p-2 bg-muted/50 rounded-md">"{scoreSet.committeeComment}"</p>}
                                            </div>
                                        ))}
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

const ApprovalDashboard = ({ requisition, onAction }: { requisition: PurchaseRequisition; onAction: (action: 'approve' | 'reject', justification: string) => void; }) => {
    const [isReportOpen, setIsReportOpen] = useState(false);
    
    const form = useForm<ReviewFormValues>({
        resolver: zodResolver(reviewFormSchema),
        defaultValues: { justification: '' },
    });

    const winningQuotes = useMemo(() => requisition.quotations?.filter(q => q.status === 'Pending_Award').sort((a,b) => (a.rank || 99) - (b.rank || 99)) || [], [requisition.quotations]);
    const standbyQuotes = useMemo(() => requisition.quotations?.filter(q => q.status === 'Standby').sort((a,b) => (a.rank || 99) - (b.rank || 99)) || [], [requisition.quotations]);
    
    const totalAwardValue = useMemo(() => {
        return winningQuotes.reduce((total, quote) => total + quote.totalPrice, 0);
    }, [winningQuotes]);
    
    const onSubmit = (action: 'approve' | 'reject') => (values: ReviewFormValues) => {
        onAction(action, values.justification);
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Requisition Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div><Label>Title</Label><p>{requisition.title}</p></div>
                        <div><Label>Requester</Label><p>{requisition.requesterName}</p></div>
                        <div><Label>Department</Label><p>{requisition.department}</p></div>
                        <div><Label>Created</Label><p>{format(new Date(requisition.createdAt), 'PP')}</p></div>
                    </div>
                     <div>
                        <Label>Items Requested</Label>
                        <Table>
                            <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Quantity</TableHead><TableHead>Description</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {requisition.items.map(item => (
                                    <TableRow key={item.id}>
                                        <TableCell>{item.name}</TableCell>
                                        <TableCell>{item.quantity}</TableCell>
                                        <TableCell>{item.description}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                     </div>
                     <div><Label>Justification</Label><p className="text-sm p-3 bg-muted/50 rounded-md">{requisition.justification}</p></div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Award Recommendation</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex justify-between items-center bg-green-500/10 p-4 rounded-lg">
                        <div>
                            <p className="text-sm font-semibold text-green-700">Total Award Value</p>
                            <p className="text-3xl font-bold">{totalAwardValue.toLocaleString()} ETB</p>
                        </div>
                        <Button onClick={() => setIsReportOpen(true)}><FileBarChart2 className="mr-2"/>View Scoring Report</Button>
                    </div>

                    <h3 className="font-semibold mt-6 mb-2">Bid Comparison</h3>
                    <Table>
                        <TableHeader><TableRow><TableHead>Vendor</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Score</TableHead><TableHead className="text-right">Price</TableHead></TableRow></TableHeader>
                        <TableBody>
                            {winningQuotes.map(q => (
                                <TableRow key={q.id} className="bg-green-500/5">
                                    <TableCell className="font-semibold">{q.vendorName}</TableCell>
                                    <TableCell><Badge>Winner</Badge></TableCell>
                                    <TableCell className="text-right font-mono">{q.finalAverageScore?.toFixed(2)}</TableCell>
                                    <TableCell className="text-right font-mono">{q.totalPrice.toLocaleString()} ETB</TableCell>
                                </TableRow>
                            ))}
                             {standbyQuotes.map(q => (
                                <TableRow key={q.id}>
                                    <TableCell>{q.vendorName}</TableCell>
                                    <TableCell><Badge variant="secondary">Standby (Rank {q.rank})</Badge></TableCell>
                                    <TableCell className="text-right font-mono">{q.finalAverageScore?.toFixed(2)}</TableCell>
                                    <TableCell className="text-right font-mono">{q.totalPrice.toLocaleString()} ETB</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle>Approval History</CardTitle></CardHeader>
                <CardContent>
                    <ScrollArea className="h-40">
                         <div className="relative pl-6">
                            <div className="absolute left-6 top-0 h-full w-0.5 bg-border -translate-x-1/2"></div>
                            {(requisition.auditLog as AuditLogType[] || []).filter(l => l.action.includes('APPROVE')).map((log, index) => (
                            <div key={log.id} className="relative mb-6">
                                <div className="absolute -left-3 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-secondary"><div className="h-3 w-3 rounded-full bg-primary"></div></div>
                                <div className="pl-8">
                                    <div className="flex items-center justify-between">
                                        <p className="font-semibold">{log.action.replace(/_/g, ' ')} by {log.user}</p>
                                        <time className="text-xs text-muted-foreground">{format(new Date(log.timestamp), 'PPp')}</time>
                                    </div>
                                    <p className="mt-1 text-sm text-muted-foreground">{log.details}</p>
                                </div>
                            </div>
                            ))}
                        </div>
                    </ScrollArea>
                </CardContent>
            </Card>

             <Form {...form}>
                <form className="space-y-4">
                    <FormField
                        control={form.control}
                        name="justification"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-lg font-semibold">Your Justification / Minute</FormLabel>
                                <FormControl>
                                    <Textarea placeholder="Provide the rationale for your decision..." rows={5} {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <div className="flex justify-end gap-4">
                        <AlertDialog>
                            <AlertDialogTrigger asChild><Button variant="destructive" disabled={!form.formState.isValid}><X className="mr-2"/>Reject</Button></AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader><AlertDialogTitle>Confirm Rejection</AlertDialogTitle><AlertDialogDescription>Are you sure you want to reject this award? This will reset the entire RFQ process.</AlertDialogDescription></AlertDialogHeader>
                                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={form.handleSubmit(onSubmit('reject'))}>Confirm Rejection</AlertDialogAction></AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                        <AlertDialog>
                            <AlertDialogTrigger asChild><Button disabled={!form.formState.isValid}><Check className="mr-2"/>Approve</Button></AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader><AlertDialogTitle>Confirm Approval</AlertDialogTitle><AlertDialogDescription>You are about to approve the award. It will proceed to the next step or be finalized.</AlertDialogDescription></AlertDialogHeader>
                                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={form.handleSubmit(onSubmit('approve'))}>Confirm Approval</AlertDialogAction></AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </form>
            </Form>
            {requisition.quotations && (
                 <CumulativeScoringReportDialog requisition={requisition} quotations={requisition.quotations} isOpen={isReportOpen} onClose={() => setIsReportOpen(false)} />
            )}
        </div>
    );
};


export default function ReviewDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const { user } = useAuth();
  const id = params.id as string;
  
  const [requisition, setRequisition] = useState<PurchaseRequisition | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!id || !user) return;
    setLoading(true);
    fetch(`/api/requisitions/${id}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch data');
        return res.json();
      })
      .then(data => setRequisition(data))
      .catch(err => {
        console.error(err);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch requisition details.' });
      })
      .finally(() => setLoading(false));
  }, [id, user, toast]);

  const handleAction = async (action: 'approve' | 'reject', justification: string) => {
    if (!user || !requisition) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/requisitions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            id: requisition.id, 
            status: action === 'approve' ? 'Approved' : 'Rejected', 
            userId: user.id, 
            comment: justification,
            minute: { justification, attendeeIds: [user.id] },
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${action} award`);
      }
      toast({
        title: "Success",
        description: `Award recommendation has been ${action === 'approve' ? 'approved' : 'rejected'}.`,
      });
      router.push('/reviews');

    } catch (error) {
      toast({
        variant: 'destructive',
        title: "Error",
        description: error instanceof Error ? error.message : "An unknown error occurred.",
      });
    } finally {
        setIsSubmitting(false);
    }
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!requisition) return <div className="text-center p-8">Requisition not found or you do not have permission to view it.</div>;

  return (
    <div className="space-y-6">
        <Button variant="outline" onClick={() => router.push('/reviews')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Reviews List
        </Button>
        <ApprovalDashboard requisition={requisition} onAction={handleAction} />
    </div>
  );
}

