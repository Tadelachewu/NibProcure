'use client';

import { PurchaseRequisition, PurchaseOrder, PerItemAwardDetail, User, EvaluationCriterion } from '@/lib/types';
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
import { CheckCircle, Circle, Clock, FileText, Send, UserCheck, Users, Trophy, Calendar, UserCog, Landmark, Percent, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';

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

const DetailItem = ({ label, children }: { label: string, children: React.ReactNode }) => (
    <div>
        <p className="font-medium text-sm">{label}</p>
        <div className="text-sm text-muted-foreground">{children}</div>
    </div>
);


export function RequisitionDetailsDialog({ requisition, isOpen, onClose }: RequisitionDetailsDialogProps) {
  const { allUsers } = useAuth();
  if (!requisition) return null;

    const getTimelineStatusByKey = (key: string) => {
                // Canonical timeline keys for stable ordering & correct stage mapping.
                // NOTE: Not every key must be rendered as a visible TimelineStep.
                const stepOrder = [
                        'Draft',
                        'Submitted',
                        'Departmental_Approval',
                        'Procurement_Approval',
                        'PreApproved',
                        'Accepting_Quotes',
                        'Scoring_In_Progress',
                        'Scoring_Complete',
                        'Pending_Review',
                        'PostApproved',
                        'Awarded',
                        'PO_Created',
                        'Fulfilled',
                        'Closed'
                ];

        const raw = (requisition.status || '').replace(/ /g, '_');

        const normalizeForTimeline = (status: string) => {
            // Departmental approval: from "submit" until dept head acts.
            const departmentalApprovalPending = new Set([
                'Pending_Approval',
            ]);

            // Procurement approval: after dept head approval (director/manager/etc).
            const procurementApprovalPending = new Set([
                'Pending_Director_Approval',
                'Pending_Managerial_Approval',
                'Pending_VP_Approval',
                'Pending_President_Approval',
                'Pending_Procurement_Approval',
            ]);

            // Final award review pending states (after scoring)
            const awardReviewPending = new Set([
                'Pending_Committee_A_Recommendation',
                'Pending_Committee_B_Review',
                'Pending_Review',
            ]);

            if (!status) return 'Draft';
            if (status === 'Draft') return 'Draft';
            // Rejected means it was in an approval stage and needs rework; keep it on the
            // approval timeline rather than jumping back to RFQ.
            if (status === 'Rejected') return 'Departmental_Approval';
            if (status === 'Approved') return 'PreApproved';

            if (departmentalApprovalPending.has(status)) return 'Departmental_Approval';
            if (procurementApprovalPending.has(status)) return 'Procurement_Approval';

            if (status === 'PreApproved') return 'PreApproved';

            if (status === 'Accepting_Quotes') return 'Accepting_Quotes';
            if (status === 'Scoring_In_Progress') return 'Scoring_In_Progress';
            if (status === 'Scoring_Complete') return 'Scoring_Complete';

            if (awardReviewPending.has(status)) return 'Pending_Review';
            if (status.startsWith('Pending_')) return 'Pending_Review';

            if (status === 'PostApproved') return 'PostApproved';
            if (status === 'Awarded' || status === 'Award_Declined') return 'Awarded';

            if (status === 'PO_Created' || status === 'Partially_Closed') return 'PO_Created';
            if (status === 'Fulfilled') return 'Fulfilled';
            if (status === 'Closed') return 'Closed';

            // Fallback: if it's a known step key, keep it; otherwise treat as pending review
            if (stepOrder.includes(status)) return status;

            // Any other recognized lifecycle status implies the requisition is past Draft.
            return 'Submitted';
        };

        const mapped = normalizeForTimeline(raw);

        const currentIndex = stepOrder.findIndex(s => s === mapped);
        const targetIndex = stepOrder.findIndex(s => s === key);

        if (targetIndex === -1) return 'pending';
        if (currentIndex === -1) {
            // If the current status doesn't map to a known timeline key, mark only earlier
            // steps as pending and none as completed.
            return 'pending';
        }
        if (currentIndex > targetIndex) return 'complete';
        if (currentIndex === targetIndex) return 'active';
        return 'pending';
    }

  const awardStrategy = (requisition.rfqSettings as any)?.awardStrategy;
  const isAwarded = requisition.status && (['Awarded', 'Award_Declined', 'PO_Created', 'Fulfilled', 'Closed', 'PostApproved'].includes(requisition.status) || requisition.status.startsWith('Pending_'));
  
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
          const winningDetail = details.find(d => ['Accepted', 'Awarded', 'Pending_Award'].includes(d.status));
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
           if (details.some(d => d.status === 'Declined' || d.status === 'Failed_to_Award')) {
               return <Badge variant="destructive">Award Declined</Badge>
           }
      }
      return <Badge variant="outline">{requisition.status.replace(/_/g, ' ')}</Badge>;
  }
  
  const financialCommittee = allUsers.filter(u => requisition.financialCommitteeMemberIds?.includes(u.id));
  const technicalCommittee = allUsers.filter(u => requisition.technicalCommitteeMemberIds?.includes(u.id));

  const CriteriaTable = ({ title, weight, criteria }: { title: string, weight: number, criteria: EvaluationCriterion[] }) => (
    <div>
        <h5 className="font-semibold mb-1">{title} (Overall Weight: {weight}%)</h5>
        <div className="border rounded-md">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Criterion</TableHead>
                        <TableHead className="text-right w-24">Weight</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {criteria.map(c => (
                        <TableRow key={c.id}>
                            <TableCell>{c.name}</TableCell>
                            <TableCell className="text-right font-mono">{c.weight}%</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    </div>
  )

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
                            <DetailItem label="Requester">{requisition.requesterName}</DetailItem>
                            <DetailItem label="Department">{requisition.department}</DetailItem>
                            <DetailItem label="Created">{requisition.createdAt ? format(new Date(requisition.createdAt), 'PP') : 'N/A'}</DetailItem>
                            <DetailItem label="Urgency"><Badge variant={requisition.urgency === 'High' || requisition.urgency === 'Critical' ? 'destructive' : 'secondary'}>{requisition.urgency}</Badge></DetailItem>
                            <DetailItem label="Total Value">{(typeof requisition.totalPrice === 'number') ? `${requisition.totalPrice.toLocaleString()} ETB` : 'N/A'}</DetailItem>
                            <DetailItem label="CPO Requirement">{requisition.cpoAmount ? `${requisition.cpoAmount.toLocaleString()} ETB` : 'None'}</DetailItem>
                        </div>

                         <div className="space-y-2">
                            <h4 className="font-medium text-sm">Business Justification</h4>
                            <p className="text-sm text-muted-foreground p-3 border rounded-md bg-muted/50">{requisition.justification}</p>
                        </div>
                        
                        <Separator />

                        <div>
                            <h4 className="font-medium mb-2">Deadlines</h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                <DetailItem label="Quote Submission"><div className="flex items-center gap-1"><Calendar className="h-4 w-4"/>{requisition.deadline ? format(new Date(requisition.deadline), 'PPp') : 'N/A'}</div></DetailItem>
                                <DetailItem label="Scoring Deadline"><div className="flex items-center gap-1"><Calendar className="h-4 w-4"/>{requisition.scoringDeadline ? format(new Date(requisition.scoringDeadline), 'PPp') : 'N/A'}</div></DetailItem>
                                <DetailItem label="Vendor Response"><div className="flex items-center gap-1"><Calendar className="h-4 w-4"/>{requisition.awardResponseDeadline ? format(new Date(requisition.awardResponseDeadline), 'PPp') : 'N/A'}</div></DetailItem>
                            </div>
                        </div>

                        <Separator />

                        <div>
                            <h4 className="font-medium mb-2">Items Requested</h4>
                            <div className="border rounded-md">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Item</TableHead>
                                            <TableHead className="text-right w-24">Quantity</TableHead>
                                            <TableHead className="text-right w-40">Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {requisition.items?.map(item => (
                                            <TableRow key={item.id}>
                                                <TableCell>
                                                    <p className="font-medium">{item.name}</p>
                                                    {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                                                </TableCell>
                                                <TableCell className="text-right">{item.quantity}</TableCell>
                                                <TableCell className="text-right">{getItemStatus(item)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>

                        {requisition.evaluationCriteria && (
                            <>
                                <Separator />
                                <div>
                                    <h4 className="font-medium mb-2 flex items-center gap-2"><Percent /> Evaluation Criteria</h4>
                                    <div className="grid md:grid-cols-2 gap-4">
                                        <CriteriaTable title="Financial" weight={requisition.evaluationCriteria.financialWeight} criteria={requisition.evaluationCriteria.financialCriteria} />
                                        <CriteriaTable title="Technical" weight={requisition.evaluationCriteria.technicalWeight} criteria={requisition.evaluationCriteria.technicalCriteria} />
                                    </div>
                                </div>
                            </>
                        )}
                        
                        {(requisition.customQuestions && requisition.customQuestions.length > 0) && (
                            <>
                                <Separator />
                                <div>
                                    <h4 className="font-medium mb-2 flex items-center gap-2"><MessageSquare /> Custom Questions for Vendors</h4>
                                    <div className="space-y-2 text-sm border rounded-md p-4">
                                        {requisition.customQuestions.map(q => (
                                            <p key={q.id} className="text-muted-foreground">&bull; {q.questionText} {q.isRequired && <span className="text-destructive">*</span>}</p>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}


                        {(requisition.committeeName || financialCommittee.length > 0 || technicalCommittee.length > 0) && (
                            <>
                                <Separator />
                                <div>
                                    <h4 className="font-medium mb-2">Evaluation Committee</h4>
                                    <div className="p-4 bg-muted/50 rounded-lg space-y-4">
                                        <DetailItem label="Committee Name">{requisition.committeeName || 'Not Set'}</DetailItem>
                                        <DetailItem label="Purpose / Mandate">{requisition.committeePurpose || 'Not Set'}</DetailItem>
                                        <div className="grid grid-cols-2 gap-4">
                                            <DetailItem label="Financial Committee"><div className="flex flex-col gap-1 mt-1">{financialCommittee.map(u => <span key={u.id} className="text-xs flex items-center gap-1.5"><UserCog className="h-3 w-3"/> {u.name}</span>)}</div></DetailItem>
                                            <DetailItem label="Technical Committee"><div className="flex flex-col gap-1 mt-1">{technicalCommittee.map(u => <span key={u.id} className="text-xs flex items-center gap-1.5"><UserCog className="h-3 w-3"/> {u.name}</span>)}</div></DetailItem>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

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
                         <TimelineStep title="Draft" status={getTimelineStatusByKey('Draft')} />
                        <TimelineStep title="Submitted for Approval" status={getTimelineStatusByKey('Submitted')} />
                        <TimelineStep title="Departmental Approval" status={getTimelineStatusByKey('Departmental_Approval')} />
                        <TimelineStep title="Procurement Approval" status={getTimelineStatusByKey('Procurement_Approval')} />
                         <TimelineStep title="RFQ & Bidding" status={getTimelineStatusByKey('Accepting_Quotes')} />
                         <TimelineStep title="Committee Scoring" status={getTimelineStatusByKey('Scoring_In_Progress')} />
                         <TimelineStep title="Final Award Review" status={getTimelineStatusByKey('Pending_Review')} />
                         <TimelineStep title="Vendor Awarded" status={getTimelineStatusByKey('Awarded')} />
                         <TimelineStep title="Fulfilled & Closed" status={getTimelineStatusByKey('Closed')} isLast/>
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
