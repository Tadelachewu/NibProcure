
'use client';

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
  } from '@/components/ui/dialog';
import { Button } from './ui/button';
import { PurchaseRequisition, Quotation } from '@/lib/types';
import { useAuth } from '@/contexts/auth-context';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import { Badge } from './ui/badge';
import { FileText, UserCog } from 'lucide-react';
import Image from 'next/image';
import { differenceInCalendarDays } from 'date-fns';

interface QuoteDetailsDialogProps {
    quote: Quotation;
    requisition: PurchaseRequisition;
    isOpen: boolean;
    onClose: () => void;
    hidePrices: boolean;
}

export function QuoteDetailsDialog({ quote, requisition, isOpen, onClose, hidePrices }: QuoteDetailsDialogProps) {
    if (!quote || !requisition) return null;

    const { user } = useAuth();
    const isMasked = Boolean((requisition as any).rfqSettings?.masked);

    const findQuestionText = (questionId: string) => {
        return requisition.customQuestions?.find(q => q.id === questionId)?.questionText || "Unknown Question";
    }

    // Aggregate compliance results for this quotation's items
    const complianceMap = new Map<string, { total: number; nonCompliant: number }>();
    (quote.complianceSets || []).forEach((cs: any) => {
        (cs.itemCompliances || []).forEach((ic: any) => {
            const entry = complianceMap.get(ic.quoteItemId) || { total: 0, nonCompliant: 0 };
            entry.total += 1;
            if (ic.comply === false) entry.nonCompliant += 1;
            complianceMap.set(ic.quoteItemId, entry);
        });
    });

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Quotation Details: {quote.vendorName}</DialogTitle>
                    <DialogDescription>
                        Full submission details for requisition: {requisition.title}
                    </DialogDescription>
                </DialogHeader>
                <ScrollArea className="flex-1 -mx-6 px-6">
                    {isMasked ? (
                        <div className="flex flex-col items-center justify-center h-64">
                            <p className="font-semibold">This quotation is currently sealed.</p>
                            <p className="text-sm text-muted-foreground">Vendor details are masked until director presence is verified.</p>
                        </div>
                    ) : (
                    <div className="space-y-6 py-4">
                                <div className="space-y-1">
                            <h3 className="font-semibold">General Information</h3>
                                <div className="p-4 border rounded-md grid grid-cols-2 gap-4 text-sm bg-muted/50">
                                <div><span className="font-medium text-muted-foreground">Total Price:</span> <span className="font-bold text-lg">{hidePrices ? 'Hidden' : quote.totalPrice.toLocaleString() + ' ETB'}</span></div>
                                {
                                    (() => {
                                        const maxLead = Math.max(...(quote.items?.map((i:any) => Number(i.leadTimeDays) || 0) || [0]));
                                        if (quote.status === 'Accepted') {
                                            const ref = new Date(quote.updatedAt || quote.createdAt || new Date());
                                            const days = Math.max(0, differenceInCalendarDays(new Date(quote.deliveryDate), ref));
                                            return <div><span className="font-medium text-muted-foreground">Est. Delivery:</span> {days} days after acceptance</div>;
                                        }
                                        return <div><span className="font-medium text-muted-foreground">Est. Delivery:</span> Delivery time in {maxLead} days after acceptance</div>;
                                    })()
                                }
                                <div className="col-span-2"><span className="font-medium text-muted-foreground">Status:</span> <Badge variant="secondary">{quote.status.replace(/_/g, ' ')}</Badge></div>
                                {quote.notes && <div className="col-span-2"><span className="font-medium text-muted-foreground">Notes:</span> <p className="italic">"{quote.notes}"</p></div>}
                            </div>
                        </div>

                        <Separator />

                        <div className="space-y-2">
                             <h3 className="font-semibold">Quoted Items</h3>
                             <div className="space-y-4">
                                {quote.items.map(item => (
                                        <div key={item.id} className="p-4 border rounded-lg">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="flex items-center gap-3">
                                                    <p className="font-semibold">{item.name}</p>
                                                    {/* Compliance badge */}
                                                    {(() => {
                                                        const stats = complianceMap.get(item.id);
                                                        if (!stats) return <Badge variant="outline">Not Checked</Badge>;
                                                        if (stats.nonCompliant > 0) return <Badge variant="destructive">Non‑compliant</Badge>;
                                                        return <Badge variant="default">Compliant</Badge>;
                                                    })()}
                                                </div>
                                                <p className="text-xs text-muted-foreground">Qty: {item.quantity} | {quote.status === 'Accepted' ? `${Math.max(0, differenceInCalendarDays(new Date(quote.deliveryDate), new Date(quote.updatedAt || quote.createdAt || new Date())))} days after acceptance` : `Delivery time in ${item.leadTimeDays} days after acceptance`}</p>
                                            </div>
                                            <p className="font-semibold">{hidePrices ? 'Hidden' : item.unitPrice.toLocaleString() + ' ETB / unit'}</p>
                                        </div>
                                         {item.imageUrl && (
                                            <div className="relative h-40 w-full mt-2 rounded-md overflow-hidden">
                                                <Image src={item.imageUrl} alt={item.name} fill style={{objectFit:"contain"}}/>
                                            </div>
                                        )}
                                        {item.brandDetails && <p className="text-xs mt-2 text-muted-foreground border-t pt-2"><strong>Brand/Model:</strong> {item.brandDetails}</p>}
                                    </div>
                                ))}
                            </div>
                        </div>
                        
                        {(quote.answers && quote.answers.length > 0) && (
                            <>
                                <Separator />
                                <div className="space-y-2">
                                    <h3 className="font-semibold">Vendor's Answers</h3>
                                    <div className="p-4 border rounded-lg space-y-3">
                                        {quote.answers.map(answer => (
                                            <div key={answer.questionId}>
                                                <p className="font-medium text-sm">{findQuestionText(answer.questionId)}</p>
                                                <p className="text-sm text-muted-foreground pl-2 border-l-2 ml-2">{answer.answer}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                        
                        {(quote.cpoDocumentUrl || quote.experienceDocumentUrl || quote.bidDocumentUrl) && (
                             <>
                                <Separator />
                                <div className="space-y-2">
                                     <h3 className="font-semibold">Attached Documents</h3>
                                     <div className="flex gap-4 flex-wrap">
                                        {quote.bidDocumentUrl && (
                                            <a href={quote.bidDocumentUrl} target="_blank" rel="noopener noreferrer">
                                                <Button variant="outline"><FileText className="mr-2"/> Official Bid Document</Button>
                                            </a>
                                        )}
                                        {quote.cpoDocumentUrl && (
                                            <a href={quote.cpoDocumentUrl} target="_blank" rel="noopener noreferrer">
                                                <Button variant="outline"><FileText className="mr-2"/> CPO Document</Button>
                                            </a>
                                        )}
                                        {quote.experienceDocumentUrl && (
                                            <a href={quote.experienceDocumentUrl} target="_blank" rel="noopener noreferrer">
                                                <Button variant="outline"><UserCog className="mr-2"/> Experience Document</Button>
                                            </a>
                                        )}
                                     </div>
                                </div>
                            </>
                        )}
                    </div>
                    )}
                </ScrollArea>
                <DialogFooter>
                    <Button onClick={onClose} variant="outline">Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
