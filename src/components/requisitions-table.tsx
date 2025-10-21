
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
import { Input } from './ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Button } from './ui/button';
import { PurchaseRequisition, RequisitionStatus, Urgency } from '@/lib/types';
import { format } from 'date-fns';
import { Badge } from './ui/badge';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  Send,
  CircleAlert,
  CircleCheck,
  Info,
  FileEdit,
  Eye,
  ListX,
  Loader2,
  Trash2,
  MoreHorizontal,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { useRouter } from 'next/navigation';
import { RequisitionDetailsDialog } from './requisition-details-dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu';


const PAGE_SIZE = 10;

export function RequisitionsTable() {
  const [requisitions, setRequisitions] = useState<PurchaseRequisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, role } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | 'all'>('all');
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);
  
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedRequisition, setSelectedRequisition] = useState<PurchaseRequisition | null>(null);

  const fetchRequisitions = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/requisitions');
      if (!response.ok) {
        throw new Error('Failed to fetch requisitions');
      }
      const data = await response.json();
      setRequisitions(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequisitions();
  }, []);
  
  const handleSubmitForApproval = async (id: string) => {
    try {
      const response = await fetch(`/api/requisitions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'Pending Approval', userId: user?.id }),
      });
      if (!response.ok) throw new Error('Failed to submit for approval');
      toast({
        title: "Success",
        description: `Requisition ${id} submitted for approval.`,
      });
      fetchRequisitions(); // Re-fetch data to update the table
    } catch (error) {
      toast({
        variant: 'destructive',
        title: "Error",
        description: error instanceof Error ? error.message : "An unknown error occurred.",
      });
    }
  };

  const handleDeleteRequisition = async (id: string) => {
    if (!user) return;
    try {
        const response = await fetch(`/api/requisitions/${id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id }),
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to delete requisition.');
        }
        toast({
            title: "Requisition Deleted",
            description: `Requisition ${id} has been successfully deleted.`,
        });
        fetchRequisitions();
    } catch (error) {
        toast({
            variant: 'destructive',
            title: 'Error',
            description: error instanceof Error ? error.message : 'An unknown error occurred.',
        });
    }
  };
  
  const handleViewDetails = (req: PurchaseRequisition) => {
      setSelectedRequisition(req);
      setIsDetailsOpen(true);
  }

  const filteredRequisitions = useMemo(() => {
    let filtered = requisitions;

    // Apply other filters
    return filtered
      .filter(req => {
        const lowerCaseSearch = searchTerm.toLowerCase();
        return (
          req.title.toLowerCase().includes(lowerCaseSearch) ||
          req.id.toLowerCase().includes(lowerCaseSearch) ||
          (req.requesterName && req.requesterName.toLowerCase().includes(lowerCaseSearch))
        );
      })
      .filter(req => statusFilter === 'all' || req.status.replace(/ /g, '_') === statusFilter)
      .filter(req => !dateFilter || new Date(req.createdAt).toDateString() === dateFilter.toDateString());
  }, [requisitions, searchTerm, statusFilter, dateFilter, role, user]);

  const totalPages = Math.ceil(filteredRequisitions.length / PAGE_SIZE);
  const paginatedRequisitions = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredRequisitions.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredRequisitions, currentPage]);


  const getStatusVariant = (status: string) => {
    switch (status.replace(/_/g, ' ')) {
      case 'Approved':
        return 'default';
      case 'Pending Approval':
        return 'secondary';
      case 'Pending Managerial Approval':
        return 'secondary';
      case 'Rejected':
        return 'destructive';
      case 'Draft':
        return 'outline';
      default:
        return 'outline';
    }
  };

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

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (error) return <div className="text-destructive">Error: {error}</div>;

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>All Requisitions</CardTitle>
        <CardDescription>
          Browse and manage all purchase requisitions across the organization.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by title, ID, or requester..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={value => setStatusFilter(value as any)}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="Draft">Draft</SelectItem>
              <SelectItem value="Pending_Approval">Pending Approval</SelectItem>
              <SelectItem value="Pending_Managerial_Approval">Pending Managerial Approval</SelectItem>
              <SelectItem value="Approved">Approved</SelectItem>
              <SelectItem value="Rejected">Rejected</SelectItem>
              <SelectItem value="PO_Created">PO Created</SelectItem>
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto justify-start text-left font-normal">
                {dateFilter ? format(dateFilter, 'PPP') : <span>Filter by date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={dateFilter}
                onSelect={setDateFilter}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <Button variant="outline" onClick={() => { setSearchTerm(''); setStatusFilter('all'); setDateFilter(undefined); setCurrentPage(1); }}>
            Clear
          </Button>
        </div>
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Req. ID</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Requester</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Urgency</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead>Deadline</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedRequisitions.length > 0 ? (
                paginatedRequisitions.map((req, index) => (
                  <TableRow key={req.id}>
                    <TableCell className="text-muted-foreground">{(currentPage - 1) * PAGE_SIZE + index + 1}</TableCell>
                    <TableCell className="font-medium text-primary">{req.id}</TableCell>
                    <TableCell>{req.title}</TableCell>
                    <TableCell>{req.requesterName}</TableCell>
                    <TableCell>{req.department}</TableCell>
                     <TableCell>
                      <Badge variant={getUrgencyVariant(req.urgency)}>{req.urgency}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={getStatusVariant(req.status)}>{req.status.replace(/_/g, ' ')}</Badge>
                         {req.status === 'Rejected' && req.approverComment && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <Info className="h-4 w-4 text-muted-foreground cursor-pointer" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">Rejection Reason: {req.approverComment}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{format(new Date(req.createdAt), 'PP')}</TableCell>
                    <TableCell>
                        {req.deadline ? format(new Date(req.deadline), 'PP') : 'N/A'}
                    </TableCell>
                    <TableCell className="text-right">
                       <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <span className="sr-only">Open menu</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => handleViewDetails(req)}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            {req.requesterId === user?.id && (req.status === 'Draft' || req.status === 'Rejected') && (
                              <DropdownMenuItem onClick={() => router.push(`/requisitions/${req.id}/edit`)}>
                                <FileEdit className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                            )}
                            {req.requesterId === user?.id && req.status === 'Draft' && (
                              <DropdownMenuItem onClick={() => handleSubmitForApproval(req.id)}>
                                <Send className="mr-2 h-4 w-4" />
                                Submit for Approval
                              </DropdownMenuItem>
                            )}
                            {req.requesterId === user?.id && (req.status === 'Draft' || req.status === 'Pending_Approval') && (
                              <>
                                <DropdownMenuSeparator />
                                 <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Delete
                                    </DropdownMenuItem>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                      <AlertDialogHeader>
                                      <AlertDialogTitle>Are you sure you want to delete this requisition?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                          This action cannot be undone. This will permanently delete the requisition for "{req.title}".
                                      </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleDeleteRequisition(req.id)} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">Delete</AlertDialogAction>
                                      </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={10} className="h-48 text-center">
                    <div className="flex flex-col items-center gap-4">
                        <ListX className="h-16 w-16 text-muted-foreground/50" />
                        <div className="space-y-1">
                            <p className="font-semibold">No Results Found</p>
                            <p className="text-muted-foreground">Your search or filter combination yielded no results.</p>
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
            Showing {Math.min(1 + (currentPage - 1) * PAGE_SIZE, filteredRequisitions.length)} to {Math.min(currentPage * PAGE_SIZE, filteredRequisitions.length)} of {filteredRequisitions.length} requisitions.
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
      </CardContent>
    </Card>
    {selectedRequisition && (
        <RequisitionDetailsDialog
            isOpen={isDetailsOpen}
            onClose={() => setIsDetailsOpen(false)}
            reuisition={selectedRequisition}
        />
    )}
    </>
  );
}
