
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from './ui/card';
import { Button } from './ui/button';
import { PurchaseRequisition, User } from '@/lib/types';
import { format } from 'date-fns';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  Inbox,
  Loader2,
  Users,
  X,
  FileText,
  FileBarChart2,
  AlertTriangle,
  MessageSquare,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { ApprovalSummaryDialog } from './approval-summary-dialog';
import { Badge } from './ui/badge';
import Link from 'next/link';


const PAGE_SIZE = 10;

type RequisitionWithAction = PurchaseRequisition & {
    isActionable?: boolean;
    actionTaken?: 'APPROVED' | 'REJECTED' | null;
}

export function AwardReviewsTable() {
  const [requisitions, setRequisitions] = useState<RequisitionWithAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, token } = useAuth();
  const { toast } = useToast();

  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRequisition, setSelectedRequisition] = useState<PurchaseRequisition | null>(null);
  const [justification, setJustification] = useState('');
  const [isActionDialogOpen, setActionDialogOpen] = useState(false);
  const [isDetailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  
  useEffect(() => {
    if (isActionDialogOpen && selectedRequisition) {
        const savedComment = localStorage.getItem(`award-review-comment-${selectedRequisition.id}`);
        if (savedComment) {
            setJustification(savedComment);
        }
    } else {
        setJustification('');
    }
  }, [isActionDialogOpen, selectedRequisition]);

  useEffect(() => {
      if (isActionDialogOpen && selectedRequisition) {
          localStorage.setItem(`award-review-comment-${selectedRequisition.id}`, justification);
      }
  }, [justification, isActionDialogOpen, selectedRequisition]);


  const fetchRequisitions = useCallback(async () => {
    if (!user || !token) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const response = await fetch(`/api/reviews?includeActionedFor=${user.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch requisitions for award review');
      
      const data: RequisitionWithAction[] = await response.json();
      setRequisitions(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  }, [user, token]);

  useEffect(() => {
    fetchRequisitions();
  }, [fetchRequisitions]);

  const handleAction = (req: PurchaseRequisition, type: 'approve' | 'reject') => {
    setSelectedRequisition(req);
    setActionType(type);
    setActionDialogOpen(true);
  }

  const handleShowDetails = (req: PurchaseRequisition) => {
    setSelectedRequisition(req);
    setDetailsDialogOpen(true);
  }
  
  const submitAction = async () => {
    if (!selectedRequisition || !actionType || !user) return;
    
    if (!justification.trim()) {
        toast({
            variant: 'destructive',
            title: 'Justification Required',
            description: 'A justification for the decision is required for the minutes.',
        });
        return;
    }

    setActiveActionId(selectedRequisition.id);

    const minute = {
        decisionBody: selectedRequisition.status.replace(/_/g, ' '),
        justification,
        attendeeIds: [user.id],
    }

    try {
      const response = await fetch(`/api/requisitions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            id: selectedRequisition.id, 
            status: actionType === 'approve' ? 'Approved' : 'Rejected', 
            userId: user.id, 
            comment: justification,
            minute,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${actionType} requisition award`);
      }
      
      toast({
        title: "Success",
        description: `Award for requisition ${selectedRequisition.id} has been ${actionType === 'approve' ? 'processed' : 'rejected'}.`,
      });
      localStorage.removeItem(`award-review-comment-${selectedRequisition.id}`);
      fetchRequisitions();

    } catch (error) {
      toast({
        variant: 'destructive',
        title: "Error",
        description: error instanceof Error ? error.message : "An unknown error occurred.",
      });
    } finally {
        setActiveActionId(null);
        setActionDialogOpen(false);
        setJustification('');
        setSelectedRequisition(null);
        setActionType(null);
    }
  }

  const totalPages = Math.ceil(requisitions.length / PAGE_SIZE);
  const paginatedRequisitions = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return requisitions.slice(startIndex, startIndex + PAGE_SIZE);
  }, [requisitions, currentPage]);


  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (error) return <div className="text-destructive text-center p-8">{error}</div>;

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>Award Reviews</CardTitle>
        <CardDescription>
          Review and act on award recommendations that require your final approval.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Req. ID</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Award Value</TableHead>
                <TableHead>Required Review</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedRequisitions.length > 0 ? (
                paginatedRequisitions.map((req, index) => {
                  const isLoadingAction = activeActionId === req.id;
                  
                  const actionTaken = req.actionTaken;

                  const lastCommentLog = req.auditTrail?.find(log => log.details.includes(req.approverComment || ''));
                  const isRejectionComment = lastCommentLog?.action.includes('REJECT');
                  
                  return (
                    <TableRow key={req.id}>
                        <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                        <TableCell className="font-medium text-primary">{req.id}</TableCell>
                        <TableCell>
                            <div className="flex flex-col">
                                <span>{req.title}</span>
                                {req.approverComment && (
                                    <div className={`text-xs flex items-start gap-1 mt-1 ${isRejectionComment ? 'text-destructive' : 'text-muted-foreground'}`}>
                                        {isRejectionComment 
                                            ? <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                                            : <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
                                        }
                                        <div className="flex flex-col whitespace-pre-wrap break-words">
                                            <span className="font-semibold">{isRejectionComment ? 'Rejection Reason:' : 'Approval Comment:'}</span>
                                            <span className="italic">"{req.approverComment}"</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </TableCell>
                        <TableCell className="font-semibold">{req.totalPrice.toLocaleString()} ETB</TableCell>
                        <TableCell><Badge variant="secondary">{req.status.replace(/_/g, ' ')}</Badge></TableCell>
                        <TableCell>{format(new Date(req.createdAt), 'PP')}</TableCell>
                        <TableCell>
                        <div className="flex gap-2">
                              <Button variant="outline" size="sm" onClick={() => handleShowDetails(req)}>
                                <FileText className="mr-2 h-4 w-4" /> Summary
                              </Button>
                              <Button variant="outline" size="sm" asChild>
                                  <Link href={`/quotations/${req.id}`}>
                                      <Eye className="mr-2 h-4 w-4" /> Review Bids
                                  </Link>
                              </Button>
                              <Button 
                                variant={actionTaken === 'APPROVED' ? 'default' : 'outline'}
                                size="sm" 
                                onClick={() => handleAction(req, 'approve')} 
                                disabled={!req.isActionable || isLoadingAction}
                              >
                                {isLoadingAction && actionType === 'approve' ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Check className="mr-2 h-4 w-4" />} 
                                Approve
                            </Button>
                            <Button 
                                variant={actionTaken === 'REJECTED' ? 'destructive' : 'destructive'} 
                                size="sm" 
                                onClick={() => handleAction(req, 'reject')} 
                                disabled={!req.isActionable || isLoadingAction}
                                className={actionTaken === 'REJECTED' ? '' : 'bg-opacity-50'}
                            >
                                {isLoadingAction && actionType === 'reject' ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <X className="mr-2 h-4 w-4" />} 
                                Reject
                            </Button>
                        </div>
                        </TableCell>
                    </TableRow>
                  )
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-48 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <Inbox className="h-16 w-16 text-muted-foreground/50" />
                      <div className="space-y-1">
                        <p className="font-semibold">All Caught Up!</p>
                        <p className="text-muted-foreground">No award recommendations are currently pending your review.</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-muted-foreground">
                    Showing {Math.min(1 + (currentPage - 1) * PAGE_SIZE, requisitions.length)} to {Math.min(currentPage * PAGE_SIZE, requisitions.length)} of {requisitions.length} requisitions.
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}><ChevronsLeft className="h-4 w-4" /></Button>
                    <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1}><ChevronLeft className="h-4 w-4" /></Button>
                    <span className="text-sm">Page {currentPage > 0 ? currentPage : 1} of {totalPages > 0 ? totalPages : 1}</span>
                    <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages}><ChevronRight className="h-4 w-4" /></Button>
                    <Button variant="outline" size="icon" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}><ChevronsRight className="h-4 w-4" /></Button>
                </div>
            </div>
        )}
      </CardContent>
       <Dialog open={isActionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Record Minute for {actionType === 'approve' ? 'Approval' : 'Rejection'}
            </DialogTitle>
            <DialogDescription>
                Record the official minute for the decision on the award for {selectedRequisition?.id}. This is a formal record for auditing purposes.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="justification">Justification / Remarks</Label>
              <Textarea 
                id="justification" 
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Provide a detailed rationale for the committee's decision..."
                rows={6}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setActionDialogOpen(false)}>Cancel</Button>
            <Button onClick={submitAction} variant={actionType === 'approve' ? 'default' : 'destructive'}>
                Submit {actionType === 'approve' ? 'Approval' : 'Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
    {selectedRequisition && (
        <ApprovalSummaryDialog
            requisition={selectedRequisition} 
            isOpen={isDetailsDialogOpen} 
            onClose={() => setDetailsDialogOpen(false)} 
        />
    )}
    </>
  );
}
