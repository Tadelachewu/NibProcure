
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
import { PurchaseRequisition, Urgency } from '@/lib/types';
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
  X,
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
import { RequisitionDetailsDialog } from './requisition-details-dialog';
import { Badge } from './ui/badge';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';


const PAGE_SIZE = 10;

export function ApprovalsTable() {
  const [requisitions, setRequisitions] = useState<PurchaseRequisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, token } = useAuth();
  const { toast } = useToast();

  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRequisition, setSelectedRequisition] = useState<PurchaseRequisition | null>(null);
  const [comment, setComment] = useState('');
  const [isActionDialogOpen, setActionDialogOpen] = useState(false);
  const [isDetailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);

  useEffect(() => {
    if (isActionDialogOpen && selectedRequisition) {
      const savedComment = localStorage.getItem(`approval-comment-${selectedRequisition.id}`);
      if (savedComment) {
        setComment(savedComment);
      }
    } else {
        setComment(''); // Clear comment when dialog closes
    }
  }, [isActionDialogOpen, selectedRequisition]);

  useEffect(() => {
    if (isActionDialogOpen && selectedRequisition) {
      localStorage.setItem(`approval-comment-${selectedRequisition.id}`, comment);
    }
  }, [comment, isActionDialogOpen, selectedRequisition]);


  const fetchRequisitions = useCallback(async () => {
    if (!user || !token) return;
    try {
      setLoading(true);
      // This API call now fetches items pending for the user OR items they have already actioned.
      const response = await fetch(`/api/requisitions?approverId=${user.id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) {
        throw new Error('Failed to fetch requisitions for approval');
      }
      const data = await response.json();
      // Filter for only statuses relevant to the departmental approval workflow
      const preApprovalWorkflowStatuses = ['Pending_Approval', 'Pending_Director_Approval', 'Pending_Managerial_Approval'];
      setRequisitions((data.requisitions || []).filter((r: PurchaseRequisition) => preApprovalWorkflowStatuses.includes(r.status)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  }, [user, token]);

  useEffect(() => {
    if (user) {
        fetchRequisitions();
    } else {
        setLoading(false);
    }
    
    window.addEventListener('focus', fetchRequisitions);
    return () => {
        window.removeEventListener('focus', fetchRequisitions);
    }
  }, [user, fetchRequisitions]);

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
    
    let newStatus = '';
    if (actionType === 'approve') {
        if(selectedRequisition.status === 'Pending_Approval') newStatus = 'Pending_Director_Approval';
        else if(selectedRequisition.status === 'Pending_Director_Approval') newStatus = 'Pending_Managerial_Approval';
        else if(selectedRequisition.status === 'Pending_Managerial_Approval') newStatus = 'PreApproved';
    } else {
      newStatus = 'Rejected';
    }
    
    if(!newStatus) {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not determine next approval step.' });
      return;
    }

    try {
      const response = await fetch(`/api/requisitions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ 
            id: selectedRequisition.id, 
            status: newStatus,
            userId: user.id, 
            comment,
        }),
      });
      if (!response.ok) throw new Error(`Failed to ${actionType} requisition`);
      toast({
        title: "Success",
        description: `Requisition ${selectedRequisition.id} has been ${actionType === 'approve' ? 'processed' : 'rejected'}.`,
        variant: 'success',
      });
      localStorage.removeItem(`approval-comment-${selectedRequisition.id}`);
      fetchRequisitions();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: "Error",
        description: error instanceof Error ? error.message : "An unknown error occurred.",
      });
    } finally {
        setActionDialogOpen(false);
        setComment('');
        setSelectedRequisition(null);
        setActionType(null);
    }
  }

  const totalPages = Math.ceil(requisitions.length / PAGE_SIZE);
  const paginatedRequisitions = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return requisitions.slice(startIndex, startIndex + PAGE_SIZE);
  }, [requisitions, currentPage]);

  const getUrgencyVariant = (urgency: Urgency) => {
    switch (urgency) {
      case 'High':
      case 'Critical':
        return 'destructive';
      case 'Medium':
        return 'warning';
      default:
        return 'outline';
    }
  }

  const getStatusVariant = (status: string) => {
    const s = status.replace(/_/g, ' ');
    if (s.includes('PreApproved')) return 'success';
    if (s.includes('Pending')) return 'warning';
    if (s.includes('Rejected')) return 'destructive';
    return 'outline';
  };


  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (error) return <div className="text-destructive">{error}</div>;

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>Departmental Approvals</CardTitle>
        <CardDescription>
          Review and act on items from your department or those assigned to your role in the approval chain.
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
                <TableHead>Requester</TableHead>
                <TableHead>Urgency</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedRequisitions.length > 0 ? (
                paginatedRequisitions.map((req, index) => {
                  const isCurrentUserApprover = req.currentApproverId === user?.id;
                  const lastCommentLog = req.auditTrail?.find(log => log.details.includes(req.approverComment || ''));
                  const isRejectionComment = lastCommentLog?.action.includes('REJECT');
                  return (
                    <TableRow key={req.id}>
                        <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                        <TableCell className="font-medium text-primary">{req.id}</TableCell>
                        <TableCell>{req.title}</TableCell>
                        <TableCell>{req.requesterName}</TableCell>
                        <TableCell>
                          <Badge variant={getUrgencyVariant(req.urgency)}>{req.urgency}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                              <Badge variant={getStatusVariant(req.status)}>{req.status.replace(/_/g, ' ')}</Badge>
                              {req.approverComment && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <MessageSquare className="h-4 w-4 text-muted-foreground cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="max-w-xs">
                                        <strong>{isRejectionComment ? 'Rejection Reason:' : 'Approval Comment:'}</strong> {req.approverComment}
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                          </div>
                        </TableCell>
                        <TableCell>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => handleShowDetails(req)}>
                                <Eye className="mr-2 h-4 w-4" /> Details
                            </Button>
                            <Button variant="default" size="sm" onClick={() => handleAction(req, 'approve')} disabled={!isCurrentUserApprover}>
                                <Check className="mr-2 h-4 w-4" /> Approve
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => handleAction(req, 'reject')} disabled={!isCurrentUserApprover}>
                                <X className="mr-2 h-4 w-4" /> Reject
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
                        <p className="font-semibold">All caught up!</p>
                        <p className="text-muted-foreground">No items require your attention at this time.</p>
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
                    <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    >
                    <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCurrentPage(p => p - 1)}
                    disabled={currentPage === 1}
                    >
                    <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm">
                    Page {currentPage > 0 ? currentPage : 1} of {totalPages > 0 ? totalPages : 1}
                    </span>
                    <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCurrentPage(p => p + 1)}
                    disabled={currentPage === totalPages}
                    >
                    <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    >
                    <ChevronsRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        )}
      </CardContent>
       <Dialog open={isActionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve' ? 'Approve' : 'Reject'} Item: {selectedRequisition?.id}
            </DialogTitle>
            <DialogDescription>
                You are about to {actionType} this item. Please provide a comment for this action.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="comment">Justification / Remarks</Label>
              <Textarea 
                id="comment" 
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Type your justification here..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setActionDialogOpen(false)}>Cancel</Button>
            <Button 
                onClick={submitAction} 
                variant={actionType === 'approve' ? 'default' : 'destructive'}
            >
                Submit {actionType === 'approve' ? 'Approval' : 'Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
    {selectedRequisition && (
        <RequisitionDetailsDialog 
            requisition={selectedRequisition} 
            isOpen={isDetailsDialogOpen} 
            onClose={() => setDetailsDialogOpen(false)} 
        />
    )}
    </>
  );
}
