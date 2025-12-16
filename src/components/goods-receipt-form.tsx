
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { Loader2, PackageCheck, AlertTriangle, History } from 'lucide-react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form';
import { PurchaseOrder, GoodsReceiptNote } from '@/lib/types';
import { useAuth } from '@/contexts/auth-context';
import { Input } from './ui/input';
import { Separator } from './ui/separator';
import { Textarea } from './ui/textarea';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { format } from 'date-fns';


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
    return items.every(item => {
        if (item.condition === 'Damaged' || item.condition === 'Incorrect') {
            return item.notes && item.notes.trim().length > 0;
        }
        return true;
    });
  }, {
      message: "A reason (in the notes field) is required when an item is marked as Damaged or Incorrect.",
      path: ["items"],
  }),
});

type ReceiptFormValues = z.infer<typeof receiptFormSchema>;

export function GoodsReceiptForm() {
  const [allPOs, setAllPOs] = useState<PurchaseOrder[]>([]);
  const [disputedReceipts, setDisputedReceipts] = useState<GoodsReceiptNote[]>([]);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);
  const { toast } = useToast();
  const { user, token } = useAuth();
  const storageKey = 'goods-receipt-form';
  
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

  const activePOs = useMemo(() => {
    return allPOs.filter(po => {
      const latestReceipt = po.receipts?.sort((a,b) => new Date(b.receivedDate).getTime() - new Date(a.receivedDate).getTime())[0];
      
      // A PO is active if it's been returned by finance for re-verification.
      if (latestReceipt?.status === 'Disputed') {
        return true;
      }

      // A PO is active if it's in a receivable state...
      const isReceivableStatus = ['Issued', 'Acknowledged', 'Shipped', 'Partially_Delivered'].includes(po.status.replace(/ /g, '_'));
      if (!isReceivableStatus) {
        return false;
      }
      
      // ...AND it does NOT have a receiving-side dispute (damaged/incorrect items logged).
      const hasReceivingSideDispute = po.receipts?.some(r => r.items.some(i => i.condition !== 'Good')) ?? false;
      if (hasReceivingSideDispute) {
        return false;
      }

      return true;
    });
  }, [allPOs]);

  const handlePOChange = (poId: string, restoredItems?: any[]) => {
    form.setValue('purchaseOrderId', poId);
    const po = allPOs.find(p => p.id === poId);
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
  
  useEffect(() => {
    const savedData = localStorage.getItem(storageKey);
    if (savedData && allPOs.length > 0) {
      try {
        const parsedData = JSON.parse(savedData);
        if (parsedData.purchaseOrderId) {
            handlePOChange(parsedData.purchaseOrderId, parsedData.items);
            toast({ title: 'Draft Restored', description: 'Your previous goods receipt entry has been restored.' });
        }
      } catch (e) {
        console.error("Failed to parse saved GRN data", e);
      }
    }
  }, [allPOs]); // Depend on allPOs to ensure they are loaded

  useEffect(() => {
    const subscription = form.watch((value) => {
      localStorage.setItem(storageKey, JSON.stringify(value));
    });
    return () => subscription.unsubscribe();
  }, [form, storageKey]);


  const fetchPOs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/purchase-orders');
      const data: PurchaseOrder[] = await response.json();
      setAllPOs(data);

      const allReceiptsResponse = await fetch('/api/receipts');
      const allReceiptsData: GoodsReceiptNote[] = await allReceiptsResponse.json();
      setDisputedReceipts(allReceiptsData.filter(r => r.items.some(i => i.condition !== 'Good')));
      
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch data.' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchPOs();
  }, [fetchPOs]);


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

  const isSelectedPODisputedByFinance = useMemo(() => {
    if (!selectedPO) return false;
    const latestReceipt = selectedPO.receipts?.sort((a,b) => new Date(b.receivedDate).getTime() - new Date(a.receivedDate).getTime())[0];
    return latestReceipt?.status === 'Disputed';
  }, [selectedPO]);
  
  return (
    <div className="space-y-6">
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
                        <FormLabel>Select a PO to receive against</FormLabel>
                        <Select onValueChange={(value) => handlePOChange(value)} value={field.value}>
                            <FormControl>
                            <SelectTrigger className="w-full md:w-1/2">
                                <SelectValue placeholder={loading ? "Loading POs..." : "Select an actionable PO"} />
                            </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                            {activePOs.map(po => <SelectItem key={po.id} value={po.id}>{po.id} - {po.requisitionTitle}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                
                {selectedPO && (
                    <>
                    {isSelectedPODisputedByFinance && (
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4"/>
                            <AlertTitle>This Order was Disputed by Finance</AlertTitle>
                            <AlertDescription>
                                An invoice for this order was disputed. Please carefully re-verify quantities and conditions, then re-submit this form to confirm the correct details.
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
                                            <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isSelectedPODisputedByFinance}>
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
                        {isSelectedPODisputedByFinance ? 'Confirm & Re-Submit Receipt' : 'Log Received Goods'}
                    </Button>
                </CardFooter>
              )}
            </form>
          </Form>
        </Card>
        
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><History className="h-5 w-5"/> Disputed Receipts History</CardTitle>
                <CardDescription>A log of all goods receipts that included damaged or incorrect items.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>GRN ID</TableHead>
                            <TableHead>PO ID</TableHead>
                            <TableHead>Received Date</TableHead>
                            <TableHead>Disputed Item(s)</TableHead>
                            <TableHead>Reason</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {disputedReceipts.length > 0 ? disputedReceipts.map(grn => {
                            const disputedItem = grn.items.find(i => i.condition !== 'Good');
                            const po = allPOs.find(p => p.id === grn.purchaseOrderId);
                            const poItem = po?.items.find(pi => pi.id === disputedItem?.poItemId);

                            return (
                                <TableRow key={grn.id}>
                                    <TableCell>{grn.id}</TableCell>
                                    <TableCell>{grn.purchaseOrderId}</TableCell>
                                    <TableCell>{format(new Date(grn.receivedDate), 'PP')}</TableCell>
                                    <TableCell>{poItem?.name || 'N/A'}</TableCell>
                                    <TableCell>
                                        <Badge variant="destructive">{disputedItem?.condition}</Badge>
                                        <p className="text-xs text-muted-foreground mt-1">{disputedItem?.notes}</p>
                                    </TableCell>
                                </TableRow>
                            )
                        }) : (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center h-24">No disputed receipts found.</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    </div>
  );
}
