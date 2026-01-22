"use client";

import React from 'react';
import { PurchaseRequisition, Quotation } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { cn } from '@/lib/utils';
import { AlertCircle, Calculator } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';

function formatCurrency(n?: number) {
    if (n == null || Number.isNaN(n)) return '—';
    return `${n.toLocaleString()} ETB`;
}

export function AwardCalculationDetails({ requisition, quotations }: { requisition: PurchaseRequisition; quotations: Quotation[] }) {
    const nonCompliantQuoteItemIds = React.useMemo(() => {
        const ids: string[] = [];
        quotations.forEach(q => {
            (q as any).complianceSets?.forEach((cs: any) => {
                cs.itemCompliances?.forEach((ic: any) => {
                    if (ic.comply === false && ic.quoteItemId) ids.push(ic.quoteItemId);
                });
            });
        });
        return new Set(ids);
    }, [quotations]);

    const singleVendorResults = React.useMemo(() => {
        const compliantReqItems = requisition.items;
        const results = quotations.map(q => {
            let total = 0;
            let missing = false;
            for (const reqItem of compliantReqItems) {
                const proposals = q.items?.filter(it => it.requisitionItemId === reqItem.id) || [];
                const compliantProposals = proposals.filter(p => !nonCompliantQuoteItemIds.has(p.id));
                if (compliantProposals.length === 0) { missing = true; break; }
                const lowest = compliantProposals.reduce((min, p) => (p.unitPrice < min ? p.unitPrice : min), Number.POSITIVE_INFINITY as number);
                total += (lowest === Number.POSITIVE_INFINITY ? 0 : lowest * (reqItem.quantity || 1));
            }
            if (missing) return null;
            return { vendorId: q.vendorId, vendorName: q.vendorName, totalPrice: total } as any;
        }).filter(Boolean) as any[];
        results.sort((a, b) => (a.totalPrice ?? 0) - (b.totalPrice ?? 0));
        results.forEach((r, i) => (r.rank = i + 1));
        return results;
    }, [requisition, quotations, nonCompliantQuoteItemIds]);

    const bestItemResults = React.useMemo(() => {
        return requisition.items.map(reqItem => {
            const bids = quotations.flatMap(q => q.items
                .filter(it => it.requisitionItemId === reqItem.id && !nonCompliantQuoteItemIds.has(it.id))
                .map(it => ({ vendorName: q.vendorName, quoteItemId: it.id, proposedItemName: it.name, unitPrice: it.unitPrice, totalPrice: (it.unitPrice || 0) * (reqItem.quantity || 1) })));
            bids.sort((a, b) => (a.unitPrice ?? Infinity) - (b.unitPrice ?? Infinity));
            return { itemName: reqItem.name, bids, winner: bids[0] };
        });
    }, [requisition.items, quotations, nonCompliantQuoteItemIds]);

    const rankingEntries = React.useMemo(() => {
        const entries: any[] = [];
        if (singleVendorResults.length > 0) entries.push({ role: 'Winner', vendor: singleVendorResults[0] });
        if (singleVendorResults.length > 1) entries.push({ role: 'Standby', vendor: singleVendorResults[1] });
        if (singleVendorResults.length > 2) entries.push({ role: 'Standby', vendor: singleVendorResults[2] });

        return entries.map(e => {
            const v = e.vendor;
            const q = quotations.find(x => x.vendorId === v.vendorId);
            const vendorSelected = requisition.items.map(reqItem => {
                const proposals = (q?.items || []).filter(it => it.requisitionItemId === reqItem.id && !nonCompliantQuoteItemIds.has(it.id));
                const selected = proposals.length ? proposals.reduce((min, p) => p.unitPrice < min.unitPrice ? p : min, proposals[0]) : null;
                return { reqItem, selected };
            });
            const computedTotal = vendorSelected.reduce((sum, s) => sum + ((s.selected?.unitPrice ?? 0) * (s.selected?.quantity ?? 1)), 0);
            return { role: e.role, vendor: v, vendorQuotation: q, vendorSelected, computedTotal };
        });
    }, [singleVendorResults, quotations, requisition.items, nonCompliantQuoteItemIds]);

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Calculator /> Award Calculation Details</CardTitle>
                    <CardDescription>
                        A transparent breakdown of how the award was calculated for requisition: <span className="font-semibold">{requisition.title}</span>.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Award Strategy Used: Price-based</AlertTitle>
                        <AlertDescription>This report shows price-based calculations (least-price wins).</AlertDescription>
                    </Alert>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Strategy 1: Award All to Single Vendor</CardTitle>
                    <CardDescription>Summed lowest vendor bids across requisition items. Lowest total price wins.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Accordion type="single" collapsible className="space-y-2">
                        {singleVendorResults.map((v: any) => (
                            <AccordionItem value={v.vendorId} key={v.vendorId}>
                                <AccordionTrigger className="flex justify-between items-center px-4">
                                    <div className="flex items-center gap-4">
                                        <span className="font-bold">#{v.rank}</span>
                                        <span className="font-medium">{v.vendorName}</span>
                                    </div>
                                    <div className="text-right font-mono">{formatCurrency(v.totalPrice)}</div>
                                </AccordionTrigger>
                                <AccordionContent className="pt-4">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Item</TableHead>
                                                <TableHead>Selected Proposal</TableHead>
                                                <TableHead className="text-right">Unit Price</TableHead>
                                                <TableHead className="text-right">Qty</TableHead>
                                                <TableHead className="text-right">Total</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {requisition.items.map(reqItem => {
                                                const proposals = (quotations.find(q => q.vendorId === v.vendorId)?.items || []).filter(it => it.requisitionItemId === reqItem.id && !nonCompliantQuoteItemIds.has(it.id));
                                                const selected = proposals.length ? proposals.reduce((min, p) => p.unitPrice < min.unitPrice ? p : min, proposals[0]) : null;
                                                const unit = selected?.unitPrice ?? null;
                                                const qty = reqItem.quantity ?? 1;
                                                const total = unit != null ? unit * qty : null;
                                                return (
                                                    <TableRow key={reqItem.id}>
                                                        <TableCell className="font-medium">{reqItem.name}</TableCell>
                                                        <TableCell>{selected?.name || 'N/A'}</TableCell>
                                                        <TableCell className="text-right font-mono">{unit != null ? `${unit.toFixed(2)} ETB` : 'N/A'}</TableCell>
                                                        <TableCell className="text-right">{qty}</TableCell>
                                                        <TableCell className="text-right font-mono">{total != null ? `${total.toLocaleString()} ETB` : 'N/A'}</TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Ranking Summary</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="mb-4">Vendors are ranked by the lowest total price. The winner receives the award, and the next two are put on standby.</p>

                    <Accordion type="single" collapsible className="space-y-2">
                        {rankingEntries.map((entry: any) => {
                            const v = entry.vendor;
                            return (
                                <AccordionItem value={v.vendorId} key={v.vendorId}>
                                    <AccordionTrigger className="flex justify-between items-center px-4">
                                        <div className="flex items-center gap-4">
                                            <span className="font-bold">{entry.role}</span>
                                            <span className="font-medium">{v.vendorName}</span>
                                        </div>
                                        <div className="text-right font-mono">{formatCurrency(v.totalPrice)}</div>
                                    </AccordionTrigger>
                                    <AccordionContent className="pt-4 space-y-4">
                                        <div>
                                            <h5 className="font-semibold">Compliance Checks</h5>
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Item</TableHead>
                                                        <TableHead>Status</TableHead>
                                                        <TableHead>Notes</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {requisition.items.map(item => {
                                                        const vendorHasCompliant = (entry.vendorQuotation?.items || []).some((it: any) => it.requisitionItemId === item.id && !nonCompliantQuoteItemIds.has(it.id));
                                                        return (
                                                            <TableRow key={item.id}>
                                                                <TableCell>{item.name}</TableCell>
                                                                <TableCell>
                                                                    {vendorHasCompliant ? (
                                                                        <span className="inline-block bg-green-100 text-green-800 px-2 py-0.5 rounded">Compliant</span>
                                                                    ) : (
                                                                        <span className="inline-block bg-red-100 text-red-800 px-2 py-0.5 rounded">Non-compliant</span>
                                                                    )}
                                                                </TableCell>
                                                                <TableCell>{vendorHasCompliant ? 'Has at least one compliant proposal' : 'No compliant proposals for this item'}</TableCell>
                                                            </TableRow>
                                                        );
                                                    })}
                                                </TableBody>
                                            </Table>
                                        </div>

                                        <div>
                                            <h5 className="font-semibold">Least-priced algorithm (how total was computed)</h5>
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Item</TableHead>
                                                        <TableHead>Selected Proposal (this vendor)</TableHead>
                                                        <TableHead className="text-right">Unit Price</TableHead>
                                                        <TableHead className="text-right">Qty</TableHead>
                                                        <TableHead className="text-right">Line Total</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {entry.vendorSelected.map((vs: any) => (
                                                        <TableRow key={vs.reqItem.id}>
                                                            <TableCell>{vs.reqItem.name}</TableCell>
                                                            <TableCell>{vs.selected?.name || 'No proposal'}</TableCell>
                                                            <TableCell className="text-right font-mono">{vs.selected ? `${vs.selected.unitPrice.toFixed(2)} ETB` : '—'}</TableCell>
                                                            <TableCell className="text-right">{vs.selected ? vs.selected.quantity ?? 1 : '—'}</TableCell>
                                                            <TableCell className="text-right font-mono">{vs.selected ? `${((vs.selected.unitPrice ?? 0) * (vs.selected.quantity ?? 1)).toLocaleString()} ETB` : '—'}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                    <TableRow>
                                                        <TableCell colSpan={4} className="font-bold text-right">Computed Total</TableCell>
                                                        <TableCell className="text-right font-mono font-bold">{formatCurrency(entry.computedTotal)}</TableCell>
                                                    </TableRow>
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            );
                        })}
                    </Accordion>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Strategy 2: Best Offer (Per Item)</CardTitle>
                    <CardDescription>For each item, the vendor with the lowest unit price is the winner.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Accordion type="multiple" className="space-y-4">
                        {bestItemResults.map((item: any) => (
                            <AccordionItem value={item.itemName} key={item.itemName}>
                                <AccordionTrigger className="font-semibold bg-muted/50 px-4 rounded-md">
                                    {item.itemName} → Winner: {item.winner?.vendorName || 'N/A'} ({item.winner ? `${item.winner.unitPrice.toFixed(2)} ETB` : 'N/A'})
                                </AccordionTrigger>
                                <AccordionContent className="pt-4">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Rank</TableHead>
                                                <TableHead>Vendor</TableHead>
                                                <TableHead>Proposed Item</TableHead>
                                                <TableHead className="text-right">Unit Price</TableHead>
                                                <TableHead className="text-right">Total</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {item.bids.map((bid: any, index: number) => (
                                                <TableRow key={bid.vendorName + bid.proposedItemName} className={cn(index === 0 && 'bg-green-500/10')}>
                                                    <TableCell className="font-bold">{index + 1}</TableCell>
                                                    <TableCell>{bid.vendorName}</TableCell>
                                                    <TableCell>{bid.proposedItemName}</TableCell>
                                                    <TableCell className="text-right font-mono">{bid.unitPrice.toFixed(2)} ETB</TableCell>
                                                    <TableCell className="text-right font-mono">{bid.totalPrice.toLocaleString()} ETB</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </CardContent>
            </Card>

        </div>
    );
}
