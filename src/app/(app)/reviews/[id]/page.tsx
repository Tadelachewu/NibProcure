
'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, Check, X, Eye, Users, FileText, BadgeDollarSign, History, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { PurchaseRequisition, Quotation, AuditLog as AuditLogType } from '@/lib/types';
import { format, formatDistanceToNow } from 'date-fns';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

function ApprovalDashboard({ requisition, onAction }: { requisition: PurchaseRequisition; onAction: (type: 'approve' | 'reject', comment: string) => void }) {
    const [comment, setComment] = useState('');
    const [actionToConfirm, setActionToConfirm] = useState<'approve' | 'reject' | null>(null);

    const winningQuotes = useMemo(() => {
        return requisition.quotations?.filter(q => q.status === 'Pending_Award') || [];
    }, [requisition.quotations]);
    
    const standbyQuotes = useMemo(() => {
        return requisition.quotations?.filter(q => q.status === 'Standby').sort((a,b) => (a.rank || 99) - (b.rank || 99)) || [];
    }, [requisition.quotations]);

    const totalAwardValue = winningQuotes.reduce((sum, quote) => sum + quote.totalPrice, 0);

    return (
        <div className="space-y-6">
             <Card>
                <CardHeader>
                    <CardTitle>Final Award Approval</CardTitle>
                    <CardDescription>
                        You are about to approve the award for requisition <span className="font-mono">{requisition.id}</span>. Please review all information before proceeding.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                     <div><span className="font-semibold">Requisition Title:</span> {requisition.title}</div>
                     <div><span className="font-semibold">Requester:</span> {requisition.requesterName} ({requisition.department})</div>
                     <div><span className="font-semibold">Total Award Value:</span> <span className="font-bold text-lg text-primary">{totalAwardValue.toLocaleString()} ETB</span></div>
                </CardContent>
                <CardFooter className="flex gap-4">
                     <Dialog open={!!actionToConfirm} onOpenChange={(open) => !open && setActionToConfirm(null)}>
                        <DialogTrigger asChild>
                            <Button variant="default"><Check className="mr-2"/>Approve Award</Button>
                        </DialogTrigger>
                        <DialogTrigger asChild>
                            <Button variant="destructive"><X className="mr-2"/>Reject Award</Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Confirm Decision: {actionToConfirm === 'approve' ? 'Approve' : 'Reject'} Award</DialogTitle>
                                <DialogDescription>Please provide a brief justification for your decision. This will be recorded in the audit log.</DialogDescription>
                            </DialogHeader>
                            <div className="py-4">
                                <Label htmlFor="decision-comment">Justification / Comment</Label>
                                <Textarea id="decision-comment" value={comment} onChange={e => setComment(e.target.value)} />
                            </div>
                            <DialogFooter>
                                <Button variant="ghost" onClick={() => setActionToConfirm(null)}>Cancel</Button>
                                <Button variant={actionToConfirm === 'reject' ? 'destructive' : 'default'} onClick={() => { onAction(actionToConfirm!, comment); setActionToConfirm(null); }}>
                                    Confirm {actionToConfirm === 'approve' ? 'Approval' : 'Rejection'}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </CardFooter>
            </Card>

             <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><FileText />Requested Items</CardTitle></CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Item</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead className="text-right">Quantity</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {requisition.items.map(item => (
                                <TableRow key={item.id}>
                                    <TableCell className="font-medium">{item.name}</TableCell>
                                    <TableCell className="text-muted-foreground">{item.description}</TableCell>
                                    <TableCell className="text-right">{item.quantity}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

             <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><BadgeDollarSign />Bid Comparison</CardTitle></CardHeader>
                <CardContent>
                     <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Vendor</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Final Score</TableHead>
                                <TableHead className="text-right">Total Price (ETB)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {winningQuotes.map(q => (
                                <TableRow key={q.id} className="bg-green-500/10">
                                    <TableCell className="font-bold">{q.vendorName}</TableCell>
                                    <TableCell><Badge variant="default">Winner</Badge></TableCell>
                                    <TableCell className="text-right font-mono">{q.finalAverageScore?.toFixed(2)}</TableCell>
                                    <TableCell className="text-right font-mono">{q.totalPrice.toLocaleString()}</TableCell>
                                </TableRow>
                            ))}
                             {standbyQuotes.map(q => (
                                <TableRow key={q.id}>
                                    <TableCell>{q.vendorName}</TableCell>
                                    <TableCell><Badge variant="secondary">Standby (Rank {q.rank})</Badge></TableCell>
                                    <TableCell className="text-right font-mono">{q.finalAverageScore?.toFixed(2)}</TableCell>
                                    <TableCell className="text-right font-mono">{q.totalPrice.toLocaleString()}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
            
             <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><History />Approval History</CardTitle></CardHeader>
                <CardContent>
                    {requisition.auditLog && requisition.auditLog.length > 0 ? (
                        <div className="relative pl-6">
                            <div className="absolute left-6 top-0 h-full w-0.5 bg-border -translate-x-1/2"></div>
                            {requisition.auditLog.map((log) => (
                                <div key={log.id} className="relative mb-6">
                                    <div className="absolute -left-3 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-secondary">
                                        <div className="h-3 w-3 rounded-full bg-primary"></div>
                                    </div>
                                    <div className="pl-8">
                                        <p className="font-semibold">{log.action.replace(/_/g, ' ')}</p>
                                        <p className="text-sm text-muted-foreground">{log.details}</p>
                                        <p className="text-xs text-muted-foreground mt-1">By {log.user} ({log.role}) - {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-muted-foreground">No history available.</p>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}


export default function ReviewPage() {
    const [requisition, setRequisition] = useState<PurchaseRequisition | null>(null);
    const [loading, setLoading] = useState(true);
    const [isActionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;
    const { user, token } = useAuth();
    const { toast } = useToast();

    useEffect(() => {
        if (!id || !token) return;

        const fetchRequisition = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`/api/requisitions/${id}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) {
                    throw new Error('Failed to fetch requisition details for review.');
                }
                const data = await res.json();
                setRequisition(data);
            } catch (e) {
                setError(e instanceof Error ? e.message : 'An unknown error occurred');
            } finally {
                setLoading(false);
            }
        };

        fetchRequisition();
    }, [id, token]);
    
    const handleAction = async (type: 'approve' | 'reject', comment: string) => {
        if (!requisition || !user) return;
        setActionLoading(true);
        try {
            const response = await fetch(`/api/requisitions`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    id: requisition.id, 
                    status: type === 'approve' ? 'Approved' : 'Rejected', 
                    userId: user.id, 
                    comment: comment
                }),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Failed to ${type} award.`);
            }
            toast({
                title: 'Decision Submitted',
                description: `The award has been successfully ${type === 'approve' ? 'approved' : 'rejected'}.`
            });
            router.push('/reviews');
        } catch (error) {
             toast({
                variant: 'destructive',
                title: 'Error',
                description: error instanceof Error ? error.message : 'An unknown error occurred.',
            });
        } finally {
            setActionLoading(false);
        }
    }

    if (loading) {
        return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    if (error) {
        return (
            <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        );
    }
    
    if (!requisition) {
         return <p>Requisition not found.</p>;
    }
    
    if (!requisition.status.startsWith('Pending_')) {
        return (
            <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Review Not Required</AlertTitle>
                <AlertDescription>This requisition is no longer pending your approval.</AlertDescription>
                 <div className="mt-4">
                    <Button asChild variant="outline">
                        <Link href="/reviews">Back to Reviews</Link>
                    </Button>
                </div>
            </Alert>
        )
    }

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

