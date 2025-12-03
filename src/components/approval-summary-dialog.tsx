
'use client';

import { AuditLog as AuditLogType, Minute, PurchaseRequisition } from '@/lib/types';
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
import { format, formatDistanceToNow } from 'date-fns';
import { ScrollArea } from './ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { AlertCircle, CheckCircle, FileText, MessageSquare, User, Trophy, Crown, Medal, Building, Users2, ShoppingCart, ListChecks, DollarSign, Award, ThumbsUp } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';

interface ApprovalSummaryDialogProps {
  requisition: PurchaseRequisition;
  isOpen: boolean;
  onClose: () => void;
}

const MinuteSection = ({ title, children }: { title: string, children: React.ReactNode }) => (
    <div className="space-y-2">
        <h4 className="font-semibold text-lg text-primary">{title}</h4>
        <div className="pl-4 border-l-2 border-border/70 space-y-4">{children}</div>
    </div>
);

const MinuteSubSection = ({ title, children }: { title: string, children: React.ReactNode }) => (
    <div>
        <h5 className="font-medium text-base mb-2">{title}</h5>
        {children}
    </div>
);


export function ApprovalSummaryDialog({ requisition, isOpen, onClose }: ApprovalSummaryDialogProps) {
  if (!requisition) return null;

  const getRankIcon = (rank?: number) => {
    switch(rank) {
      case 1: return <Crown className="h-4 w-4 text-amber-400" />;
      case 2: return <Trophy className="h-4 w-4 text-slate-400" />;
      case 3: return <Medal className="h-4 w-4 text-amber-600" />;
      default: return null;
    }
  }

  const minute: any = requisition.minutes?.[0]?.minuteData;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
            <DialogHeader>
                <DialogTitle>Approval Summary: {requisition.id}</DialogTitle>
                <DialogDescription>
                    Executive brief for the award recommendation on:
                    <span className="font-semibold"> {requisition.title}</span>
                </DialogDescription>
            </DialogHeader>
             <div className="flex-1 overflow-hidden flex flex-col">
                <Tabs defaultValue="minutes" className="flex-1 flex flex-col min-h-0">
                    <TabsList>
                        <TabsTrigger value="minutes">Official Minute</TabsTrigger>
                        <TabsTrigger value="history">Workflow History</TabsTrigger>
                    </TabsList>
                    <TabsContent value="minutes" className="mt-4 flex-1 overflow-hidden">
                        <ScrollArea className="h-full pr-4">
                            {minute ? (
                                <div className="space-y-6 text-sm">
                                    <div className="text-center">
                                        <h2 className="text-xl font-bold">PROCUREMENT MINUTE</h2>
                                        <p className="text-muted-foreground">{minute.minuteReference}</p>
                                        <p className="text-xs text-muted-foreground">Date: {format(new Date(minute.meetingDate), 'PPP')}</p>
                                    </div>
                                    
                                    <MinuteSection title="1. Participants">
                                        <div className="flex flex-wrap gap-x-6 gap-y-2">
                                            {minute.participants.map((p: any) => (
                                                <div key={p.name}><span className="font-semibold">{p.name}</span>, <span className="text-muted-foreground">{p.role}</span></div>
                                            ))}
                                        </div>
                                    </MinuteSection>

                                    <MinuteSection title="2. Procurement Details">
                                        <MinuteSubSection title="2.1. Subject">
                                            <p>Award recommendation for RFQ#: <span className="font-mono">{minute.procurementDetails.requisitionId}</span> - {minute.procurementDetails.title}</p>
                                        </MinuteSubSection>
                                        <MinuteSubSection title="2.2. Method">
                                            <p>{minute.procurementDetails.procurementMethod}</p>
                                        </MinuteSubSection>
                                        <MinuteSubSection title="2.3. Items Requested">
                                            <ul className="list-disc list-inside space-y-1">
                                                {minute.procurementDetails.items.map((item: any) => (
                                                    <li key={item.name}>{item.name} (Quantity: {item.quantity})</li>
                                                ))}
                                            </ul>
                                        </MinuteSubSection>
                                    </MinuteSection>

                                    <MinuteSection title="3. Bidding Summary">
                                        <div className="grid grid-cols-2 gap-4">
                                            <Card className="p-4"><p className="text-muted-foreground text-xs">Vendors Invited</p><p className="font-bold text-2xl">{minute.bidders.vendorsInvited}</p></Card>
                                            <Card className="p-4"><p className="text-muted-foreground text-xs">Submissions Received</p><p className="font-bold text-2xl">{minute.bidders.vendorsSubmitted}</p></Card>
                                        </div>
                                    </MinuteSection>

                                    <MinuteSection title="4. Evaluation Summary">
                                        <Table>
                                             <TableHeader><TableRow><TableHead>Vendor</TableHead><TableHead className="text-right">Final Score</TableHead><TableHead className="text-right">Total Price</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                                             <TableBody>
                                                 {minute.evaluationSummary.map((eval: any) => (
                                                     <TableRow key={eval.vendorName}>
                                                         <TableCell className="font-semibold">{eval.vendorName}</TableCell>
                                                         <TableCell className="text-right font-mono">{eval.finalScore.toFixed(2)}</TableCell>
                                                         <TableCell className="text-right font-mono">{eval.totalPrice.toLocaleString()} ETB</TableCell>
                                                         <TableCell>{eval.isDisqualified ? 'Disqualified' : `Rank ${eval.rank}`}</TableCell>
                                                     </TableRow>
                                                 ))}
                                             </TableBody>
                                        </Table>
                                    </MinuteSection>
                                    
                                     <MinuteSection title="5. System Analysis & Award Recommendation">
                                         <MinuteSubSection title="5.1. System Recommendation">
                                            <Alert>
                                                <Award className="h-4 w-4" />
                                                <AlertTitle>Winner(s): {minute.systemAnalysis.winner}</AlertTitle>
                                                <AlertDescription>
                                                    <p>Strategy: <span className="font-semibold">{minute.systemAnalysis.awardStrategy}</span></p>
                                                    <p>{minute.systemAnalysis.result}</p>
                                                </AlertDescription>
                                            </Alert>
                                        </MinuteSubSection>
                                        <MinuteSubSection title="5.2. Committee Decision">
                                            <p className="italic">"{minute.awardRecommendation.justification}"</p>
                                        </MinuteSubSection>
                                    </MinuteSection>

                                    <MinuteSection title="6. Conclusion">
                                        <p className="italic">{minute.conclusion}</p>
                                    </MinuteSection>
                                    
                                    <div className="text-xs text-muted-foreground text-center pt-4 border-t">
                                        Minute generated by {minute.auditMetadata.generatedBy} on {format(new Date(minute.auditMetadata.generationTimestamp), 'PPpp')} (v{minute.auditMetadata.logicVersion})
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center h-full flex items-center justify-center text-muted-foreground">
                                    <p>No formal minute was generated for this award stage.</p>
                                </div>
                            )}
                        </ScrollArea>
                    </TabsContent>
                    <TabsContent value="history" className="mt-4 flex-1 overflow-hidden">
                        <ScrollArea className="h-full pr-4">
                            <div className="relative pl-6 py-4">
                                <div className="absolute left-6 top-0 h-full w-0.5 bg-border -translate-x-1/2"></div>
                                {(requisition.auditTrail || []).length > 0 ? (requisition.auditTrail || []).map((log: AuditLogType, index: number) => {
                                     const commentMatch = log.details.match(/with comment: "([^"]+)"/i) || log.details.match(/Reason: "([^"]+)"/i);
                                     const comment = commentMatch ? commentMatch[1] : null;
                                     const mainDetail = log.details.split(/ with comment:| Reason:/)[0];
                                    
                                    return (
                                    <div key={log.id} className="relative mb-8">
                                        <div className="absolute -left-3 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-background border-2 border-primary">
                                            <CheckCircle className="h-4 w-4 text-primary" />
                                        </div>
                                        <div className="pl-8">
                                            <p className="font-semibold">{log.action.replace(/_/g, ' ')}</p>
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <User className="h-3 w-3" />
                                                <span>By {log.user} ({log.role})</span>
                                                <span>&bull;</span>
                                                <time>{formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}</time>
                                            </div>
                                            <p className="mt-2 text-sm text-muted-foreground">{mainDetail}</p>
                                            {comment && (
                                                <blockquote className="mt-2 pl-3 border-l-2 border-border text-sm italic flex items-start gap-2">
                                                    <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                                                    "{comment}"
                                                </blockquote>
                                            )}
                                        </div>
                                    </div>
                                    );
                                }) : (
                                    <Alert>
                                        <AlertCircle className="h-4 w-4" />
                                        <AlertTitle>No History</AlertTitle>
                                        <AlertDescription>
                                            No audit trail events were found for this requisition's transaction ID.
                                        </AlertDescription>
                                    </Alert>
                                )}
                            </div>
                        </ScrollArea>
                    </TabsContent>
                </Tabs>
            </div>
            <DialogFooter>
                <Button onClick={onClose}>Close</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
  );
}
