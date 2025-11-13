
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
import { Badge } from './ui/badge';
import { Contract } from '@/lib/types';
import { format } from 'date-fns';
import { FileText, CircleCheck, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, FileX2, Loader2, PlusCircle, ArrowRight, Search, ListFilter } from 'lucide-react';
import { Button } from './ui/button';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { Input } from './ui/input';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { useToast } from '@/hooks/use-toast';

const PAGE_SIZE = 10;

export function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const { user, role } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  
  const fetchContracts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/contracts');
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch contracts");
      }
      if (Array.isArray(data)) {
        setContracts(data);
      } else {
        throw new Error("Received invalid data from server.");
      }
    } catch (error) {
      console.error("Failed to fetch contracts", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Could not fetch contracts data."
      })
    } finally {
      setLoading(false);
    }
  }, [toast]);
  
  useEffect(() => {
    fetchContracts();
    window.addEventListener('focus', fetchContracts);
    return () => {
        window.removeEventListener('focus', fetchContracts);
    }
  }, [fetchContracts]);

  const filteredContracts = useMemo(() => {
    return contracts
      .filter(contract => {
        if (statusFilter === 'All') return true;
        return contract.status === statusFilter;
      })
      .filter(contract => {
        const lowerSearch = searchTerm.toLowerCase();
        return (
          contract.contractNumber.toLowerCase().includes(lowerSearch) ||
          contract.requisition.title.toLowerCase().includes(lowerSearch) ||
          contract.vendor.name.toLowerCase().includes(lowerSearch)
        );
      });
  }, [contracts, statusFilter, searchTerm]);

  const totalPages = Math.ceil(filteredContracts.length / PAGE_SIZE);
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredContracts.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredContracts, currentPage]);

  const getStatusVariant = (status: 'Draft' | 'Active' | 'Expired') => {
    switch(status) {
        case 'Active': return 'default';
        case 'Draft': return 'secondary';
        case 'Expired': return 'destructive';
    }
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <Card>
      <CardHeader className="flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <CardTitle>Contract Management</CardTitle>
          <CardDescription>
            View and manage all finalized contracts with vendors.
          </CardDescription>
        </div>
        {role === 'Procurement Officer' && (
            <Button onClick={() => router.push('/contracts/new')}>
                <PlusCircle className="mr-2"/>
                Create New Contract
            </Button>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <div className="relative flex-1 min-w-[250px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search by contract #, title, vendor..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2">
                    <ListFilter className="h-4 w-4" />
                    Filter Status
                    {statusFilter !== 'All' && <Badge variant="secondary">{statusFilter}</Badge>}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2">
                <div className="grid gap-1">
                    <Button variant={statusFilter === 'All' ? 'secondary' : 'ghost'} className="justify-start" onClick={() => setStatusFilter('All')}>All Statuses</Button>
                    <Button variant={statusFilter === 'Draft' ? 'secondary' : 'ghost'} className="justify-start" onClick={() => setStatusFilter('Draft')}>Draft</Button>
                    <Button variant={statusFilter === 'Active' ? 'secondary' : 'ghost'} className="justify-start" onClick={() => setStatusFilter('Active')}>Active</Button>
                    <Button variant={statusFilter === 'Expired' ? 'secondary' : 'ghost'} className="justify-start" onClick={() => setStatusFilter('Expired')}>Expired</Button>
                </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contract #</TableHead>
                <TableHead>Requisition Title</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Term</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.length > 0 ? (
                paginatedData.map((contract) => (
                  <TableRow key={contract.id} className="cursor-pointer" onClick={() => router.push(`/contracts/${contract.id}`)}>
                    <TableCell className="font-medium text-primary">{contract.contractNumber}</TableCell>
                    <TableCell>{contract.requisition.title}</TableCell>
                    <TableCell>{contract.vendor.name}</TableCell>
                    <TableCell>
                        {format(new Date(contract.startDate), 'PP')} - {format(new Date(contract.endDate), 'PP')}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(contract.status)}>{contract.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                        <Button variant="ghost" size="sm">
                            View Details <ArrowRight className="ml-2 h-4 w-4"/>
                        </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-48 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <FileX2 className="h-16 w-16 text-muted-foreground/50" />
                      <div className="space-y-1">
                        <p className="font-semibold">No Contracts Found</p>
                        <p className="text-muted-foreground">No contracts match your current filters.</p>
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
            Page {currentPage} of {totalPages || 1} ({filteredContracts.length} total contracts)
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
