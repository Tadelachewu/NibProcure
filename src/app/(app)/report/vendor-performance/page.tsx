"use client";

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

export default function VendorPerformancePage() {
    const { token } = useAuth();
    const [loading, setLoading] = useState(false);
    const [vendors, setVendors] = useState<any[]>([]);
    const [metric, setMetric] = useState('performanceScore');
    const [sortDesc, setSortDesc] = useState(true);
    function formatDate(d: Date) { return d.toISOString().slice(0, 10); }
    const defaultEnd = formatDate(new Date());
    const defaultStart = formatDate(new Date(Date.now() - 1000 * 60 * 60 * 24 * 30));
    const [periodStart, setPeriodStart] = useState(defaultStart);
    const [periodEnd, setPeriodEnd] = useState(defaultEnd);

    useEffect(() => { fetchData(); }, []);

    async function fetchData() {
        setLoading(true);
        try {
            const qs = [];
            if (periodStart) qs.push(`start=${encodeURIComponent(periodStart)}`);
            if (periodEnd) qs.push(`end=${encodeURIComponent(periodEnd)}`);
            const url = `/api/reports/vendor-performance${qs.length ? ('?' + qs.join('&')) : ''}`;
            const res = await fetch(url, { headers: { Authorization: token ? `Bearer ${token}` : '' } });
            const data = await res.json();
            const vs = data.vendors || [];
            setVendors(applySortAndRank(vs, metric, sortDesc));
        } catch (err) {
            console.error('Failed to load vendor performance', err);
        } finally { setLoading(false); }
    }

    function getMetricValue(v: any, m: string) {
        if (!v) return 0;
        switch (m) {
            case 'totalSpend': return Number(v.totalSpend ?? 0);
            case 'poCount': return Number(v.poCount ?? 0);
            case 'averagePoValue': return Number(v.averagePoValue ?? 0);
            case 'quotationCount': return Number(v.quotationCount ?? 0);
            case 'averageQuotationScore': return Number(v.averageQuotationScore ?? 0);
            case 'onTimeDeliveryPercent': return Number(v.onTimeDeliveryPercent ?? 0);
            case 'performanceScore': return Number(v.performanceScore ?? 0);
            case 'vendorRank': return Number(v.vendorRank ?? 0);
            default: return 0;
        }
    }

    function applySortAndRank(items: any[], m: string, desc: boolean) {
        const copy = [...items];
        copy.sort((a, b) => {
            const va = getMetricValue(a, m);
            const vb = getMetricValue(b, m);
            if (va === vb) return 0;
            return desc ? (vb - va) : (va - vb);
        });
        return copy.map((it, idx) => ({ ...it, vendorRank: idx + 1 }));
    }

    function onMetricChange(next: string) {
        setMetric(next);
        setVendors(prev => applySortAndRank(prev, next, sortDesc));
    }

    function toggleSortOrder() {
        setSortDesc(prev => {
            const next = !prev;
            setVendors(prevV => applySortAndRank(prevV, metric, next));
            return next;
        });
    }

    return (
        <div className="p-4">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h1 className="text-lg font-semibold">Vendor Performance</h1>
                    <p className="text-sm text-muted-foreground">Vendor spend, PO counts, quotation scores and delivery metrics.</p>
                </div>
                <div className="flex items-center gap-2">
                    <label className="text-sm">Start:</label>
                    <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className="input input-sm" />
                    <label className="text-sm">End:</label>
                    <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className="input input-sm" />
                    <label className="text-sm">Metric:</label>
                    <select value={metric} onChange={e => onMetricChange(e.target.value)} className="input input-sm">
                        <option value="performanceScore">Performance Score</option>
                        <option value="totalSpend">Total Spend</option>
                        <option value="poCount">PO Count</option>
                        <option value="averagePoValue">Average PO Value</option>
                        <option value="quotationCount">Quotation Count</option>
                        <option value="averageQuotationScore">Avg Quotation Score</option>
                        <option value="onTimeDeliveryPercent">On-Time Delivery %</option>
                        <option value="vendorRank">Vendor Rank</option>
                    </select>
                    <Button onClick={toggleSortOrder}>{sortDesc ? 'Desc' : 'Asc'}</Button>
                    <Button onClick={fetchData}>Refresh</Button>
                    <a href={`/api/reports/vendor-performance?format=csv${periodStart ? `&start=${encodeURIComponent(periodStart)}` : ''}${periodEnd ? `&end=${encodeURIComponent(periodEnd)}` : ''}${metric ? `&sort=${encodeURIComponent(metric)}` : ''}${sortDesc ? `&order=desc` : `&order=asc`}`}><Button variant="ghost">Download CSV</Button></a>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Vendors</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? <div className="p-6"><Loader2 className="h-6 w-6 animate-spin" /></div> : (
                        <div className="overflow-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left">
                                        <th className="px-2 py-2">Rank</th>
                                        <th className="px-2 py-2">Vendor ID</th>
                                        <th className="px-2 py-2">Vendor Name</th>
                                        <th className="px-2 py-2">Total Spend</th>
                                        <th className="px-2 py-2">PO Count</th>
                                        <th className="px-2 py-2">Avg PO Value</th>
                                        <th className="px-2 py-2">Quotation Count</th>
                                        <th className="px-2 py-2">Avg Quotation Score</th>
                                        <th className="px-2 py-2">On-Time %</th>
                                        <th className="px-2 py-2">Performance Score</th>
                                        <th className="px-2 py-2">Blacklisted</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {vendors.map(v => (
                                        <tr key={v.vendorId} className="border-t">
                                            <td className="px-2 py-2">{v.vendorRank}</td>
                                            <td className="px-2 py-2">{v.vendorId}</td>
                                            <td className="px-2 py-2">{v.vendorName}</td>
                                            <td className="px-2 py-2">{v.totalSpend?.toFixed ? v.totalSpend.toFixed(2) : v.totalSpend}</td>
                                            <td className="px-2 py-2">{v.poCount}</td>
                                            <td className="px-2 py-2">{v.averagePoValue ? Number(v.averagePoValue).toFixed(2) : '—'}</td>
                                            <td className="px-2 py-2">{v.quotationCount}</td>
                                            <td className="px-2 py-2">{v.averageQuotationScore != null ? Number(v.averageQuotationScore).toFixed(2) : '—'}</td>
                                            <td className="px-2 py-2">{v.onTimeDeliveryPercent != null ? Number(v.onTimeDeliveryPercent).toFixed(1) + '%' : '—'}</td>
                                            <td className="px-2 py-2">{v.performanceScore != null ? Number(v.performanceScore).toFixed(2) : '—'}</td>
                                            <td className="px-2 py-2">{v.blacklist && (v.blacklist.blacklisted === true || v.blacklist.status === 'blacklisted') ? 'Yes' : 'No'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
