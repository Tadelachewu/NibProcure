

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
import { PurchaseOrder, PurchaseRequisition } from '@/lib/types';
import { format } from 'date-fns';
import { Button } from './ui/button';
import Link from 'next/link';
import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, Eye, FileX2, Loader2 } from 'lucide-react';
import { RequisitionDetailsDialog } from './requisition-details-dialog';

const PAGE_SIZE = 10;

export function PurchaseOrdersList() {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [requisitions, setRequisitions] = useState<PurchaseRequisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedRequisition, setSelectedRequisition] = useState<PurchaseRequisition | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [poResponse, reqResponse] = await Promise.all([
        fetch('/api/purchase-orders'),
        fetch('/api/requisitions')
      ]);
      const poData: PurchaseOrder[] = await poResponse.json();
      const reqData: PurchaseRequisition[] = await reqResponse.json();
      setPurchaseOrders(poData);
      setRequisitions(reqData);
    } catch (error) {
      console.error("Failed to fetch data", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    window.addEventListener('focus', fetchData);
    return () => {
      window.removeEventListener('focus', fetchData);
    };
  }, [fetchData]);
  
  const handleViewReqDetails = (reqId: string) => {
    const req = requisitions.find(r => r.id === reqId);
    if(req) {
      setSelectedRequisition(req);
      setIsDetailsOpen(true);
    }
  }

  const totalPages = Math.ceil(purchaseOrders.length / PAGE_SIZE);
  const paginatedPOs = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return purchaseOrders.slice(startIndex, startIndex + PAGE_SIZE);
  }, [purchaseOrders, currentPage]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>Purchase Orders</CardTitle>
        <CardDescription>
          View all issued purchase orders.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>PO Number</TableHead>
                <TableHead>Requisition</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Total Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedPOs.length > 0 ? (
                paginatedPOs.map((po, index) => (
                  <TableRow key={po.id}>
                    <TableCell className="text-muted-foreground">{(currentPage - 1) * PAGE_SIZE + index + 1}</TableCell>
                    <TableCell className="font-medium text-primary">{po.id}</TableCell>
                    <TableCell>
                      <Button variant="link" className="p-0 h-auto" onClick={() => handleViewReqDetails(po.requisitionId)}>
                        {po.requisitionTitle}
                      </Button>
                    </TableCell>
                    <TableCell>{po.vendor.name}</TableCell>
                    <TableCell>{format(new Date(po.createdAt), 'PP')}</TableCell>
                    <TableCell className="text-right">{po.totalAmount.toLocaleString()} ETB</TableCell>
                    <TableCell>
                      <Badge>{po.status}</Badge>
                    </TableCell>
                    <TableCell>
                        <Button variant="outline" size="sm" asChild>
                           <Link href={`/purchase-orders/${po.id}`}>View PO</Link>
                        </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="h-48 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <FileX2 className="h-16 w-16 text-muted-foreground/50" />
                      <div className="space-y-1">
                        <p className="font-semibold">No Purchase Orders Found</p>
                        <p className="text-muted-foreground">There are no purchase orders to display.</p>
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
             Page {currentPage} of {totalPages} ({purchaseOrders.length} total POs)
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
    {selectedRequisition && (
        <RequisitionDetailsDialog
            isOpen={isDetailsOpen}
            onClose={() => setIsDetailsOpen(false)}
            requisition={selectedRequisition}
        />
    )}
    </>
  );
}
