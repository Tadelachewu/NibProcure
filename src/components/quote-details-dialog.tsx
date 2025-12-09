
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
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import { Badge } from './ui/badge';
import { FileText } from 'lucide-react';
import Image from 'next/image';

interface QuoteDetailsDialogProps {
    quote: Quotation;
    requisition: PurchaseRequisition;
    isOpen: boolean;
    onClose: () => void;
}

export function QuoteDetailsDialog({ quote, requisition, isOpen, onClose }: QuoteDetailsDialogProps) {
    if (!quote || !requisition) return null;

    const findQuestionText = (questionId: string) => {
        return requisition.customQuestions?.find(q => q.id === questionId)?.questionText || "Unknown Question";
    }

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
                    <div className="space-y-6 py-4">
                        <div className="space-y-1">
                            <h3 className="font-semibold">General Information</h3>
                            <div className="p-4 border rounded-md grid grid-cols-2 gap-4 text-sm bg-muted/50">
                                <div><span className="font-medium text-muted-foreground">Total Price:</span> <span className="font-bold text-lg">{quote.totalPrice.toLocaleString()} ETB</span></div>
                                <div><span className="font-medium text-muted-foreground">Est. Delivery:</span> {new Date(quote.deliveryDate).toLocaleDateString()}</div>
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
                                        <div className="flex justify-between">
                                            <div>
                                                <p className="font-semibold">{item.name}</p>
                                                <p className="text-xs text-muted-foreground">Qty: {item.quantity} | Lead Time: {item.leadTimeDays} days</p>
                                            </div>
                                            <p className="font-semibold">{item.unitPrice.toLocaleString()} ETB / unit</p>
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
                        
                        {(quote.cpoDocumentUrl || quote.experienceDocumentUrl) && (
                             <>
                                <Separator />
                                <div className="space-y-2">
                                     <h3 className="font-semibold">Attached Documents</h3>
                                     <div className="flex gap-4">
                                        {quote.cpoDocumentUrl && (
                                            <a href={quote.cpoDocumentUrl} target="_blank" rel="noopener noreferrer">
                                                <Button variant="outline"><FileText className="mr-2"/> CPO Document</Button>
                                            </a>
                                        )}
                                        {quote.experienceDocumentUrl && (
                                            <a href={quote.experienceDocumentUrl} target="_blank" rel="noopener noreferrer">
                                                <Button variant="outline"><FileText className="mr-2"/> Experience Document</Button>
                                            </a>
                                        )}
                                     </div>
                                </div>
                            </>
                        )}
                    </div>
                </ScrollArea>
                <DialogFooter>
                    <Button onClick={onClose} variant="outline">Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

