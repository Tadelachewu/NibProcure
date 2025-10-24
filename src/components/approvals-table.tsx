
'use client';

import React, { useState, useEffect, useMemo } from 'react';
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


const PAGE_SIZE = 10;

export function ApprovalsTable() {
  const [requisitions, setRequisitions] = useState<PurchaseRequisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, rfqSenderSetting, allUsers } = useAuth();
  const { toast } = useToast();

  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRequisition, setSelectedRequisition] = useState<PurchaseRequisition | null>(null);
  const [comment, setComment] = useState('');
  const [isActionDialogOpen, setActionDialogOpen] = useState(false);
  const [isDetailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);

  const fetchRequisitions = async () => {
    if (!user) return;
    try {
      setLoading(true);
      // Fetch all requisitions assigned to this user for departmental approval, regardless of current status
      const apiUrl = `/api/requisitions?status=Pending_Approval,PreApproved,Rejected&approverId=${user.id}`;
      
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error('Failed to fetch requisitions for approval');
      }
      const data: PurchaseRequisition[] = await response.json();
      setRequisitions(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
        fetchRequisitions();
    } else {
        setLoading(false);
    }
  }, [user]);

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
    
    let rfqSenderId: string | null = null;
    if (actionType === 'approve') {
      if (rfqSenderSetting.type === 'specific' && rfqSenderSetting.userId) {
        rfqSenderId = rfqSenderSetting.userId;
      } else {
        // Fallback to the first available Procurement Officer if 'all' is selected or specific user not found
        const firstProcOfficer = allUsers.find(u => u.role === 'Procurement_Officer');
        rfqSenderId = firstProcOfficer?.id || null;
      }
    }

    try {
      const response = await fetch(`/api/requisitions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            id: selectedRequisition.id, 
            status: actionType === 'approve' ? 'Approved' : 'Rejected', 
            userId: user.id, 
            comment,
            rfqSenderId, // Pass the designated RFQ sender ID to the API
        }),
      });
      if (!response.ok) throw new Error(`Failed to ${actionType} requisition`);
      toast({
        title: "Success",
        description: `Requisition ${selectedRequisition.id} has been ${actionType === 'approve' ? 'processed' : 'rejected'}.`,
      });
      fetchRequisitions(); // Re-fetch data to update the table
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
        return 'secondary';
      default:
        return 'outline';
    }
  }

  const getStatusVariant = (status: string) => {
    switch (status.replace(/_/g, ' ')) {
      case 'PreApproved': return 'default';
      case 'Pending Approval': return 'secondary';
      case 'Rejected': return 'destructive';
      default: return 'outline';
    }
  };


  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (error) return <div className="text-destructive">Error: {error}</div>;

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>Departmental Approvals</CardTitle>
        <CardDescription>
          Review and act on items from your department.
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
                paginatedRequisitions.map((req, index) => (
                  <TableRow key={req.id}>
                      <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                      <TableCell className="font-medium text-primary">{req.id}</TableCell>
                      <TableCell>{req.title}</TableCell>
                      <TableCell>{req.requesterName}</TableCell>
                       <TableCell>
                        <Badge variant={getUrgencyVariant(req.urgency)}>{req.urgency}</Badge>
                      </TableCell>
                       <TableCell>
                        <Badge variant={getStatusVariant(req.status)}>{req.status.replace(/_/g, ' ')}</Badge>
                      </TableCell>
                      <TableCell>
                      <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleShowDetails(req)}>
                              <Eye className="mr-2 h-4 w-4" /> Details
                          </Button>
                          <Button variant="default" size="sm" onClick={() => handleAction(req, 'approve')} disabled={req.status !== 'Pending_Approval'}>
                              <Check className="mr-2 h-4 w-4" /> Approve
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => handleAction(req, 'reject')} disabled={req.status !== 'Pending_Approval'}>
                              <X className="mr-2 h-4 w-4" /> Reject
                          </Button>
                      </div>
                      </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-48 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <Inbox className="h-16 w-16 text-muted-foreground/50" />
                      <div className="space-y-1">
                        <p className="font-semibold">All caught up!</p>
                        <p className="text-muted-foreground">No items from your department require your attention.</p>
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
              <Label htmlFor="comment">Comment</Label>
              <Textarea 
                id="comment" 
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Type your comment here..."
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
            reuisition={selectedRequisition} 
            isOpen={isDetailsDialogOpen} 
            onClose={() => setDetailsDialogOpen(false)} 
        />
    )}
    </>
  );
}
