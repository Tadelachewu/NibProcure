
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
import { PurchaseRequisition } from '@/lib/types';
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
import Link from 'next/link';


const PAGE_SIZE = 10;

export function ReviewsTable() {
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
  const [activeActionId, setActiveActionId] = useState<string | null>(null);

  const fetchRequisitions = async () => {
    if (!user || !token) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      
      const response = await fetch(`/api/reviews`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch requisitions for review');
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
    fetchRequisitions();
  }, [user, token]);

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
    
    setActiveActionId(selectedRequisition.id);

    try {
      const response = await fetch(`/api/requisitions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            id: selectedRequisition.id, 
            status: actionType === 'approve' ? 'Approved' : 'Rejected', 
            userId: user.id, 
            comment,
        }),
      });
      if (!response.ok) throw new Error(`Failed to ${actionType} requisition`);
      toast({
        title: "Success",
        description: `Requisition award for ${selectedRequisition.id} has been ${actionType === 'approve' ? 'processed' : 'rejected'}.`,
      });
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


  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (error) return <div className="text-destructive text-center p-8">{error}</div>;

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>Award Recommendations for Committee Review</CardTitle>
        <CardDescription>
          Review and act on award recommendations that require your committee's approval.
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
                  return (
                    <TableRow key={req.id}>
                        <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                        <TableCell className="font-medium text-primary">{req.id}</TableCell>
                        <TableCell>{req.title}</TableCell>
                        <TableCell className="font-semibold">{req.totalPrice.toLocaleString()} ETB</TableCell>
                        <TableCell><Badge variant="secondary">{req.status.replace(/_/g, ' ')}</Badge></TableCell>
                        <TableCell>{format(new Date(req.createdAt), 'PP')}</TableCell>
                        <TableCell>
                        <div className="flex gap-2">
                              <Button variant="outline" size="sm" onClick={() => handleShowDetails(req)}>
                                  <Eye className="mr-2 h-4 w-4" /> Details
                              </Button>
                              <Button variant="outline" size="sm" asChild>
                                  <Link href={`/quotations/${req.id}`}>
                                      <Eye className="mr-2 h-4 w-4" /> Review Bids
                                  </Link>
                              </Button>
                              <Button variant="default" size="sm" onClick={() => handleAction(req, 'approve')} disabled={isLoadingAction}>
                                {isLoadingAction && actionType === 'approve' ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Check className="mr-2 h-4 w-4" />} 
                                Approve
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => handleAction(req, 'reject')} disabled={isLoadingAction}>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve' ? 'Approve Recommendation' : 'Reject Recommendation'} for {selectedRequisition?.id}
            </DialogTitle>
            <DialogDescription>
                You are about to {actionType} this award recommendation. Please provide a comment for this action.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="comment">Comment (Required)</Label>
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
            <Button onClick={submitAction} variant={actionType === 'approve' ? 'default' : 'destructive'}>
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
