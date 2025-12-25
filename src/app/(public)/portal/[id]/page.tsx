'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PurchaseRequisition } from '@/lib/types';
import { Loader2, ArrowLeft, Calendar, FileText, Building, User, Info, MessageSquare } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';

export default function PublicRequisitionDetailsPage() {
  const [requisition, setRequisition] = useState<PurchaseRequisition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (!id) return;
    const fetchRequisition = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/requisitions/${id}`);
        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('This requisition is not available for public viewing or does not exist.');
            }
          throw new Error('Failed to fetch requisition data.');
        }
        const data: PurchaseRequisition = await response.json();
        if (data.status.replace(/_/g, ' ') !== 'PreApproved') {
            throw new Error('This tender is not currently open for bidding.');
        }
        setRequisition(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'An unknown error occurred.');
        toast({
            variant: 'destructive',
            title: 'Error',
            description: e instanceof Error ? e.message : 'Could not load tender details.'
        })
      } finally {
        setLoading(false);
      }
    };
    fetchRequisition();
  }, [id, toast]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !requisition) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Tender Not Found</CardTitle>
                <CardDescription>{error || 'The requested tender could not be found.'}</CardDescription>
            </CardHeader>
            <CardContent>
                 <Button variant="outline" onClick={() => router.push('/portal')}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Portal
                </Button>
            </CardContent>
        </Card>
    );
  }

  return (
    <div className="space-y-6">
        <Button variant="outline" onClick={() => router.push('/portal')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to All Tenders
        </Button>

        <Card>
            <CardHeader>
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div>
                        <Badge variant="secondary">{requisition.id}</Badge>
                        <CardTitle className="mt-2 text-3xl">{requisition.title}</CardTitle>
                        <CardDescription className="mt-2 text-base">
                            An invitation to bid from the {requisition.department} department.
                        </CardDescription>
                    </div>
                    <div className="text-left md:text-right">
                        <p className="text-sm text-muted-foreground">Posted On</p>
                        <p className="font-semibold">{format(new Date(requisition.createdAt), 'PPP')}</p>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-8">
                 <Separator />
                 <div className="grid md:grid-cols-3 gap-6">
                    <div className="flex items-center gap-4">
                        <Building className="h-8 w-8 text-primary" />
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Department</p>
                            <p className="font-semibold">{requisition.department}</p>
                        </div>
                    </div>
                     <div className="flex items-center gap-4">
                        <User className="h-8 w-8 text-primary" />
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Requester</p>
                            <p className="font-semibold">{requisition.requesterName}</p>
                        </div>
                    </div>
                     <div className="flex items-center gap-4">
                        <Calendar className="h-8 w-8 text-primary" />
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Urgency</p>
                            <p className="font-semibold">{requisition.urgency}</p>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2"><MessageSquare /> Business Justification</h3>
                    <p className="text-muted-foreground bg-muted/50 p-4 rounded-lg border">{requisition.justification}</p>
                </div>

                 <div className="space-y-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2"><FileText /> Requested Items</h3>
                    <div className="border rounded-lg">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Item Name</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead className="text-right">Quantity</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {requisition.items.map(item => (
                                    <TableRow key={item.id}>
                                        <TableCell className="font-medium">{item.name}</TableCell>
                                        <TableCell className="text-muted-foreground">{item.description || 'N/A'}</TableCell>
                                        <TableCell className="text-right font-mono">{item.quantity}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>

                <Card className="bg-primary/10 border-primary/30">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-primary"><Info /> Interested in Bidding?</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-primary/90">To submit a quotation for this tender, you must be a registered and verified vendor. Please register your company profile or log in to your existing account.</p>
                    </CardContent>
                    <CardFooter className="flex gap-4">
                        <Button asChild><Link href="/register">Register to Bid</Link></Button>
                        <Button asChild variant="outline"><Link href="/login">Vendor Login</Link></Button>
                    </CardFooter>
                </Card>

            </CardContent>
        </Card>
    </div>
  );
}