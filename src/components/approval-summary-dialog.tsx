
'use client';

import { AuditLog as AuditLogType, PurchaseRequisition } from '@/lib/types';
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

interface ApprovalSummaryDialogProps {
  requisition: PurchaseRequisition;
  isOpen: boolean;
  onClose: () => void;
}

export function ApprovalSummaryDialog({ requisition, isOpen, onClose }: ApprovalSummaryDialogProps) {
  if (!requisition) return null;
  
  const sortedQuotes = requisition.quotations?.sort((a, b) => (b.finalAverageScore || 0) - (a.finalAverageScore || 0)) || [];
  const winner = sortedQuotes[0];
  const topThree = sortedQuotes.slice(0, 3);
  
  const winningVendor = winner?.vendorName || 'N/A';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl">
            <DialogHeader>
                <DialogTitle>Approval Summary: {requisition.id}</DialogTitle>
                <DialogDescription>
                    Executive brief for the award recommendation on: <span className="font-semibold">{requisition.title}</span>
                </DialogDescription>
            </DialogHeader>
            <Tabs defaultValue="summary" className="min-h-[60vh]">
                <TabsList>
                    <TabsTrigger value="summary">Summary</TabsTrigger>
                    <TabsTrigger value="history">Workflow History</TabsTrigger>
                    <TabsTrigger value="minutes">Minutes</TabsTrigger>
                </TabsList>
                <TabsContent value="summary" className="mt-4">
                    <ScrollArea className="max-h-[65vh] pr-4">
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
                                        <p className="text-lg font-semibold">{winningVendor}</p>
                                    </div>
                                </div>
                            </div>
                            <Separator />
                            {/* Award Details */}
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
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {topThree.length > 0 ? (
                                            topThree.map((quote, index) => (
                                            <TableRow key={quote.vendorId} className={index === 0 ? 'bg-green-500/10' : ''}>
                                                <TableCell className="font-bold">{index + 1}</TableCell>
                                                <TableCell>{quote.vendorName}</TableCell>
                                                <TableCell className="text-right font-mono">{quote.finalAverageScore?.toFixed(2) || 'N/A'}</TableCell>
                                                <TableCell className="text-right font-mono">{quote.totalPrice.toLocaleString()} ETB</TableCell>
                                            </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center h-24">No quotations found.</TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                                </div>
                                <p className="text-xs text-muted-foreground mt-2">
                                    The winner is recommended based on the combined evaluation criteria: 
                                    <strong> {requisition.evaluationCriteria?.financialWeight}% Financial</strong> and 
                                    <strong> {requisition.evaluationCriteria?.technicalWeight}% Technical</strong>.
                                </p>
                            </div>
                            <Separator />
                            {/* Requisition Snapshot */}
                            <div className="space-y-4">
                                <h4 className="font-semibold text-lg">Original Request Details</h4>
                                <div>
                                    <p className="font-medium mb-1">Business Justification</p>
                                    <p className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-md">{requisition.justification}</p>
                                </div>
                            </div>

                        </div>
                    </ScrollArea>
                </TabsContent>
                <TabsContent value="history" className="mt-4">
                    <ScrollArea className="max-h-[65vh] pr-4">
                        <div className="relative pl-6 py-4">
                            <div className="absolute left-6 top-0 h-full w-0.5 bg-border -translate-x-1/2"></div>
                            {(requisition.auditTrail || []).map((log: AuditLogType, index: number) => (
                                <div key={log.id} className="relative mb-8">
                                    <div className="absolute -left-3 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-secondary">
                                        <div className="h-3 w-3 rounded-full bg-primary"></div>
                                    </div>
                                    <div className="pl-8">
                                        <div className="flex items-center justify-between">
                                            <Badge variant="outline">{log.action.replace(/_/g, ' ')}</Badge>
                                            <time className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}</time>
                                        </div>
                                        <p className="mt-2 text-sm text-muted-foreground">{log.details}</p>
                                        <p className="mt-2 text-xs text-muted-foreground">
                                            By <span className="font-semibold text-foreground">{log.user}</span> ({log.role})
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </TabsContent>
                 <TabsContent value="minutes" className="mt-4">
                    <ScrollArea className="max-h-[65vh] pr-4">
                        {requisition.minutes && requisition.minutes.length > 0 ? (
                            <div className="space-y-4 py-4">
                            {requisition.minutes.map(minute => (
                                <Card key={minute.id}>
                                    <CardHeader>
                                        <CardTitle className="flex justify-between items-center text-base">
                                            <span>Minute: {minute.decisionBody}</span>
                                            <Badge variant={minute.decision === 'APPROVED' ? 'default' : 'destructive'}>{minute.decision}</Badge>
                                        </CardTitle>
                                        <CardDescription>Recorded by {minute.author.name} on {format(new Date(minute.createdAt), 'PP')}</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <h4 className="font-semibold text-sm">Justification</h4>
                                        <p className="text-sm text-muted-foreground p-3 border rounded-md bg-muted/50 mt-1">{minute.justification}</p>
                                        <h4 className="font-semibold text-sm mt-4">Attendees</h4>
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            {minute.attendees.map(attendee => <Badge key={attendee.id} variant="outline">{attendee.name}</Badge>)}
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                            </div>
                        ): (
                            <div className="text-center h-48 flex items-center justify-center text-muted-foreground">No meeting minutes found for this requisition.</div>
                        )}
                    </ScrollArea>
                 </TabsContent>
            </Tabs>
            <DialogFooter>
                <Button onClick={onClose}>Close</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
  );
}
