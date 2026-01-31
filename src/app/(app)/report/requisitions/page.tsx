"use client";

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export default function ReportRequisitionsPage() {
    const { token } = useAuth();
    const [loading, setLoading] = useState(false);
    const [requisitions, setRequisitions] = useState<any[]>([]);
    const [selected, setSelected] = useState<any | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    useEffect(() => {
        fetchList();
    }, []);

    async function fetchList() {
        setLoading(true);
        try {
            const res = await fetch('/api/requisitions?limit=50', { headers: { Authorization: token ? `Bearer ${token}` : '' } });
            const data = await res.json();
            setRequisitions(data.requisitions || []);
        } catch (err) {
            console.error('Failed to fetch requisitions', err);
        } finally { setLoading(false); }
    }

    async function openDetail(id: string) {
        setDetailLoading(true);
        setSelected(null);
        try {
            const res = await fetch(`/api/requisitions/${id}/location`, { headers: { Authorization: token ? `Bearer ${token}` : '' } });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err?.error || 'Failed to load');
            }
            const d = await res.json();
            setSelected(d);
        } catch (e) {
            console.error(e);
            setSelected({ error: (e as Error).message });
        } finally { setDetailLoading(false); }
    }

    return (
        <div className="p-4">
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-lg font-semibold">Requisitions</h1>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>All Requisitions (latest)</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {loading ? <div className="p-6"><Loader2 className="h-6 w-6 animate-spin" /></div> : (
                                <div className="space-y-2">
                                    {requisitions.length === 0 && <div className="text-sm text-muted-foreground">No requisitions found.</div>}
                                    {requisitions.map(r => (
                                        <div key={r.id} className="p-3 border rounded flex items-center justify-between">
                                            <div>
                                                <div className="font-medium">{r.title}</div>
                                                <div className="text-sm text-muted-foreground">{r.requesterName || r.requester?.name} • {r.department}</div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="text-sm text-muted-foreground">{r.status}</div>
                                                <Button size="sm" onClick={() => openDetail(r.id)}>View Timeline</Button>
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
                            <CardTitle>Timeline</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {detailLoading && <div className="p-4"><Loader2 className="h-6 w-6 animate-spin" /></div>}
                            {!selected && !detailLoading && <div className="text-sm text-muted-foreground">Select a requisition to view its timeline.</div>}
                            {selected?.error && <div className="text-sm text-destructive">{selected.error}</div>}
                            {selected?.requisition && (
                                <div className="space-y-3">
                                    <div className="font-medium">{selected.requisition.title} <span className="text-sm text-muted-foreground">({selected.requisition.status})</span></div>
                                    <div className="text-sm">Department: {selected.requisition.department || 'N/A'}</div>
                                    <div className="text-sm">Requester: {selected.requisition.requester?.name || 'N/A'}</div>
                                    <div className="text-sm">Next: {selected.nextAction?.message} — <em>{selected.nextAction?.responsible}</em></div>

                                    <div className="mt-2">
                                        <div className="text-sm font-semibold">Committee</div>
                                        {selected.committeeAssignments?.length ? selected.committeeAssignments.map((c: any) => (
                                            <div key={c.user.id} className="text-sm">{c.user.name}</div>
                                        )) : <div className="text-sm text-muted-foreground">No committee assignments</div>}
                                    </div>

                                    <div className="mt-2">
                                        <div className="text-sm font-semibold">Timeline</div>
                                        <div className="space-y-2 max-h-64 overflow-auto mt-2">
                                            {selected.timeline?.length ? selected.timeline.map((t: any) => (
                                                <div key={t.id} className="p-2 border rounded">
                                                    <div className="text-xs text-muted-foreground">{new Date(t.timestamp).toLocaleString()} — {t.user?.name || 'System'}</div>
                                                    <div className="text-sm">{t.action}</div>
                                                    {t.details && <div className="text-sm text-muted-foreground">{t.details}</div>}
                                                </div>
                                            )) : <div className="text-sm text-muted-foreground">No timeline entries</div>}
                                        </div>
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
