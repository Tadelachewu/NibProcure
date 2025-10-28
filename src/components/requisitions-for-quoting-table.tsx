

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
import { format, isPast } from 'date-fns';
import { Badge } from './ui/badge';
import { useRouter } from 'next/navigation';
import { ArrowRight, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, FileX2, Loader2, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';

const PAGE_SIZE = 10;

export function RequisitionsForQuotingTable() {
  const [requisitions, setRequisitions] = useState<PurchaseRequisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const router = useRouter();
  const { user, allUsers, role, token, committeeQuorum } = useAuth();


  useEffect(() => {
    const fetchRequisitions = async () => {
        if (!user || !token) return;
        try {
            setLoading(true);
            const response = await fetch(`/api/requisitions?forQuoting=true`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                throw new Error('Failed to fetch requisitions');
            }
            const data: PurchaseRequisition[] = await response.json();
            setRequisitions(data);

        } catch (e) {
            setError(e instanceof Error ? e.message : 'An unknown error occurred');
        } finally {
            setLoading(false);
        }
    };
    if (user) {
        fetchRequisitions();
    }
  }, [user, role, allUsers, token]);
  
  const totalPages = Math.ceil(requisitions.length / PAGE_SIZE);
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return requisitions.slice(startIndex, startIndex + PAGE_SIZE);
  }, [requisitions, currentPage]);


  const handleRowClick = (reqId: string) => {
    router.push(`/quotations/${reqId}`);
  }

 const getStatusBadge = (req: PurchaseRequisition) => {
    const quoteCount = req.quotations?.length || 0;
    const deadlinePassed = req.deadline ? isPast(new Date(req.deadline)) : false;
    const scoringDeadlinePassed = req.scoringDeadline ? isPast(new Date(req.scoringDeadline)) : false;

    // Handle terminal or high-priority statuses first
    if (req.status === 'PO_Created') {
        return <Badge variant="default" className="bg-green-700">PO Created</Badge>;
    }
     if (req.status === 'Award_Declined') {
        return <Badge variant="destructive" className="animate-pulse">Award Declined - Action Required</Badge>;
    }
    if (req.status.startsWith('Pending_')) {
      return <Badge variant="outline" className="border-amber-500 text-amber-600">{req.status.replace(/_/g, ' ')}</Badge>;
    }
    if (req.status === 'PostApproved') {
        return <Badge variant="default" className="bg-amber-500 text-white animate-pulse">Ready to Notify Vendor</Badge>;
    }
    if (req.status === 'Awarded') {
        return <Badge variant="default" className="bg-green-600">Awarded</Badge>;
    }

    // Handle pre-bidding state
    if (req.status === 'PreApproved') {
        return <Badge variant="default" className="bg-blue-500 text-white">Ready for RFQ</Badge>;
    }
    
    // Handle active bidding state
    if (req.status === 'Accepting_Quotes' && !deadlinePassed) {
        return <Badge variant="outline">Accepting Quotes ({quoteCount} submitted)</Badge>;
    }

    if (req.status === 'Accepting_Quotes' && deadlinePassed && quoteCount === 0) {
        return <Badge variant="destructive" className="flex items-center gap-1"><AlertTriangle className="h-3 w-3"/> No Bids Received</Badge>;
    }

    if (req.status === 'Accepting_Quotes' && deadlinePassed && quoteCount > 0 && quoteCount < committeeQuorum) {
        return <Badge variant="destructive" className="flex items-center gap-1"><AlertTriangle className="h-3 w-3"/> Quorum Not Met</Badge>;
    }

    // Handle all post-bidding-deadline states
    if (deadlinePassed) {
        const hasCommittee = !!req.committeeName;

        if (!hasCommittee) {
             return <Badge variant="destructive">Ready for Committee Assignment</Badge>;
        }

        // IMPORTANT: Prioritize the explicit status from the DB if available
        if (req.status === 'Scoring_Complete') {
            return <Badge variant="default" className="bg-green-600">Ready to Award</Badge>;
        }

        if (scoringDeadlinePassed) {
             const allHaveScored = (req.financialCommitteeMemberIds || []).length > 0 && 
                                  [...(req.financialCommitteeMemberIds || []), ...(req.technicalCommitteeMemberIds || [])]
                                  .every(id => req.committeeAssignments?.some(a => a.userId === id && a.scoresSubmitted));
            if (!allHaveScored) {
                 return <Badge variant="destructive" className="animate-pulse">Scoring Overdue</Badge>;
            }
        }
        
        return <Badge variant="secondary">Scoring in Progress</Badge>;
    }
    
    // Default fallback badge
    return <Badge variant="outline">{req.status.replace(/_/g, ' ')}</Badge>;
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (error) return <div className="text-destructive">Error: {error}</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Requisitions in Quotation</CardTitle>
        <CardDescription>
          {role === 'Committee_Member' 
            ? 'Requisitions assigned to you for scoring.'
            : 'Manage requisitions that are ready for the RFQ process, are in scoring, or have been awarded.'
          }
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
                <TableHead>Department</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.length > 0 ? (
                paginatedData.map((req, index) => (
                  <TableRow key={req.id} className="cursor-pointer" onClick={() => handleRowClick(req.id)}>
                    <TableCell className="text-muted-foreground">{(currentPage - 1) * PAGE_SIZE + index + 1}</TableCell>
                    <TableCell className="font-medium text-primary">{req.id}</TableCell>
                    <TableCell>{req.title}</TableCell>
                    <TableCell>{req.department}</TableCell>
                    <TableCell>
                      {getStatusBadge(req)}
                    </TableCell>
                    <TableCell className="text-right">
                       <Button variant="outline" size="sm">
                          {role === 'Committee_Member' ? 'View & Score' : 'Manage'} <ArrowRight className="ml-2 h-4 w-4" />
                       </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-48 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <FileX2 className="h-16 w-16 text-muted-foreground/50" />
                      <div className="space-y-1">
                        <p className="font-semibold">No Requisitions Found</p>
                        <p className="text-muted-foreground">
                            {role === 'Committee_Member'
                                ? 'There are no requisitions currently assigned to you for scoring.'
                                : 'There are no requisitions assigned to you in the RFQ process.'
                            }
                        </p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
         <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages || 1} ({requisitions.length} total requisitions)
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}><ChevronsLeft /></Button>
            <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft /></Button>
            <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight /></Button>
            <Button variant="outline" size="icon" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}><ChevronsRight /></Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
