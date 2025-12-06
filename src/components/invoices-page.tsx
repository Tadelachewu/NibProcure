
'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Image from 'next/image';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
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
  CardFooter,
} from './ui/card';
import { Button } from './ui/button';
import { Invoice, PurchaseOrder, MatchingResult, GoodsReceiptNote } from '@/lib/types';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
  DialogDescription,
} from './ui/dialog';
import { Input } from './ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, ThumbsUp, ThumbsDown, FileUp, FileText, Banknote, CheckCircle, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, CheckCircle2, AlertTriangle, Clock, List, Printer } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form';
import { useAuth } from '@/contexts/auth-context';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Separator } from './ui/separator';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';


const invoiceSchema = z.object({
  purchaseOrderId: z.string().min(1, "Purchase Order is required."),
  invoiceDate: z.string().min(1, "Invoice date is required."),
  documentUrl: z.string().optional(),
  items: z.array(z.object({
    name: z.string(),
    quantity: z.coerce.number(),
    unitPrice: z.coerce.number(),
    totalPrice: z.coerce.number(),
  })),
});

const PAGE_SIZE = 10;

function AddInvoiceForm({ onInvoiceAdded }: { onInvoiceAdded: () => void }) {
    const [isSubmitting, setSubmitting] = useState(false);
    const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
    const { user } = useAuth();
    const { toast } = useToast();

    const form = useForm<z.infer<typeof invoiceSchema>>({
        resolver: zodResolver(invoiceSchema),
        defaultValues: {
            purchaseOrderId: "",
            invoiceDate: new Date().toISOString().split('T')[0],
            items: [],
            documentUrl: "",
        },
    });
    
    useEffect(() => {
        const fetchData = async () => {
            const poResponse = await fetch('/api/purchase-orders');
            const poData = await poResponse.json();
            setPurchaseOrders(poData.filter((po: PurchaseOrder) => po.status !== 'Cancelled'));
        };
        fetchData();
    }, []);
    
    const { fields, replace } = useForm().control;

    const handlePOChange = (poId: string) => {
        form.setValue('purchaseOrderId', poId);
        const po = purchaseOrders.find(p => p.id === poId);
        if (po) {
            const invoiceItems = po.items.map(item => ({
                name: item.name,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalPrice: item.totalPrice,
            }));
            form.setValue('items', invoiceItems);
        } else {
            form.setValue('items', []);
        }
    }
    
    const totalAmount = form.watch('items').reduce((acc, item) => acc + item.totalPrice, 0);

    const onSubmit = async (values: z.infer<typeof invoiceSchema>) => {
        if (!user) return;
        
        const selectedPO = purchaseOrders.find(p => p.id === values.purchaseOrderId);
        if (!selectedPO) return;
        
        setSubmitting(true);
        try {
            const response = await fetch('/api/invoices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('authToken')}` },
                body: JSON.stringify({ 
                    ...values,
                    vendorId: selectedPO.vendor.id,
                    totalAmount
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to add invoice.');
            }

            toast({
                title: 'Success!',
                description: 'New invoice has been created and is pending review.',
            });
            onInvoiceAdded();
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error instanceof Error ? error.message : 'An unknown error occurred.',
            });
        } finally {
            setSubmitting(false);
        }
    };
    
    return (
        <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
                <DialogTitle>Add New Invoice</DialogTitle>
                <DialogDescription>
                    Enter the details from the vendor invoice.
                </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                         <FormField
                            control={form.control}
                            name="purchaseOrderId"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Purchase Order</FormLabel>
                                <Select onValueChange={handlePOChange} value={field.value}>
                                    <FormControl>
                                    <SelectTrigger><SelectValue placeholder="Select a PO" /></SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                    {purchaseOrders.map(po => <SelectItem key={po.id} value={po.id}>{po.id} - {po.requisitionTitle}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                         <FormField
                            control={form.control}
                            name="invoiceDate"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Invoice Date</FormLabel>
                                <FormControl><Input type="date" {...field} /></FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                     <FormField
                        control={form.control}
                        name="documentUrl"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Invoice Document</FormLabel>
                                <FormControl>
                                    <div className="flex items-center gap-2">
                                        <Input id="invoice-file" type="file" className="hidden" />
                                        <label htmlFor="invoice-file" className={cn("flex-1", field.value && "hidden")}>
                                            <Button asChild variant="outline" className="w-full">
                                                <div><FileUp className="mr-2"/> Upload PDF</div>
                                            </Button>
                                        </label>
                                        {field.value && <p className="text-sm text-muted-foreground">{field.value}</p>}
                                    </div>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    
                    <h4 className="text-lg font-semibold pt-4">Invoice Items</h4>
                    <div className="space-y-2 max-h-60 overflow-y-auto border rounded-md p-2">
                         {form.getValues('items').map((item: any, index: number) => (
                            <div key={index} className="grid grid-cols-4 gap-2 items-center">
                                <p className="col-span-2">{item.name}</p>
                                <p>x {item.quantity}</p>
                                <p className="text-right">{item.totalPrice.toFixed(2)} ETB</p>
                            </div>
                        ))}
                    </div>
                    <div className="text-right font-bold text-xl">Total: {totalAmount.toFixed(2)} ETB</div>
                    
                    <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="ghost">Cancel</Button></DialogClose>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Submit Invoice
                        </Button>
                    </DialogFooter>
                </form>
            </Form>
        </DialogContent>
    );
}

const MatchDetailRow = ({ label, value, isMismatch = false }: { label: string, value: React.ReactNode, isMismatch?: boolean}) => {
    const Icon = isMismatch ? AlertTriangle : CheckCircle2;
    return (
        <div className={cn("flex justify-between items-center py-2 border-b", isMismatch ? "text-destructive" : "text-emerald-600")}>
            <span className="flex items-center gap-2 font-medium">
                <Icon className="h-4 w-4"/>
                {label}
            </span>
            <span className="font-mono">{value}</span>
        </div>
    )
}

function MatchDetailsDialog({ result, onResolve, onCancel }: { result: MatchingResult, onResolve: () => void, onCancel: () => void }) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [isResolving, setResolving] = useState(false);
    const [poDetails, setPoDetails] = useState<PurchaseOrder | null>(null);
    const printRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if(result.poId) {
            fetch(`/api/purchase-orders/${result.poId}`)
                .then(res => res.json())
                .then(data => setPoDetails(data));
        }
    }, [result.poId]);


    const handleResolve = async () => {
        if (!user) return;
        setResolving(true);
        try {
            const response = await fetch('/api/matching', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('authToken')}` },
                body: JSON.stringify({ poId: result.poId, userId: user.id })
            });
            if (!response.ok) throw new Error("Failed to resolve mismatch.");
            toast({ title: "Mismatch Resolved", description: `PO ${result.poId} has been manually marked as matched.` });
            onResolve();
        } catch (error) {
             toast({
                variant: 'destructive',
                title: 'Error',
                description: error instanceof Error ? error.message : 'An unknown error occurred.',
            });
        } finally {
            setResolving(false);
            onCancel();
        }
    };

    const handlePrint = async () => {
        const input = printRef.current;
        if (!input) return;
        
        toast({ title: "Generating PDF...", description: "This may take a moment." });

        try {
            const canvas = await html2canvas(input, { scale: 2, useCORS: true, backgroundColor: null });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const imgWidth = canvas.width;
            const imgHeight = canvas.height;
            const ratio = imgWidth / imgHeight;
            let width = pdfWidth - 20; // with margin
            let height = width / ratio;

             if (height > pdfHeight - 20) {
                 height = pdfHeight - 20;
                 width = height * ratio;
            }
            
            const x = (pdfWidth - width) / 2;
            const y = 10;

            pdf.addImage(imgData, 'PNG', x, y, width, height);
            pdf.save(`3-Way-Match-Report-${result.poId}.pdf`);
            toast({ title: "PDF Generated", description: "Your report has been downloaded." });
        } catch (error) {
            console.error("PDF generation error:", error);
            toast({ variant: 'destructive', title: "PDF Generation Failed", description: "Could not generate the PDF report."});
        }
    }
    
  return (
     <DialogContent className="max-w-4xl">
        <div ref={printRef} className="p-4 print:p-0 bg-background text-foreground">
            <DialogHeader className="print:text-black">
                <div className="flex items-center justify-between mb-4">
                     <div className='flex items-center gap-2'>
                        <Image src="/logo.png" alt="Nib InternationalBank Logo" width={32} height={32} className="size-8" />
                        <div>
                            <DialogTitle className="text-2xl">Three-Way Match Report</DialogTitle>
                            <DialogDescription>PO: {result.poId}</DialogDescription>
                        </div>
                    </div>
                     <div className="text-right">
                        <p className="font-semibold">{poDetails?.vendor.name}</p>
                        <p className="text-sm text-muted-foreground">Report Date: {format(new Date(), 'PP')}</p>
                    </div>
                </div>
            </DialogHeader>
            <div className="py-4 grid grid-cols-1 lg:grid-cols-2 gap-6 print:grid-cols-2">
                <div className="space-y-4">
                    <h3 className="font-semibold text-lg">Summary</h3>
                    <div className="text-sm space-y-1">
                        <MatchDetailRow label="PO vs Invoice Total" value={`${result.details.poTotal?.toFixed(2)} vs ${result.details.invoiceTotal?.toFixed(2)} ETB`} isMismatch={!result.priceMatch} />
                        <MatchDetailRow label="PO vs GRN Quantity" value={`${result.details.items?.reduce((acc, i) => acc + i.poQuantity, 0) ?? 0} vs ${result.details.grnTotalQuantity}`} isMismatch={result.details.items?.reduce((acc, i) => acc + i.poQuantity, 0) !== result.details.grnTotalQuantity} />
                        <MatchDetailRow label="PO vs Invoice Quantity" value={`${result.details.items?.reduce((acc, i) => acc + i.poQuantity, 0) ?? 0} vs ${result.details.invoiceTotalQuantity}`} isMismatch={result.details.items?.reduce((acc, i) => acc + i.poQuantity, 0) !== result.details.invoiceTotalQuantity} />
                    </div>
                    <Separator className="my-4"/>
                    <div className="text-sm space-y-2">
                        <h4 className="font-semibold">Document Dates</h4>
                         <div className="flex justify-between"><span className="text-muted-foreground">Purchase Order:</span><span>{poDetails?.createdAt ? format(new Date(poDetails.createdAt), 'PP') : 'N/A'}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Goods Receipt:</span><span>{poDetails?.receipts?.[0]?.receivedDate ? format(new Date(poDetails.receipts[0].receivedDate), 'PP') : 'N/A'}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Invoice:</span><span>{poDetails?.invoices?.[0]?.invoiceDate ? format(new Date(poDetails.invoices[0].invoiceDate), 'PP') : 'N/A'}</span></div>
                    </div>
                </div>
                <div className="space-y-4">
                    <h3 className="font-semibold text-lg">Item-by-Item Breakdown</h3>
                     <div className="border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Item</TableHead>
                                    <TableHead className="text-center">PO</TableHead>
                                    <TableHead className="text-center">GRN</TableHead>
                                    <TableHead className="text-center">Inv</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {result.details.items?.map(item => (
                                    <TableRow key={item.itemId} className={cn(!item.quantityMatch || !item.priceMatch ? "bg-destructive/5" : "bg-emerald-500/5")}>
                                        <TableCell>
                                            <p className="font-medium">{item.itemName}</p>
                                            <p className={cn("text-xs", !item.priceMatch && "text-destructive font-bold")}>
                                                PO: {item.poUnitPrice.toFixed(2)} vs Inv: {item.invoiceUnitPrice.toFixed(2)}
                                            </p>
                                        </TableCell>
                                        <TableCell className="text-center">{item.poQuantity}</TableCell>
                                        <TableCell className={cn("text-center", !item.quantityMatch && "text-destructive font-bold")}>{item.grnQuantity}</TableCell>
                                        <TableCell className={cn("text-center", !item.quantityMatch && "text-destructive font-bold")}>{item.invoiceQuantity}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </div>
        </div>
        <DialogFooter className="print:hidden">
            <Button onClick={handlePrint} variant="outline"><Printer className="mr-2"/> Print / Export PDF</Button>
            {result.status === 'Mismatched' && (
                <Button onClick={handleResolve} disabled={isResolving}>
                    {isResolving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Manually Resolve Mismatch
                </Button>
            )}
            <Button onClick={onCancel} variant="ghost">Close</Button>
        </DialogFooter>
    </DialogContent>
  );
}

const MatchStatus = ({ po, grn, invoice }: { po: boolean, grn: boolean, invoice: boolean }) => {
  const StatusItem = ({ complete, label }: { complete: boolean, label: string }) => (
    <div className={cn("flex items-center gap-2", complete ? "text-green-600" : "text-amber-600")}>
      {complete ? <CheckCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
      <span className="font-medium">{label}:</span>
      <span>{complete ? "Submitted" : "Waiting"}</span>
    </div>
  );

  return (
    <div className="p-2 space-y-2">
        <h4 className="font-semibold text-foreground flex items-center gap-2"><List className="h-4 w-4"/>Match Status</h4>
        <StatusItem complete={po} label="Purchase Order" />
        <StatusItem complete={grn} label="Goods Receipt" />
        <StatusItem complete={invoice} label="Invoice" />
    </div>
  );
};

const MatchingStatusBadge = ({ result, onRefresh }: { result: MatchingResult | null, onRefresh: () => void }) => {
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    if (!result) {
        return <Badge variant="outline"><Loader2 className="mr-2 h-3 w-3 animate-spin"/>Checking</Badge>;
    }
    
    if (result.status === 'Pending') {
        const poExists = result.details.poTotal > 0;
        const grnExists = result.details.grnTotalQuantity > 0;
        const invExists = result.details.invoiceTotal > 0;
        return (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger>
                        <Badge variant="secondary"><Clock className="mr-2 h-3 w-3" />Pending</Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                        <MatchStatus po={poExists} grn={grnExists} invoice={invExists} />
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    }
    
    const isClickable = result.status === 'Mismatched' || result.status === 'Matched';
    
    const BadgeComponent = (
        <Badge 
            variant={result.status === 'Matched' ? 'default' : 'destructive'}
            className={cn(isClickable && "cursor-pointer")}
        >
            {result.status === 'Matched' && <CheckCircle2 className="mr-2 h-3 w-3" />}
            {result.status === 'Mismatched' && <AlertTriangle className="mr-2 h-3 w-3" />}
            {result.status}
        </Badge>
    );

    return isClickable ? (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
                {BadgeComponent}
            </DialogTrigger>
            {result && (
                <MatchDetailsDialog
                    result={result}
                    onResolve={() => {
                        setIsDialogOpen(false);
                        onRefresh();
                    }}
                    onCancel={() => setIsDialogOpen(false)}
                />
            )}
        </Dialog>
    ) : BadgeComponent;
}

export function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [allPOs, setAllPOs] = useState<PurchaseOrder[]>([]);
  const [matchResults, setMatchResults] = useState<Record<string, MatchingResult | null>>({});
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setFormOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeAction, setActiveAction] = useState<string | null>(null);

  const { toast } = useToast();
  const { user } = useAuth();

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      const invResponse = await fetch('/api/invoices');
      if (!invResponse.ok) throw new Error('Failed to fetch invoices');
      const invData: Invoice[] = await invResponse.json();
      
      const poResponse = await fetch('/api/purchase-orders');
      if (!poResponse.ok) throw new Error('Failed to fetch POs');
      const poData: PurchaseOrder[] = await poResponse.json();

      setInvoices(invData);
      setAllPOs(poData);
      
      const initialMatchResults: Record<string, null> = {};
      invData.forEach(inv => {
          initialMatchResults[inv.id] = null;
      });
      setMatchResults(initialMatchResults);

      const matchPromises = invData.map(inv =>
        fetch(`/api/matching?invoiceId=${inv.id}`)
          .then(res => res.ok ? res.json() : null)
          .then(data => ({ id: inv.id, data }))
      );

      const results = await Promise.all(matchPromises);
      const newMatchResults: Record<string, MatchingResult | null> = {};
      results.forEach(res => {
        if (res) {
          newMatchResults[res.id] = res.data;
        }
      });
      setMatchResults(newMatchResults);

    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Could not fetch invoices.',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);
  
  const totalPages = Math.ceil(invoices.length / PAGE_SIZE);
  const paginatedInvoices = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return invoices.slice(startIndex, startIndex + PAGE_SIZE);
  }, [invoices, currentPage]);

  const handleInvoiceAdded = () => {
    setFormOpen(false);
    fetchAllData();
  }
  
  const handleAction = async (invoiceId: string, status: 'Approved for Payment' | 'Disputed', reason?: string) => {
      if (!user) return;
      setActiveAction(invoiceId);
      try {
          const response = await fetch(`/api/invoices/${invoiceId}/status`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('authToken')}` },
              body: JSON.stringify({ status, userId: user.id, reason }),
          });
          if (!response.ok) throw new Error(`Failed to mark invoice as ${status}.`);
          toast({ title: "Success", description: `Invoice has been marked as ${status}.`});
          fetchAllData();
      } catch (error) {
          toast({
            variant: 'destructive',
            title: 'Error',
            description: error instanceof Error ? error.message : 'An unknown error occurred.',
        });
      } finally {
        setActiveAction(null);
      }
  }

  const handlePayment = async (invoiceId: string, paymentEvidenceUrl: string) => {
    if (!user) return;
     setActiveAction(invoiceId);
     try {
        const response = await fetch(`/api/payments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('authToken')}` },
            body: JSON.stringify({ invoiceId, userId: user.id, paymentEvidenceUrl })
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to process payment.');
        }
        toast({ title: "Payment Processed", description: `Invoice ${invoiceId} has been paid.`});
        fetchAllData();
    } catch (error) {
        toast({
            variant: 'destructive',
            title: 'Error',
            description: error instanceof Error ? error.message : 'An unknown error occurred.',
        });
    } finally {
        setActiveAction(null);
    }
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'Paid': return 'default';
      case 'Pending': return 'secondary';
      case 'Approved_for_Payment': return 'secondary';
      case 'Disputed': return 'destructive';
      default: return 'outline';
    }
  };


  if (loading && invoices.length === 0) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Invoices & Matching</CardTitle>
          <CardDescription>
            Manage vendor invoices and their three-way matching status.
          </CardDescription>
        </div>
        <Dialog open={isFormOpen} onOpenChange={setFormOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Invoice
            </Button>
          </DialogTrigger>
          <AddInvoiceForm onInvoiceAdded={handleInvoiceAdded} />
        </Dialog>
      </CardHeader>
      <CardContent>
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Invoice ID</TableHead>
                <TableHead>PO Number</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Matching</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedInvoices.length > 0 ? (
                paginatedInvoices.map((invoice, index) => {
                  const matchResult = matchResults[invoice.id];
                  const po = allPOs.find(p => p.id === invoice.purchaseOrderId);
                  const isDisputedGRN = po?.receipts?.some(r => r.status === 'Disputed');
                  const isActionDisabled = !matchResult || matchResult.status !== 'Matched' || isDisputedGRN;
                  const isActionLoading = activeAction === invoice.id;
                  
                  return (
                  <TableRow key={invoice.id}>
                    <TableCell className="text-muted-foreground">{(currentPage - 1) * PAGE_SIZE + index + 1}</TableCell>
                    <TableCell className="font-medium text-primary">{invoice.id}</TableCell>
                    <TableCell>{invoice.purchaseOrderId}</TableCell>
                    <TableCell>{format(new Date(invoice.invoiceDate), 'PP')}</TableCell>
                     <TableCell>
                        <MatchingStatusBadge result={matchResult} onRefresh={fetchAllData} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant={getStatusVariant(invoice.status)}>{invoice.status.replace(/_/g, ' ')}</Badge>
                         {invoice.status === 'Paid' && invoice.paymentReference && (
                           <span className="text-xs text-muted-foreground">{invoice.paymentReference}</span>
                         )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{invoice.totalAmount.toLocaleString()} ETB</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {invoice.status === 'Pending' && (
                            <>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <span tabIndex={0}>
                                                <Button 
                                                    variant="outline" 
                                                    size="sm" 
                                                    onClick={() => handleAction(invoice.id, 'Approved for Payment')}
                                                    disabled={isActionDisabled || isActionLoading}
                                                >
                                                {isActionLoading && actionType === 'approve' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ThumbsUp className="mr-2 h-4 w-4" />} Approve
                                                </Button>
                                            </span>
                                        </TooltipTrigger>
                                        {isDisputedGRN && (
                                            <TooltipContent>
                                                <p>Cannot approve: Associated goods receipt is disputed.</p>
                                            </TooltipContent>
                                        )}
                                        {matchResult?.status !== 'Matched' && !isDisputedGRN && (
                                            <TooltipContent>
                                                <p>Cannot approve: 3-way match has not passed.</p>
                                            </TooltipContent>
                                        )}
                                    </Tooltip>
                                </TooltipProvider>

                                <DisputeDialog onConfirm={(reason) => handleAction(invoice.id, 'Disputed', reason)} />
                            </>
                        )}
                        {invoice.status === 'Approved_for_Payment' && (
                            <PaymentDialog
                                invoice={invoice}
                                onConfirm={handlePayment}
                                isLoading={isActionLoading}
                             />
                        )}
                         {invoice.status === 'Paid' && invoice.paymentDate && (
                             <div className="flex items-center text-sm text-green-600">
                                 <CheckCircle className="mr-2 h-4 w-4"/> Paid on {format(new Date(invoice.paymentDate), 'PP')}
                             </div>
                         )}
                      </div>
                    </TableCell>
                  </TableRow>
                )})
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">
                    No invoices found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
         <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-muted-foreground">
             Page {currentPage} of {totalPages} ({invoices.length} total invoices)
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
    </>
  );
}

function DisputeDialog({ onConfirm }: { onConfirm: (reason: string) => void }) {
    const [reason, setReason] = useState('');
    return (
         <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                    <ThumbsDown className="mr-2 h-4 w-4" /> Dispute
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Dispute Invoice</AlertDialogTitle>
                    <AlertDialogDescription>
                        Please provide a clear reason for disputing this invoice. This will notify the relevant parties and pause payment processing.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="py-4">
                    <Label htmlFor="dispute-reason">Reason for Dispute</Label>
                    <Textarea
                        id="dispute-reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="e.g., Incorrect quantity received, prices do not match PO..."
                        className="mt-2"
                    />
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onConfirm(reason)} disabled={!reason.trim()}>
                        Submit Dispute
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}


function PaymentDialog({ invoice, onConfirm, isLoading }: { invoice: Invoice, onConfirm: (invoiceId: string, evidenceUrl: string) => void, isLoading: boolean }) {
    const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
    const { toast } = useToast();

    const handleConfirm = async () => {
        if (!evidenceFile) {
            toast({ variant: 'destructive', title: 'Error', description: 'Please upload payment evidence.'});
            return;
        }

        const formData = new FormData();
        formData.append('file', evidenceFile);
        formData.append('directory', 'payment-evidence');

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'File upload failed');
            }
            
            onConfirm(invoice.id, result.path);

        } catch (error) {
             toast({
                variant: 'destructive',
                title: 'Upload Failed',
                description: error instanceof Error ? error.message : 'Could not upload payment evidence.',
            });
        }
    };
    
    return (
         <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button size="sm" disabled={isLoading}>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Banknote className="mr-2 h-4 w-4" />} Pay Invoice
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Confirm Payment & Upload Evidence</AlertDialogTitle>
                    <AlertDialogDescription>
                        This will simulate a payment for {invoice.totalAmount.toLocaleString()} ETB for invoice {invoice.id}. Please upload proof of payment.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="py-4">
                    <Label htmlFor="payment-evidence">Payment Evidence Document (PDF/PNG/JPG)</Label>
                    <Input id="payment-evidence" type="file" onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)} />
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleConfirm} disabled={!evidenceFile || isLoading}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Confirm Payment
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
