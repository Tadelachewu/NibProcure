"use client";

import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { FileBadge } from 'lucide-react';

export default function MissingPOsPage() {
    const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
    const router = useRouter();

    useEffect(() => {
        fetch('/api/purchase-orders')
            .then(res => res.json())
            .then(data => {
                const posMissingInvoice = (Array.isArray(data) ? data : []).filter(
                    po => (po.receipts || []).length > 0 && !(po.invoices || []).length
                );
                setPurchaseOrders(posMissingInvoice);
            }).catch(() => setPurchaseOrders([]));
    }, []);

    return (
        <div className="max-w-5xl mx-auto py-8 px-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-xl font-bold">Purchase Orders Missing Invoice</CardTitle>
                        <p className="text-muted-foreground mt-1">POs with goods receipts logged but no invoice submitted yet.</p>
                    </div>
                    <FileBadge className="h-8 w-8 text-primary" />
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>PO Number</TableHead>
                                <TableHead>Vendor</TableHead>
                                <TableHead>Last Receipt</TableHead>
                                <TableHead></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {purchaseOrders.length > 0 ? purchaseOrders.map(po => (
                                <TableRow key={po.id}>
                                    <TableCell className="font-medium">{po.id}</TableCell>
                                    <TableCell>{po.vendor?.name}</TableCell>
                                    <TableCell>{po.receipts && po.receipts.length > 0 ? new Date(po.receipts[po.receipts.length - 1].receivedDate).toLocaleDateString() : 'N/A'}</TableCell>
                                    <TableCell>
                                        <Button variant="outline" onClick={() => router.push('/invoices')}>Submit Invoice</Button>
                                    </TableCell>
                                </TableRow>
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">No POs missing invoices.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
