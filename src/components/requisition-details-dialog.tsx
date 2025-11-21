
'use client';

import { PurchaseRequisition, PurchaseOrder, PerItemAwardDetail } from '@/lib/types';
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
import { format, isPast } from 'date-fns';
import { ScrollArea } from './ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { CheckCircle, Circle, Clock, FileText, Send, UserCheck, Users, Trophy } from 'lucide-react';
import Link from 'next/link';

interface RequisitionDetailsDialogProps {
  requisition: PurchaseRequisition;
  isOpen: boolean;
  onClose: () => void;
}

const TimelineStep = ({ title, status, isLast = false }: { title: string, status: 'complete' | 'active' | 'pending', isLast?: boolean }) => {
    const statusClasses = {
        complete: "bg-green-500 border-green-500 text-white",
        active: "bg-primary border-primary text-primary-foreground animate-pulse",
        pending: "bg-muted border-border text-muted-foreground",
    }
    return (
        <div className="flex items-start">
            <div className="flex flex-col items-center">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${statusClasses[status]}`}>
                    {status === 'complete' ? <CheckCircle className="h-5 w-5"/> : <div className="h-2.5 w-2.5 bg-current rounded-full" />}
                </div>
                {!isLast && <div className={`h-12 w-0.5 ${status === 'complete' ? 'bg-green-500' : 'bg-border'}`}></div>}
            </div>
            <div className="ml-4 -mt-1">
                <h4 className="font-semibold text-sm">{title}</h4>
                <p className="text-xs text-muted-foreground capitalize">{status}</p>
            </div>
        </div>
    )
}

export function RequisitionDetailsDialog({ requisition, isOpen, onClose }: RequisitionDetailsDialogProps) {
  if (!requisition) return null;

  const getTimelineStatus = (step: number) => {
    const stepOrder = ['Draft', 'Pending_Approval', 'PreApproved', 'Accepting_Quotes', 'Scoring_In_Progress', 'Scoring_Complete', 'Pending_Review', 'PostApproved', 'Awarded', 'PO_Created', 'Fulfilled', 'Closed'];
    
    // Normalize current status to match stepOrder. Any "Pending_Committee..." becomes "Pending_Review"
    let normalizedStatus = requisition.status;
    if (requisition.status.startsWith('Pending_') && requisition.status !== 'Pending_Approval') {
        normalizedStatus = 'Pending_Review';
    }

    const currentStatusIndex = stepOrder.findIndex(s => normalizedStatus.startsWith(s));
    
    if (currentStatusIndex > step) return 'complete';
    if (currentStatusIndex === step) return 'active';
    return 'pending';
  }

  const awardStrategy = (requisition.rfqSettings as any)?.awardStrategy;
  const isAwarded = ['Awarded', 'Award_Declined', 'PO_Created', 'Fulfilled', 'Closed', 'PostApproved'].includes(requisition.status) || requisition.status.startsWith('Pending_');
  
  const winningQuote = awardStrategy === 'all' ? requisition.quotations?.find(q => q.status === 'Accepted' || q.status === 'Awarded') : null;
  
  const perItemWinners = awardStrategy === 'item' ? requisition.items.map(item => {
    const awardDetail = (item.perItemAwardDetails || []).find(d => d.status === 'Accepted' || d.status === 'Awarded' || d.status === 'Pending_Award');
    return {
        itemName: item.name,
        winner: awardDetail?.vendorName,
        price: awardDetail ? awardDetail.unitPrice * item.quantity : 0
    };
  }).filter(item => item.winner) : [];

  const getItemStatus = (item: PurchaseRequisition['items'][0]): React.ReactNode => {
      if (awardStrategy === 'item') {
          const details = (item.perItemAwardDetails as PerItemAwardDetail[] | undefined) || [];
          const winningDetail = details.find(d => d.status === 'Accepted' || d.status === 'Awarded' || d.status === 'Pending_Award');
          if (winningDetail) {
              return (
                <div className="flex flex-col text-xs">
                    <span className="font-semibold">{winningDetail.status.replace(/_/g, ' ')}</span>
                    <span className="text-muted-foreground">to {winningDetail.vendorName}</span>
                </div>
              )
          }
           const standbyDetail = details.find(d => d.status === 'Standby');
           if (standbyDetail) {
               return (
                <div className="flex flex-col text-xs">
                    <span className="font-semibold">Standby</span>
                    <span className="text-muted-foreground">{standbyDetail.vendorName} (Rank {standbyDetail.rank})</span>
                </div>
               )
           }
      }
      // For single vendor awards or before the award stage, show the overall requisition status
      return <Badge variant="outline">{requisition.status.replace(/_/g, ' ')}</Badge>;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl">
            <DialogHeader>
            <DialogTitle>Details for Requisition: {requisition.id}</DialogTitle>
            <DialogDescription>
                A summary of the lifecycle for the requisition "{requisition.title}".
            </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[70vh] pr-4">
                <div className="grid grid-cols-1 md:grid-cols-[1fr_250px] gap-6 py-4">
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div><p className="font-medium">Requester</p><p className="text-muted-foreground">{requisition.requesterName}</p></div>
                            <div><p className="font-medium">Department</p><p className="text-muted-foreground">{requisition.department}</p></div>
                            <div><p className="font-medium">Created</p><p className="text-muted-foreground">{requisition.createdAt ? format(new Date(requisition.createdAt), 'PP') : 'N/A'}</p></div>
                            <div><p className="font-medium">Urgency</p><div><Badge variant={requisition.urgency === 'High' || requisition.urgency === 'Critical' ? 'destructive' : 'secondary'}>{requisition.urgency}</Badge></div></div>
                        </div>
                        <Separator />
                        <div>
                            <h4 className="font-medium mb-2">Items Requested</h4>
                            <div className="border rounded-md">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Item Name</TableHead>
                                            <TableHead className="text-right">Quantity</TableHead>
                                            <TableHead className="text-right">Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {requisition.items?.map(item => (
                                            <TableRow key={item.id}>
                                                <TableCell>{item.name}</TableCell>
                                                <TableCell className="text-right">{item.quantity}</TableCell>
                                                <TableCell className="text-right">{getItemStatus(item)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                        {isAwarded && (
                            <>
                                <Separator />
                                <div>
                                    <h4 className="font-medium mb-2 flex items-center gap-2"><Trophy className="text-amber-500" /> Award Summary</h4>
                                    <div className="p-4 bg-muted/50 rounded-lg space-y-4">
                                        {awardStrategy === 'all' ? (
                                            <div className="flex justify-between items-center">
                                                <div>
                                                    <p className="text-xs text-muted-foreground">Winning Vendor (Single Award)</p>
                                                    <p className="font-semibold">{winningQuote?.vendorName || 'N/A'}</p>
                                                </div>
                                                 <div className="text-right">
                                                     <p className="text-xs text-muted-foreground">Total Award Value</p>
                                                     <p className="font-semibold text-lg">{requisition.totalPrice.toLocaleString()} ETB</p>
                                                 </div>
                                            </div>
                                        ) : (
                                            <Table>
                                                <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Winning Vendor</TableHead><TableHead className="text-right">Price</TableHead></TableRow></TableHeader>
                                                <TableBody>
                                                    {perItemWinners.map(item => (
                                                        <TableRow key={item.itemName}><TableCell>{item.itemName}</TableCell><TableCell>{item.winner}</TableCell><TableCell className="text-right">{item.price.toLocaleString()} ETB</TableCell></TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                        {(requisition.purchaseOrders && requisition.purchaseOrders.length > 0) && (
                            <>
                                <Separator />
                                <div>
                                    <h4 className="font-medium mb-2 flex items-center gap-2"><FileText /> Final Documents</h4>
                                    <div className="space-y-2">
                                        {(requisition.purchaseOrders as any[]).map((po: {id: string, vendor: {name: string}}) => (
                                            <Button key={po.id} variant="outline" asChild className="w-full justify-start">
                                                <Link href={`/purchase-orders/${po.id}`}>PO: {po.id} ({po.vendor.name})</Link>
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}

                    </div>
                    <div className="space-y-4">
                         <h4 className="font-medium text-sm">Lifecycle Status</h4>
                         <TimelineStep title="Requisition Submitted" status={getTimelineStatus(0)} />
                         <TimelineStep title="Departmental Approval" status={getTimelineStatus(2)} />
                         <TimelineStep title="RFQ & Bidding" status={getTimelineStatus(3)} />
                         <TimelineStep title="Committee Scoring" status={getTimelineStatus(4)} />
                         <TimelineStep title="Final Award Review" status={getTimelineStatus(6)} />
                         <TimelineStep title="Vendor Awarded" status={getTimelineStatus(8)} />
                         <TimelineStep title="Fulfilled & Closed" status={getTimelineStatus(10)} isLast/>
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
