
'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  DialogTrigger,
  DialogFooter,
  DialogClose,
  DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, Check, XCircle, FileBarChart2, Info, CheckCircle } from 'lucide-react';
import { useForm, useFieldArray, FormProvider, useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { PurchaseRequisition, Quotation, Vendor, EvaluationCriteria, User, CommitteeScoreSet, EvaluationCriterion, QuoteItem, AuditLog } from '@/lib/types';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/auth-context';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useParams, useRouter } from 'next/navigation';
import { ScrollArea } from '@/components/ui/scroll-area';

const ApprovalDashboard = ({ requisition, onAction, onOpenReport }: { requisition: PurchaseRequisition; onAction: () => void; onOpenReport: () => void; }) => {
    const { user, toast } = useAuth();
    const [justification, setJustification] = useState('');
    const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
    const [isActionDialogOpen, setActionDialogOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!user || !requisition) return null;

    const winningQuotes = requisition.quotations?.filter(q => q.status === 'Pending_Award' || q.status === 'Awarded' || q.status === 'Accepted') || [];
    const standbyQuotes = requisition.quotations?.filter(q => q.status === 'Standby').sort((a,b) => (a.rank || 99) - (b.rank || 99)) || [];

    const handleOpenDialog = (type: 'approve' | 'reject') => {
        setActionType(type);
        setActionDialogOpen(true);
    }
    
    const submitAction = async () => {
        if (!requisition || !actionType || !user) return;
    
        if (!justification.trim()) {
            toast({
                variant: 'destructive',
                title: 'Justification Required',
                description: 'A justification for the decision is required for the minutes.',
            });
            return;
        }

        setIsSubmitting(true);

        const minute = {
            decisionBody: requisition.status.replace(/_/g, ' '),
            justification,
            attendeeIds: [user.id],
        }

        try {
            const response = await fetch(`/api/requisitions`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    id: requisition.id, 
                    status: actionType === 'approve' ? 'Approved' : 'Rejected', 
                    userId: user.id, 
                    comment: justification,
                    minute,
                }),
            });
            if (!response.ok) throw new Error(`Failed to ${actionType} requisition award`);
            toast({
                title: "Success",
                description: `Award for requisition ${requisition.id} has been ${actionType === 'approve' ? 'processed' : 'rejected'}.`,
            });
            onAction();
        } catch (error) {
            toast({
                variant: 'destructive',
                title: "Error",
                description: error instanceof Error ? error.message : "An unknown error occurred.",
            });
        } finally {
            setIsSubmitting(false);
            setActionDialogOpen(false);
            setJustification('');
            setActionType(null);
        }
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Approval Decision Dashboard</CardTitle>
                    <CardDescription>Review the summary below and make your approval decision for requisition <span className="font-bold">{requisition.id}</span>.</CardDescription>
                </CardHeader>
                <CardFooter className="gap-4">
                    <Button size="lg" onClick={() => handleOpenDialog('approve')} disabled={isSubmitting}>
                        <Check className="mr-2"/>Approve Award
                    </Button>
                    <Button size="lg" variant="destructive" onClick={() => handleOpenDialog('reject')} disabled={isSubmitting}>
                        <XCircle className="mr-2"/>Reject Award
                    </Button>
                </CardFooter>
            </Card>

            <div className="grid lg:grid-cols-3 gap-6 items-start">
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                             <div className="flex justify-between items-center">
                                <CardTitle>Award Recommendation</CardTitle>
                                <Button variant="secondary" size="sm" onClick={onOpenReport}><FileBarChart2 className="mr-2"/>View Scoring Report</Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                             <div className="flex justify-around p-4 bg-muted/50 rounded-lg text-center">
                                <div>
                                    <p className="text-sm text-muted-foreground">Winning Vendor(s)</p>
                                    <p className="text-lg font-bold">{winningQuotes.map(q => q.vendorName).join(', ')}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Final Award Value</p>
                                    <p className="text-lg font-bold">{requisition.totalPrice.toLocaleString()} ETB</p>
                                </div>
                            </div>
                             <h4 className="font-semibold text-md">Bid Comparison</h4>
                             <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Vendor</TableHead>
                                        <TableHead>Final Score</TableHead>
                                        <TableHead>Total Price</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {winningQuotes.map(q => (
                                        <TableRow key={q.id} className="bg-green-500/10">
                                            <TableCell className="font-bold">{q.vendorName}</TableCell>
                                            <TableCell>{q.finalAverageScore?.toFixed(2)}</TableCell>
                                            <TableCell>{q.totalPrice.toLocaleString()} ETB</TableCell>
                                            <TableCell><Badge variant="default">Winner</Badge></TableCell>
                                        </TableRow>
                                    ))}
                                     {standbyQuotes.map(q => (
                                        <TableRow key={q.id}>
                                            <TableCell>{q.vendorName}</TableCell>
                                            <TableCell>{q.finalAverageScore?.toFixed(2)}</TableCell>
                                            <TableCell>{q.totalPrice.toLocaleString()} ETB</TableCell>
                                            <TableCell><Badge variant="secondary">Standby (Rank {q.rank})</Badge></TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                             </Table>
                        </CardContent>
                    </Card>
                </div>
                 <div className="space-y-6">
                    <Card>
                        <CardHeader><CardTitle>Requisition Summary</CardTitle></CardHeader>
                        <CardContent className="space-y-3 text-sm">
                            <p><span className="font-semibold">Requester:</span> {requisition.requesterName}</p>
                            <p><span className="font-semibold">Department:</span> {requisition.department}</p>
                            <p><span className="font-semibold">Justification:</span> {requisition.justification}</p>
                        </CardContent>
                    </Card>
                     <Card>
                        <CardHeader><CardTitle>Requested Items</CardTitle></CardHeader>
                        <CardContent>
                             <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Item</TableHead>
                                        <TableHead className="text-right">Qty</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {requisition.items.map(item => (
                                        <TableRow key={item.id}>
                                            <TableCell>
                                                <p className="font-medium">{item.name}</p>
                                                {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                                            </TableCell>
                                            <TableCell className="text-right">{item.quantity}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                    {requisition.auditTrail && requisition.auditTrail.length > 0 && (
                        <Card>
                            <CardHeader><CardTitle>Approval History</CardTitle></CardHeader>
                            <CardContent>
                                <ScrollArea className="h-48">
                                <div className="relative pl-6">
                                    <div className="absolute left-3 top-0 h-full w-px bg-border"></div>
                                    {requisition.auditTrail.filter(log => log.action.includes('APPROVE') || log.action.includes('REJECT') || log.action.includes('SUBMIT')).map(log => (
                                        <div key={log.id} className="relative mb-4">
                                            <div className="absolute -left-1.5 top-1.5 h-3 w-3 rounded-full bg-primary"></div>
                                            <div className="pl-4">
                                                <p className="text-sm font-semibold">{log.action.replace(/_/g, ' ')}</p>
                                                <p className="text-xs text-muted-foreground">by {log.user} on {format(new Date(log.timestamp), 'PP')}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
             <Dialog open={isActionDialogOpen} onOpenChange={setActionDialogOpen}>
                <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Record Minute for {actionType === 'approve' ? 'Approval' : 'Rejection'}</DialogTitle>
                    <DialogDescription>Record the official minute for this decision. This is a formal record for auditing purposes.</DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Label htmlFor="justification">Justification / Remarks</Label>
                    <Textarea 
                        id="justification" 
                        value={justification}
                        onChange={(e) => setJustification(e.target.value)}
                        placeholder="Provide a detailed rationale for your decision..."
                        rows={6}
                    />
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setActionDialogOpen(false)}>Cancel</Button>
                    <Button onClick={submitAction} variant={actionType === 'approve' ? 'default' : 'destructive'} disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                        Submit {actionType === 'approve' ? 'Approval' : 'Rejection'}
                    </Button>
                </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}


export default function ReviewPage() {
    const router = useRouter();
    const params = useParams();
    const { toast } = useToast();
    const { user } = useAuth();
    const id = params.id as string;
    
    const [requisition, setRequisition] = useState<PurchaseRequisition | null>(null);
    const [loading, setLoading] = useState(true);
    const [isReportOpen, setReportOpen] = useState(false);

    const fetchRequisitionData = async () => {
        if (!id || !user) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/requisitions/${id}`);
            if (!res.ok) {
                throw new Error('Failed to fetch requisition details for review.');
            }
            const data = await res.json();
            setRequisition(data);
        } catch (error) {
             toast({ variant: 'destructive', title: 'Error', description: error instanceof Error ? error.message : 'An unknown error occurred.' });
             router.push('/reviews');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRequisitionData();
    }, [id, user]);

    if (loading) {
        return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    if (!requisition) {
        return <div className="text-center p-8">Requisition not found or you do not have permission to review it.</div>;
    }

    const isUserAnApproverForThis = 
        (requisition.currentApproverId === user?.id) || 
        (requisition.status.startsWith('Pending_') && user?.role === requisition.status.replace('Pending_', ''));

    if (!isUserAnApproverForThis) {
         return (
            <div className="space-y-6">
                <Button variant="outline" onClick={() => router.push('/reviews')}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to All Reviews
                </Button>
                <Alert variant="destructive">
                    <Info className="h-4 w-4" />
                    <AlertTitle>Not Your Turn</AlertTitle>
                    <AlertDescription>This item is not currently pending your review.</AlertDescription>
                </Alert>
            </div>
         );
    }
    
    return (
        <div className="space-y-6">
            <Button variant="outline" onClick={() => router.push('/reviews')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to All Reviews
            </Button>
            <ApprovalDashboard 
                requisition={requisition}
                onAction={fetchRequisitionData}
                onOpenReport={() => setReportOpen(true)}
            />
            {/* The CumulativeScoringReportDialog is missing, it should be here. I need to copy it from the quotations page. */}
        </div>
    )
}
