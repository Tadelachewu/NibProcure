

'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from './ui/card';
import { Button } from './ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PackageCheck, ArrowLeft } from 'lucide-react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form';
import { PurchaseOrder } from '@/lib/types';
import { useAuth } from '@/contexts/auth-context';
import { Input } from './ui/input';
import { Separator } from './ui/separator';
import { Textarea } from './ui/textarea';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { AlertTriangle, ChevronsRight, ChevronRight, ChevronLeft, ChevronsLeft, PackageX, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';


const receiptFormSchema = z.object({
  purchaseOrderId: z.string().min(1, "Purchase Order is required."),
  items: z.array(z.object({
    poItemId: z.string(),
    name: z.string(),
    quantityOrdered: z.number(),
    quantityReceived: z.coerce.number().min(0, "Cannot be negative."),
    condition: z.enum(['Good', 'Damaged', 'Incorrect']),
    notes: z.string().optional(),
  })).min(1, "At least one item must be received.")
  .refine(items => {
    // For every item, if condition is 'Damaged' or 'Incorrect', notes must be provided.
    return items.every(item => {
        if (item.condition === 'Damaged' || item.condition === 'Incorrect') {
            return item.notes && item.notes.trim().length > 0;
        }
        return true;
    });
  }, {
      message: "A reason (in the notes field) is required when an item is marked as Damaged or Incorrect.",
      // This path is a bit tricky for array fields. We'll show a general error.
      // A more complex setup could target specific items.
  }),
});

type ReceiptFormValues = z.infer<typeof receiptFormSchema>;
type ViewMode = 'form' | 'disputed' | 'completed';


const DisputedReceiptsView = ({ disputedPOs }: { disputedPOs: PurchaseOrder[] }) => {
    const [currentPage, setCurrentPage] = useState(1);
    const totalPages = Math.ceil(disputedPOs.length / 5);
    const paginatedPOs = useMemo(() => {
        const startIndex = (currentPage - 1) * 5;
        return disputedPOs.slice(startIndex, startIndex + 5);
    }, [disputedPOs, currentPage]);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Disputed Receipts</CardTitle>
                <CardDescription>
                    These Purchase Orders have receipts with issues that need to be resolved before payment can be processed.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="border rounded-md">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>PO Number</TableHead>
                                <TableHead>Requisition</TableHead>
                                <TableHead>Vendor</TableHead>
                                <TableHead>Last Receipt Date</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedPOs.length > 0 ? paginatedPOs.map(po => (
                                <TableRow key={po.id}>
                                    <TableCell className="font-medium">{po.id}</TableCell>
                                    <TableCell>{po.requisitionTitle}</TableCell>
                                    <TableCell>{po.vendor.name}</TableCell>
                                    <TableCell>{po.receipts && po.receipts.length > 0 ? new Date(po.receipts[po.receipts.length - 1].receivedDate).toLocaleDateString() : 'N/A'}</TableCell>
                                </TableRow>
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-32 text-center">
                                        <div className="flex flex-col items-center gap-4">
                                            <PackageX className="h-12 w-12 text-muted-foreground/50" />
                                            <p className="text-muted-foreground">No disputed receipts at this time.</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
                {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4">
                        <div className="text-sm text-muted-foreground">Page {currentPage} of {totalPages}</div>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="icon" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}><ChevronsLeft /></Button>
                            <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft /></Button>
                            <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight /></Button>
                            <Button variant="outline" size="icon" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}><ChevronsRight /></Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

const CompletedReceiptsView = ({ completedPOs }: { completedPOs: PurchaseOrder[] }) => {
    const [currentPage, setCurrentPage] = useState(1);
    const totalPages = Math.ceil(completedPOs.length / 5);
    const paginatedPOs = useMemo(() => {
        const startIndex = (currentPage - 1) * 5;
        return completedPOs.slice(startIndex, startIndex + 5);
    }, [completedPOs, currentPage]);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Completed Receipts History</CardTitle>
                <CardDescription>A history of successfully received and paid purchase orders.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="border rounded-md">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>PO Number</TableHead>
                                <TableHead>Requisition</TableHead>
                                <TableHead>Vendor</TableHead>
                                <TableHead>Final Receipt Date</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedPOs.length > 0 ? paginatedPOs.map(po => (
                                <TableRow key={po.id}>
                                    <TableCell className="font-medium">{po.id}</TableCell>
                                    <TableCell>{po.requisitionTitle}</TableCell>
                                    <TableCell>{po.vendor.name}</TableCell>
                                    <TableCell>{po.receipts && po.receipts.length > 0 ? new Date(po.receipts[po.receipts.length - 1].receivedDate).toLocaleDateString() : 'N/A'}</TableCell>
                                </TableRow>
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-32 text-center">
                                        <div className="flex flex-col items-center gap-4">
                                            <CheckCircle className="h-12 w-12 text-muted-foreground/50" />
                                            <p className="text-muted-foreground">No completed receipts to display.</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
                 {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4">
                        <div className="text-sm text-muted-foreground">Page {currentPage} of {totalPages}</div>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="icon" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}><ChevronsLeft /></Button>
                            <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft /></Button>
                            <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight /></Button>
                            <Button variant="outline" size="icon" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}><ChevronsRight /></Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};


export function GoodsReceiptForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [allPurchaseOrders, setAllPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);
  const { toast } = useToast();
  const { user, token } = useAuth();
  const storageKey = 'goods-receipt-form';
  const initialView = (searchParams.get('view') as ViewMode) || 'form';
  const [viewMode, setViewMode] = useState<ViewMode>(initialView);
  
  const form = useForm<ReceiptFormValues>({
    resolver: zodResolver(receiptFormSchema),
    defaultValues: {
        purchaseOrderId: "",
        items: [],
    },
  });

  const { fields, replace } = useFieldArray({
    control: form.control,
    name: "items",
  });
  
  const watchedItems = useWatch({ control: form.control, name: 'items'});
  
  const { openablePOs, disputedPOs, completedPOs } = useMemo(() => {
    const openable: PurchaseOrder[] = [];
    const disputed: PurchaseOrder[] = [];
    const completed: PurchaseOrder[] = [];

    allPurchaseOrders.forEach(po => {
        const isDisputed = po.receipts?.some(r => r.status === 'Disputed');
        const isPaid = po.invoices?.every(i => i.status === 'Paid');

        if (isDisputed) {
            disputed.push(po);
        } else if (po.status === 'Delivered' && isPaid) {
            completed.push(po);
        } else if (['Issued', 'Acknowledged', 'Shipped', 'Partially_Delivered'].includes(po.status.replace(/ /g, '_'))) {
            openable.push(po);
        }
    });

    return { openablePOs: openable, disputedPOs: disputed, completedPOs: completed };
  }, [allPurchaseOrders]);

  const handlePOChange = (poId: string, restoredItems?: any[]) => {
    form.setValue('purchaseOrderId', poId);
    const po = openablePOs.find(p => p.id === poId);
    if (po) {
        setSelectedPO(po);
        if (restoredItems && restoredItems.length > 0) {
            replace(restoredItems);
        } else {
            const formItems = po.items.map(item => ({
                poItemId: item.id,
                name: item.name,
                quantityOrdered: item.quantity,
                quantityReceived: 0,
                condition: 'Good' as const,
                notes: "",
            }));
            replace(formItems);
        }
    } else {
        setSelectedPO(null);
        replace([]);
    }
  }
  
  const fetchPOs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/purchase-orders');
      const data: PurchaseOrder[] = await response.json();
      setAllPurchaseOrders(data);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch purchase orders.' });
    } finally {
      setLoading(false);
    }
  }, [toast]);
  
  useEffect(() => {
    fetchPOs();
  }, [fetchPOs]);

  useEffect(() => {
    const view = (searchParams.get('view') as ViewMode) || 'form';
    setViewMode(view);
  }, [searchParams]);

  const onSubmit = async (values: ReceiptFormValues) => {
      if (!user || !token) return;
      setSubmitting(true);
      try {
        const response = await fetch('/api/receipts', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify(values),
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to log receipt.');
        }

        toast({ title: 'Success!', description: 'Goods receipt has been logged.' });
        localStorage.removeItem(storageKey);
        form.reset();
        setSelectedPO(null);
        replace([]);
        await fetchPOs(); // Refresh PO list
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

  const isSelectedPODisputed = useMemo(() => {
    if (!selectedPO) return false;
    return disputedPOs.some(p => p.id === selectedPO.id);
  }, [selectedPO, disputedPOs]);

  const handleTabChange = (value: ViewMode) => {
      setViewMode(value);
      router.push(`/receive-goods?view=${value}`);
  }
  
  return (
    <div className="space-y-8">
        <Tabs value={viewMode} onValueChange={(v) => handleTabChange(v as ViewMode)}>
            <TabsList>
                <TabsTrigger value="form">Log Receipt</TabsTrigger>
                <TabsTrigger value="disputed">Disputed Receipts</TabsTrigger>
                <TabsTrigger value="completed">Completed History</TabsTrigger>
            </TabsList>
        </Tabs>

        {viewMode === 'form' && (
            <Card>
                <CardHeader>
                <CardTitle>Receive Goods</CardTitle>
                <CardDescription>Log incoming items against a purchase order.</CardDescription>
                </CardHeader>
                <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                    <CardContent className="space-y-6">
                    <FormField
                        control={form.control}
                        name="purchaseOrderId"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Select Purchase Order</FormLabel>
                            <Select onValueChange={(value) => handlePOChange(value)} value={field.value}>
                                <FormControl>
                                <SelectTrigger className="w-full md:w-1/2">
                                    <SelectValue placeholder={loading ? "Loading POs..." : "Select a PO to receive against"} />
                                </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                {openablePOs.map(po => <SelectItem key={po.id} value={po.id}>{po.id} - {po.requisitionTitle}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                    
                    {selectedPO && (
                        <>
                        {isSelectedPODisputed && (
                            <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4"/>
                                <AlertTitle>This Order is Disputed</AlertTitle>
                                <AlertDescription>
                                    The invoice for this purchase order was disputed. Please carefully re-verify the received quantities and conditions, then re-submit this form to confirm the correct details.
                                </AlertDescription>
                            </Alert>
                        )}
                        <Separator />
                        <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
                            <h3 className="text-lg font-medium">Items to Receive</h3>
                            {fields.map((field, index) => {
                                const itemIsDefective = watchedItems?.[index]?.condition === 'Damaged' || watchedItems?.[index]?.condition === 'Incorrect';
                                return (
                                <Card key={field.id} className={cn("p-4", itemIsDefective && "border-destructive/50 ring-2 ring-destructive/20")}>
                                    <p className="font-semibold mb-2">{field.name}</p>
                                    <p className="text-sm text-muted-foreground mb-4">Ordered: {field.quantityOrdered}</p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <FormField
                                            control={form.control}
                                            name={`items.${index}.quantityReceived`}
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Quantity Received</FormLabel>
                                                    <FormControl><Input type="number" {...field} /></FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name={`items.${index}.condition`}
                                            render={({ field }) => (
                                                <FormItem>
                                                <FormLabel>Condition</FormLabel>
                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                    <FormControl>
                                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="Good">Good</SelectItem>
                                                        <SelectItem value="Damaged">Damaged</SelectItem>
                                                        <SelectItem value="Incorrect">Incorrect</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name={`items.${index}.notes`}
                                            render={({ field }) => (
                                                <FormItem className="md:col-span-2">
                                                    <FormLabel>Item Notes {itemIsDefective && <span className="text-destructive">*</span>}</FormLabel>
                                                    <FormControl>
                                                        <Textarea placeholder={itemIsDefective ? "Reason for damaged/incorrect status is required..." : "e.g. Box was dented but item is fine"} {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                </Card>
                            )})}
                        </div>
                        </>
                    )}

                    </CardContent>
                    {selectedPO && (
                    <CardFooter>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackageCheck className="mr-2 h-4 w-4" />}
                            {isSelectedPODisputed ? 'Confirm & Re-Submit Receipt' : 'Log Received Goods'}
                        </Button>
                    </CardFooter>
                    )}
                </form>
                </Form>
            </Card>
        )}

        {viewMode === 'disputed' && <DisputedReceiptsView disputedPOs={disputedPOs} />}
        {viewMode === 'completed' && <CompletedReceiptsView completedPOs={completedPOs} />}
    </div>
  );
}
