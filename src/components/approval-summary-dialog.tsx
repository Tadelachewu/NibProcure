
'use client';

import { AuditLog as AuditLogType, Minute, PurchaseRequisition, Quotation, Signature } from '@/lib/types';
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
import { AlertCircle, CheckCircle, FileText, MessageSquare, User, Trophy, Crown, Medal, Download, PenLine, History } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import Link from 'next/link';


interface ApprovalSummaryDialogProps {
  requisition: PurchaseRequisition;
  isOpen: boolean;
  onClose: () => void;
}

export function ApprovalSummaryDialog({ requisition, isOpen, onClose }: ApprovalSummaryDialogProps) {
  if (!requisition) return null;

  const isPerItemStrategy = (requisition.rfqSettings as any)?.awardStrategy === 'item';

  const sortedQuotes = requisition.quotations?.sort((a, b) => (b.finalAverageScore || 0) - (a.finalAverageScore || 0)) || [];

  const declinedQuote = sortedQuotes.find(q => q.status === 'Declined');
  const isPromotedStandby = !!declinedQuote;

  const winner = sortedQuotes.find(q => q.status === 'Pending_Award' || q.status === 'Awarded' || q.status === 'Accepted' || q.status === 'Partially_Awarded');

  const topThree = sortedQuotes.slice(0, 3);

  let winningVendors: {id: string, name: string}[] = [];

  if(isPerItemStrategy) {
    const uniqueVendorIds = new Set<string>();
    requisition.items.forEach(item => {
        const award = (item.perItemAwardDetails || []).find(d => d.status === 'Pending_Award' || d.status === 'Accepted');
        if(award) {
            uniqueVendorIds.add(award.vendorId);
        }
    });
    const allQuotes = requisition.quotations || [];
    winningVendors = allQuotes
      .filter(q => uniqueVendorIds.has(q.vendorId))
      .map(q => ({ id: q.vendorId, name: q.vendorName }));
  } else if (winner) {
    winningVendors = [{ id: winner.vendorId, name: winner.vendorName }];
  }


  const getRankIcon = (rank?: number) => {
    switch(rank) {
      case 1: return <Crown className="h-4 w-4 text-amber-400" />;
      case 2: return <Trophy className="h-4 w-4 text-slate-400" />;
      case 3: return <Medal className="h-4 w-4 text-amber-600" />;
      default: return null;
    }
  }

  const SignaturesList = ({ signatures }: { signatures: Signature[] }) => (
    <div className="mt-4">
        <h4 className="font-semibold text-sm">Digital Signatures</h4>
        <div className="mt-2 space-y-2">
            {signatures.map(sig => (
                <div key={sig.id} className="text-xs p-2 border rounded-md bg-muted/50">
                    <div className="flex justify-between items-center">
                         <p className="flex items-center gap-1">
                            <Badge variant={sig.decision === 'APPROVED' ? 'default' : 'destructive'} className="text-xs">{sig.decision}</Badge>
                            by <span className="font-semibold">{sig.signerName}</span> ({sig.signerRole})
                        </p>
                        <time className="text-muted-foreground">{format(new Date(sig.signedAt), 'PPp')}</time>
                    </div>
                    {sig.comment && (
                        <p className="italic text-muted-foreground mt-1 pl-1 border-l-2">"{sig.comment}"</p>
                    )}
                </div>
            ))}
        </div>
    </div>
  );

  const renderMinute = (minute: Minute) => {
    if (minute.type === 'uploaded_document') {
        return (
            <Card key={minute.id}>
                <CardHeader>
                    <CardTitle className="flex justify-between items-center text-base">
                        <span>Official Minute: {minute.decisionBody}</span>
                        <Badge variant={minute.decision === 'APPROVED' ? 'default' : 'destructive'}>{minute.decision}</Badge>
                    </CardTitle>
                    <CardDescription>Recorded by {minute.author.name} on {format(new Date(minute.createdAt), 'PP')}</CardDescription>
                </CardHeader>
                <CardContent>
                    {minute.documentUrl ? (
                         <Button asChild variant="outline" className="w-full">
                            <a href={minute.documentUrl} target="_blank" rel="noopener noreferrer">
                                <Download className="mr-2 h-4 w-4" />
                                Download Official Minute Document
                            </a>
                        </Button>
                    ) : (
                        <p className="text-sm text-destructive">Document URL is missing for this minute.</p>
                    )}
                    {minute.signatures && minute.signatures.length > 0 && (
                        <SignaturesList signatures={minute.signatures} />
                    )}
                </CardContent>
            </Card>
        );
    }
    return null;
  }


  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
            <DialogHeader>
                <DialogTitle>Requisition History: {requisition.id}</DialogTitle>
                <DialogDescription>
                    Full audit trail and decision summary for: {requisition.title}
                </DialogDescription>
            </DialogHeader>
             <div className="flex-1 overflow-hidden flex flex-col">
                <Tabs defaultValue="history" className="flex-1 flex flex-col min-h-0">
                    <TabsList>
                        <TabsTrigger value="summary">Award Summary</TabsTrigger>
                        <TabsTrigger value="history">Workflow History</TabsTrigger>
                        <TabsTrigger value="minutes">Meeting Minutes</TabsTrigger>
                    </TabsList>
                    <TabsContent value="summary" className="mt-4 flex-1 overflow-hidden">
                        <ScrollArea className="h-full pr-4">
                            <div className="space-y-4 py-4">
                                {isPromotedStandby && (
                                    <Alert variant="destructive">
                                        <AlertCircle className="h-4 w-4" />
                                        <AlertTitle>Promoted Standby Vendor</AlertTitle>
                                        <AlertDescription>
                                            The original winning vendor has declined the award. This recommendation is for the next vendor(s) in line.
                                        </AlertDescription>
                                    </Alert>
                                )}
                                {/* Financial Impact */}
                                <div className="space-y-2">
                                    <h4 className="font-semibold text-lg">Financial Overview</h4>
                                    <div className="p-4 bg-muted/50 rounded-md grid grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-sm text-muted-foreground">Total Award Value</p>
                                            <p className="text-2xl font-bold">{requisition.totalPrice.toLocaleString()} ETB</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-muted-foreground">
                                                {isPerItemStrategy ? 'Winning Vendors' : 'Recommended Winning Vendor'}
                                            </p>
                                            <div className="text-lg font-semibold">
                                                {winningVendors.length > 0 ? winningVendors.map(v => v.name).join(', ') : 'N/A'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <Separator />

                                {isPerItemStrategy ? (
                                    <div>
                                        <h4 className="font-semibold text-lg mb-2">Award by Best Item Breakdown</h4>
                                        <div className="border rounded-md">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Requested Item</TableHead>
                                                        <TableHead>Winning Vendor</TableHead>
                                                        <TableHead>Proposed Item & Price</TableHead>
                                                        <TableHead>Total</TableHead>
                                                        <TableHead>Status</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {requisition.items.map(item => {
                                                        const award = (item.perItemAwardDetails || []).find(d => d.status === 'Pending_Award' || d.status === 'Accepted');
                                                        return (
                                                            <TableRow key={item.id}>
                                                                <TableCell className="font-medium">{item.name}</TableCell>
                                                                <TableCell>{award?.vendorName || 'N/A'}</TableCell>
                                                                <TableCell>
                                                                    {award ? (
                                                                        <>
                                                                            <p>{award.proposedItemName}</p>
                                                                            <p className="text-xs text-muted-foreground font-mono">@{award.unitPrice.toLocaleString()} ETB</p>
                                                                        </>
                                                                    ) : 'N/A'}
                                                                </TableCell>
                                                                <TableCell className="font-semibold">
                                                                    {award ? (award.unitPrice * item.quantity).toLocaleString() : 'N/A'} ETB
                                                                </TableCell>
                                                                <TableCell>
                                                                    {award ? <Badge>{award.status.replace(/_/g, ' ')}</Badge> : <Badge variant="outline">N/A</Badge>}
                                                                </TableCell>
                                                            </TableRow>
                                                        )
                                                    })}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </div>
                                ) : (
                                    <div>
                                        <h4 className="font-semibold text-lg mb-2">Vendor Comparison</h4>
                                        <div className="border rounded-md">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Rank</TableHead>
                                                    <TableHead>Vendor</TableHead>
                                                    <TableHead className="text-right">Final Score</TableHead>
                                                    <TableHead className="text-right">Total Price</TableHead>
                                                    <TableHead>Status</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {topThree.length > 0 ? (
                                                    topThree.map((quote) => (
                                                    <TableRow key={quote.id} className={quote.id === winner?.id ? 'bg-green-500/10' : ''}>
                                                        <TableCell className="font-bold flex items-center gap-1">{getRankIcon(quote.rank)} {quote.rank || 'N/A'}</TableCell>
                                                        <TableCell>{quote.vendorName}</TableCell>
                                                        <TableCell className="text-right font-mono">{quote.finalAverageScore?.toFixed(2) || 'N/A'}</TableCell>
                                                        <TableCell className="text-right font-mono">{quote.totalPrice.toLocaleString()} ETB</TableCell>
                                                        <TableCell><Badge variant={quote.status === 'Declined' ? 'destructive' : 'outline'}>{quote.status.replace(/_/g, ' ')}</Badge></TableCell>
                                                    </TableRow>
                                                    ))
                                                ) : (
                                                    <TableRow>
                                                        <TableCell colSpan={5} className="text-center h-24">No quotations found.</TableCell>
                                                    </TableRow>
                                                )}
                                            </TableBody>
                                        </Table>
                                        </div>
                                    </div>
                                )}

                                <Separator />
                                {/* Requisition Snapshot */}
                                <div className="space-y-4">
                                    <h4 className="font-semibold text-lg">Original Request Details</h4>
                                     <ScrollArea className="h-48 rounded-md border p-3">
                                        <div>
                                            <p className="font-medium mb-1">Business Justification</p>
                                            <p className="text-sm text-muted-foreground">{requisition.justification}</p>
                                        </div>
                                    </ScrollArea>
                                </div>

                            </div>
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
                                            <History className="h-4 w-4 text-primary" />
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
                    <TabsContent value="minutes" className="mt-4 flex-1 overflow-hidden">
                        <ScrollArea className="h-full pr-4">
                            {requisition.minutes && requisition.minutes.length > 0 ? (
                                <div className="space-y-4 py-4">
                                    {requisition.minutes.map(minute => renderMinute(minute))}
                                </div>
                            ): (
                                <div className="text-center h-48 flex items-center justify-center text-muted-foreground">No meeting minutes found for this requisition.</div>
                            )}
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
