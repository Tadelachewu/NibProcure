"use client";

import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { ScrollArea } from './ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { PurchaseRequisition, Quotation } from '@/lib/types';
import { BestItemAwardDialog } from './best-item-award-dialog';

export const ChangeAwardDialog = ({
    requisition,
    quotations,
    isOpen,
    onClose
}: {
    requisition: PurchaseRequisition;
    quotations: Quotation[];
    isOpen: boolean;
    onClose: () => void;
}) => {
    const { toast } = useToast();
    const { token } = useAuth();
    const [minuteFile, setMinuteFile] = useState<File | null>(null);
    const [minuteJustification, setMinuteJustification] = useState('');
    const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
    const [perItemSelections, setPerItemSelections] = useState<Record<string, string>>({});
    const awardStrategy = (requisition.rfqSettings as any)?.awardStrategy || 'all';

    const eligibleQuotes = useMemo(() => {
        const declined = new Set(quotations.filter(q => q.status === 'Declined').map(q => q.vendorId));
        return quotations.filter(q => !declined.has(q.vendorId));
    }, [quotations]);

    const handleConfirm = async () => {
        if (!minuteFile) return toast({ variant: 'destructive', title: 'Minute Required', description: 'Please upload a minute document.' });
        if (!minuteJustification.trim()) return toast({ variant: 'destructive', title: 'Justification Required' });

        // upload minute
        let minuteDocumentUrl: string | undefined;
        try {
            const form = new FormData();
            form.append('file', minuteFile);
            form.append('directory', 'minutes');
            const r = await fetch('/api/upload', { method: 'POST', body: form });
            const json = await r.json();
            if (!r.ok) throw new Error(json.error || 'Upload failed');
            minuteDocumentUrl = json.path;
        } catch (err) {
            return toast({ variant: 'destructive', title: 'Upload Failed', description: err instanceof Error ? err.message : 'Upload failed' });
        }

        // Build awards payload
        let awards: any = {};
        if (awardStrategy === 'all') {
            const vendorId = selectedVendorId || (eligibleQuotes[0] && eligibleQuotes[0].vendorId);
            if (!vendorId) return toast({ variant: 'destructive', title: 'No Vendor Selected' });
            awards[vendorId] = { vendorName: eligibleQuotes.find(q => q.vendorId === vendorId)?.vendorName, items: [] };
        } else {
            // per item: map requisition.items -> selected quote item id via perItemSelections
            requisition.items.forEach(item => {
                const selectedQuoteItemId = perItemSelections[item.id];
                if (selectedQuoteItemId) {
                    awards[item.id] = { rankedBids: [{ quoteItemId: selectedQuoteItemId }] };
                }
            });
        }

        if (!token) return toast({ variant: 'destructive', title: 'Unauthorized', description: 'You must be signed in to perform this action.' });
        try {
            const resp = await fetch(`/api/requisitions/${requisition.id}/finalize-scores`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    awardStrategy,
                    awards,
                    minuteDocumentUrl,
                    minuteJustification
                })
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || data.details || 'Failed to apply change');
            toast({ title: 'Award Changed', description: 'Award change applied and routed for approval.' });
            onClose();
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: error instanceof Error ? error.message : 'An unknown error occurred' });
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Change Award</DialogTitle>
                    <DialogDescription>Choose which vendor(s) should receive the award and confirm with an official minute.</DialogDescription>
                </DialogHeader>
                <ScrollArea className="flex-1 -mx-6 px-6 py-4">
                    {awardStrategy === 'all' ? (
                        <div className="space-y-4">
                            <Label>Choose Vendor</Label>
                            <div className="space-y-2">
                                {eligibleQuotes.map(q => (
                                    <div key={q.id} className="p-3 border rounded flex items-center gap-3">
                                        <input type="radio" name="vendor" value={q.vendorId} checked={selectedVendorId === q.vendorId} onChange={() => setSelectedVendorId(q.vendorId)} />
                                        <div>
                                            <div className="font-medium">{q.vendorName}</div>
                                            <div className="text-xs text-muted-foreground">Total: {q.totalPrice?.toLocaleString?.() || q.totalPrice} ETB</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <Label>Per-Item Selections</Label>
                            {requisition.items.map(item => (
                                <div key={item.id} className="p-3 border rounded space-y-2">
                                    <div className="font-medium">{item.name}</div>
                                    <select value={perItemSelections[item.id] || ''} onChange={(e) => setPerItemSelections(prev => ({ ...prev, [item.id]: e.target.value }))} className="w-full p-2 border rounded">
                                        <option value="">-- choose a bid --</option>
                                        {quotations.flatMap(q => q.items.filter(i => i.requisitionItemId === item.id).map(i => ({ q, i }))).map(({ q, i }) => (
                                            <option key={i.id} value={i.id}>{q.vendorName} — {i.unitPrice} ETB</option>
                                        ))}
                                    </select>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="mt-4 p-4 border rounded space-y-2">
                        <Label>Minute Justification</Label>
                        <Textarea value={minuteJustification} onChange={e => setMinuteJustification(e.target.value)} />
                        <Label>Official Minute (PDF)</Label>
                        <Input type="file" accept=".pdf" onChange={e => setMinuteFile(e.target.files?.[0] || null)} />
                    </div>
                </ScrollArea>
                <DialogFooter>
                    <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                    <Button onClick={handleConfirm}>Apply Change &amp; Route</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
