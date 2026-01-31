"use client";

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

export default function ExceptionsPage() {
    const { token } = useAuth();
    const [loading, setLoading] = useState(false);
    const [exceptions, setExceptions] = useState<any[]>([]);
    const [periodStart, setPeriodStart] = useState(() => new Date(Date.now() - 1000 * 60 * 60 * 24 * 90).toISOString().slice(0, 10));
    const [periodEnd, setPeriodEnd] = useState(() => new Date().toISOString().slice(0, 10));
    const [selected, setSelected] = useState<any | null>(null);

    useEffect(() => { fetchData(); }, []);

    async function fetchData() {
        setLoading(true);
        try {
            const url = `/api/reports/exceptions?start=${encodeURIComponent(periodStart)}&end=${encodeURIComponent(periodEnd)}`;
            const res = await fetch(url, { headers: { Authorization: token ? `Bearer ${token}` : '' } });
            const data = await res.json();
            setExceptions(data.exceptions || []);
        } catch (err) {
            console.error('Failed to load exceptions', err);
        } finally { setLoading(false); }
    }

    async function updateStatus(e: any, status: string) {
        if (!selected) return;
        try {
            const res = await fetch('/api/reports/exceptions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' }, body: JSON.stringify({ entity: selected.entity, referenceId: selected.referenceId, status, justification: e?.reason || null }) });
            if (res.ok) {
                await fetchData();
                setSelected(null);
            }
        } catch (err) { console.error(err); }
    }

    return (
        <div className="p-4">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h1 className="text-lg font-semibold">Exceptions & Risks</h1>
                    <p className="text-sm text-muted-foreground">Detected procurement exceptions and risk events.</p>
                </div>
                <div className="flex items-center gap-2">
                    <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className="input input-sm" />
                    <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className="input input-sm" />
                    <Button onClick={fetchData}>Refresh</Button>
                    <a href={`/api/reports/exceptions?format=csv&start=${encodeURIComponent(periodStart)}&end=${encodeURIComponent(periodEnd)}`}><Button variant="ghost">Download CSV</Button></a>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Exceptions (by risk)</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {loading ? <div className="p-6"><Loader2 className="h-6 w-6 animate-spin" /></div> : (
                                <div className="space-y-2">
                                    {exceptions.length === 0 && <div className="text-sm text-muted-foreground">No exceptions detected.</div>}
                                    {exceptions.map((ex: any) => (
                                        <div key={ex.id} className="p-3 border rounded flex items-center justify-between">
                                            <div>
                                                <div className="font-medium">{ex.title} <span className="text-sm text-muted-foreground">({ex.entity})</span></div>
                                                <div className="text-sm text-muted-foreground">Dept: {ex.department} • Requester: {ex.requester}</div>
                                                <div className="text-sm">Severity: {ex.severity} • Score: {ex.riskScore}</div>
                                                <div className="text-sm">Issues: {ex.issues.map((i: any) => i.type).join(', ')}</div>
                                            </div>
                                            <div className="flex flex-col items-end gap-2">
                                                <div className="text-sm">Status: {ex.status}</div>
                                                <div className="flex gap-2">
                                                    <Button size="sm" onClick={() => setSelected(ex)}>Open</Button>
                                                    <Button size="sm" variant="ghost" onClick={() => updateStatus(null, 'escalated')}>Escalate</Button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <div>
                    <Card>
                        <CardHeader>
                            <CardTitle>Investigation</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {!selected && <div className="text-sm text-muted-foreground">Select an exception to view details and timeline.</div>}
                            {selected && (
                                <div className="space-y-3">
                                    <div className="font-medium">{selected.title}</div>
                                    <div className="text-sm">Severity: {selected.severity} • Score: {selected.riskScore}</div>
                                    <div className="text-sm">Status: {selected.status}</div>
                                    <div className="text-sm">Justification: {selected.justification || '—'}</div>
                                    <div className="mt-2 text-sm font-semibold">Timeline</div>
                                    <div className="max-h-64 overflow-auto space-y-2 mt-2">
                                        {selected.timeline?.length ? selected.timeline.map((t: any) => (
                                            <div key={t.id} className="p-2 border rounded">
                                                <div className="text-xs text-muted-foreground">{new Date(t.timestamp).toLocaleString()} — {t.user || 'System'}</div>
                                                <div className="text-sm">{t.action}</div>
                                                {t.details && <div className="text-sm text-muted-foreground">{t.details}</div>}
                                            </div>
                                        )) : <div className="text-sm text-muted-foreground">No timeline entries</div>}
                                    </div>

                                    <div className="flex gap-2 mt-3">
                                        <Button onClick={() => updateStatus({ reason: 'Reviewed - resolved' }, 'resolved')}>Mark Resolved</Button>
                                        <Button variant="ghost" onClick={() => updateStatus({ reason: 'Escalating to committee' }, 'escalated')}>Escalate</Button>
                                        <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
