
'use client';

import { PurchaseRequisition } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from './ui/button';
import { Separator } from './ui/separator';
import { Badge } from './ui/badge';
import { format } from 'date-fns';
import { ScrollArea } from './ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

interface ApprovalSummaryDialogProps {
  requisition: PurchaseRequisition;
  isOpen: boolean;
  onClose: () => void;
}

export function ApprovalSummaryDialog({ requisition, isOpen, onClose }: ApprovalSummaryDialogProps) {
  if (!requisition) return null;
  
  const winningQuotes = requisition.quotations?.filter(q => 
    q.status === 'Pending_Award' || q.status === 'Awarded' || q.status === 'Accepted' || q.status === 'Partially_Awarded'
  ) || [];

  const winningVendors = [...new Set(winningQuotes.map(q => q.vendorName))].join(', ');
  
  const awardedItems = requisition.items.filter(item => {
    // This logic assumes `awardedQuoteItemIds` on the requisition correctly holds the `QuoteItem` IDs
    return requisition.awardedQuoteItemIds?.some(awardedId => {
        for (const quote of winningQuotes) {
            // Fix: Ensure quote.items exists and is an array before iterating
            if (Array.isArray(quote.items)) {
                for (const quoteItem of quote.items) {
                    if (quoteItem.id === awardedId && quoteItem.requisitionItemId === item.id) {
                        return true;
                    }
                }
            }
        }
        return false;
    });
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
            <DialogHeader>
                <DialogTitle>Approval Summary: {requisition.id}</DialogTitle>
                <DialogDescription>
                    Executive brief for the award recommendation.
                </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[70vh] pr-4">
                <div className="space-y-4 py-4">
                    {/* Financial Impact */}
                    <div className="space-y-2">
                        <h4 className="font-semibold text-lg">Financial Overview</h4>
                        <div className="p-4 bg-muted/50 rounded-md grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-sm text-muted-foreground">Total Award Value</p>
                                <p className="text-2xl font-bold">{requisition.totalPrice.toLocaleString()} ETB</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Winning Vendor(s)</p>
                                <p className="text-lg font-semibold">{winningVendors || 'N/A'}</p>
                            </div>
                        </div>
                    </div>
                     <Separator />
                     {/* Award Details */}
                     <div>
                        <h4 className="font-semibold text-lg mb-2">Awarded Items</h4>
                        <div className="border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Item</TableHead>
                                    <TableHead className="text-right">Quantity</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {awardedItems.length > 0 ? (
                                    awardedItems.map(item => (
                                     <TableRow key={item.id}>
                                        <TableCell>{item.name}</TableCell>
                                        <TableCell className="text-right">{item.quantity}</TableCell>
                                     </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={2} className="text-center h-24">No items specified in award.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                        </div>
                    </div>
                    <Separator />
                    {/* Process Justification */}
                     {requisition.evaluationCriteria && (
                        <div>
                            <h4 className="font-semibold text-lg mb-2">Process Justification</h4>
                             <div className="flex justify-around p-4 text-center bg-muted/50 rounded-md">
                                <div>
                                    <p className="font-semibold text-xl">{requisition.evaluationCriteria.financialWeight}%</p>
                                    <p className="text-muted-foreground text-sm">Financial Weight</p>
                                </div>
                                <div>
                                    <p className="font-semibold text-xl">{requisition.evaluationCriteria.technicalWeight}%</p>
                                    <p className="text-muted-foreground text-sm">Technical Weight</p>
                                </div>
                            </div>
                        </div>
                     )}
                     <Separator />
                    {/* Requisition Snapshot */}
                    <div className="space-y-4">
                        <h4 className="font-semibold text-lg">Original Request Details</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div><p className="font-medium">Title</p><p className="text-muted-foreground">{requisition.title}</p></div>
                            <div><p className="font-medium">Requester</p><p className="text-muted-foreground">{requisition.requesterName} ({requisition.department})</p></div>
                        </div>
                        <div>
                            <p className="font-medium mb-1">Business Justification</p>
                            <p className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-md">{requisition.justification}</p>
                        </div>
                    </div>

                </div>
            </ScrollArea>
            <DialogFooter>
                <Button onClick={onClose}>Close</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
  );
}
