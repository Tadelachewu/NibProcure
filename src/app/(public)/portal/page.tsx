
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PurchaseRequisition } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowRight, Building, Calendar, FileText, Search, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { useDebounce } from '@/hooks/use-debounce';

const PAGE_SIZE = 6;

export default function PublicPortalPage() {
  const [requisitions, setRequisitions] = useState<PurchaseRequisition[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const router = useRouter();
  const { toast } = useToast();
  
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const fetchOpenTenders = useCallback(async (page: number, search: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status: 'PreApproved',
        page: page.toString(),
        limit: PAGE_SIZE.toString(),
      });
      if (search) {
        params.append('search', search);
      }

      const response = await fetch(`/api/requisitions?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch open tenders.');
      }
      const data = await response.json();
      setRequisitions(data.requisitions || []);
      setTotalCount(data.totalCount || 0);
    } catch (error) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'Error Loading Tenders',
        description: error instanceof Error ? error.message : 'An unknown error occurred.'
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);
  
  useEffect(() => {
    fetchOpenTenders(currentPage, debouncedSearchTerm);
  }, [currentPage, debouncedSearchTerm, fetchOpenTenders]);
  
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm]);


  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">Public Tenders</h1>
        <p className="mt-2 text-lg text-muted-foreground">
          Browse open procurement opportunities at Nib InternationalBank.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex-1">
                <CardTitle>Open Requisitions</CardTitle>
                <CardDescription>The following tenders are currently open for bidding.</CardDescription>
            </div>
            <div className="relative w-full md:max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                    placeholder="Search by title or department..." 
                    className="pl-10"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
          ) : requisitions.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {requisitions.map(req => (
                  <Card key={req.id} className="flex flex-col hover:shadow-lg transition-shadow duration-300">
                    <CardHeader>
                      <CardTitle className="text-lg">{req.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="flex-grow space-y-4 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                          <Building className="h-4 w-4" />
                          <span>{req.department} Department</span>
                      </div>
                       <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          <span>Posted on: {format(new Date(req.createdAt), 'PPP')}</span>
                      </div>
                    </CardContent>
                    <CardFooter>
                      <Button className="w-full" onClick={() => router.push(`/portal/${req.id}`)}>
                        View Details <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6">
                    <div className="text-sm text-muted-foreground">
                        Page {currentPage} of {totalPages}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}><ChevronsLeft /></Button>
                        <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft /></Button>
                        <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight /></Button>
                        <Button variant="outline" size="icon" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}><ChevronsRight /></Button>
                    </div>
                </div>
              )}
            </>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-center border-2 border-dashed rounded-lg">
                <FileText className="h-12 w-12 text-muted-foreground" />
                <p className="mt-4 font-semibold">No Open Tenders</p>
                <p className="text-sm text-muted-foreground">There are currently no requisitions open for public bidding that match your search.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
