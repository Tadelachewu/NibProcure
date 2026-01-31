"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { formatDistanceStrict } from 'date-fns';

export default function StatusReportPage() {
    const { token } = useAuth();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [report, setReport] = useState<any>(null);
    const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('monthly');

    function periodStart(p: typeof period) {
        const now = new Date();
        if (p === 'daily') { const d = new Date(now); d.setDate(d.getDate() - 1); return d.toISOString(); }
        if (p === 'weekly') { const d = new Date(now); d.setDate(d.getDate() - 7); return d.toISOString(); }
        if (p === 'monthly') { const d = new Date(now); d.setMonth(d.getMonth() - 1); return d.toISOString(); }
        if (p === 'yearly') { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d.toISOString(); }
        return new Date(now).toISOString();
    }

    useEffect(() => {
        if (!token) return;
        setLoading(true);
        setError(null);
        setReport(null);
        const qs = `?start=${encodeURIComponent(periodStart(period))}&end=${encodeURIComponent(new Date().toISOString())}`;
        fetch(`/api/reports/status${qs}`, { headers: { Authorization: `Bearer ${token}` } })
            .then(async r => {
                if (!r.ok) {
                    const body = await r.text().catch(() => '');
                    let parsed = {};
                    try { parsed = JSON.parse(body); } catch (e) { /* not json */ }
                    throw new Error(parsed?.error || `${r.status} ${r.statusText}`);
                }
                return r.json();
            })
            .then(j => setReport(j))
            .catch(e => setError(e.message || 'Failed to load report'))
            .finally(() => setLoading(false));
    }, [token, period]);

    if (loading) return <div className="p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    if (error) return (
        <div className="p-4">
            <div className="text-destructive">Error: {error}</div>
            <div className="mt-2"><Button onClick={() => { setLoading(true); setError(null); setReport(null); }}>Retry</Button></div>
        </div>
    );

    const periodLabel = report?.period ? `${new Date(report.period.start).toLocaleDateString()} — ${new Date(report.period.end).toLocaleDateString()}` : '';

    return (
        <div className="p-4 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-semibold">Procurement Status</h1>
                    <p className="text-sm text-muted-foreground">Period: {periodLabel}</p>
                </div>
                <div className="flex gap-2 items-center">
                    <div className="flex gap-1" role="tablist" aria-label="Periods">
                        {(['daily', 'weekly', 'monthly', 'yearly'] as const).map(p => (
                            <Button key={p} variant={period === p ? 'default' : 'ghost'} onClick={() => setPeriod(p)} className={period === p ? 'font-medium' : ''}>{p[0].toUpperCase() + p.slice(1)}</Button>
                        ))}
                    </div>
                    <a href={`/api/reports/status?format=csv&start=${encodeURIComponent(report?.period?.start)}&end=${encodeURIComponent(report?.period?.end)}`}><Button>Download CSV</Button></a>
                    <Link href="/report"><Button variant="outline">Back</Button></Link>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Total Requisitions</CardTitle>
                        <CardDescription>Number of requisitions in the period</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{report?.totalRequisitions ?? '—'}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Approved</CardTitle>
                        <CardDescription>Requisitions approved in the period</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{report?.approved ?? '—'}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Rejected</CardTitle>
                        <CardDescription>Requisitions rejected in the period</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{report?.rejected ?? '—'}</div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Pending</CardTitle>
                        <CardDescription>Currently pending requisitions</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{report?.pending ?? '—'}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Converted to PO</CardTitle>
                        <CardDescription>Purchase orders created in the period</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{report?.convertedToPO ?? '—'}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Backlog Count</CardTitle>
                        <CardDescription>Requisitions older than 30 days and not final</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{report?.backlogCount ?? '—'}</div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Average Approval Time (Days)</CardTitle>
                        <CardDescription>Average days from requisition creation to approval</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-lg">{report?.averageApprovalTimeDays != null ? Number(report.averageApprovalTimeDays).toFixed(2) : '—'}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Average Time to PO (Days)</CardTitle>
                        <CardDescription>Average days from requisition creation to PO creation</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-lg">{report?.averageTimeToPODays != null ? Number(report.averageTimeToPODays).toFixed(2) : '—'}</div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Top Departments</CardTitle>
                    <CardDescription>Top departments by requisition count</CardDescription>
                </CardHeader>
                <CardContent>
                    <ul>
                        {(report?.topDepartments || []).map((d: any) => (
                            <li key={d.departmentId} className="py-1">{d.departmentName}: {d.count}</li>
                        ))}
                    </ul>
                </CardContent>
            </Card>
        </div>
    );
}
