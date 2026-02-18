"use client";

import React, { useEffect, useState } from 'react';
import { generateAI } from '@/lib/ollama-client';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, Database, Eye, EyeOff, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function AIPromptPage() {
    const { token, user, role } = useAuth();
    const { toast } = useToast();
    const [requisitionId, setRequisitionId] = useState('');
    const [type, setType] = useState<'minutes' | 'report' | 'advice'>('minutes');
    const [prompt, setPrompt] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState('');
    const [systemPrompt, setSystemPrompt] = useState('');
    const [systemLoading, setSystemLoading] = useState(false);
    const [systemResult, setSystemResult] = useState('');
    const [requisitions, setRequisitions] = useState<Array<{ id: string; title: string }>>([]);
    const [scope, setScope] = useState<'specific' | 'system'>('specific');
    const [refreshing, setRefreshing] = useState(false);
    const [testDataPreview, setTestDataPreview] = useState<any[] | null>(null);
    const [showPreview, setShowPreview] = useState(false);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const res = await fetch('/api/requisitions?limit=100', { 
                    headers: token ? { Authorization: `Bearer ${token}` } : undefined 
                });
                if (!res.ok) return;
                const data = await res.json();
                const items = Array.isArray(data.requisitions) ? data.requisitions : data;
                if (!mounted) return;
                setRequisitions(items.map((r: any) => ({ id: r.id, title: r.title || r.requesterName || r.id })));
            } catch (err) {
                // ignore
            }
        })();
        return () => { mounted = false; };
    }, [token]);

    const handleRefreshSummary = async () => {
        if (!token) return;
        setRefreshing(true);
        setTestDataPreview(null);
        try {
            // 1. Trigger Refresh
            const res = await fetch('/api/reports/refresh-summary', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Failed to refresh system data');
            }

            // 2. Fetch Full Data for Test Preview
            const dataRes = await fetch('/api/ollama-systemwide-requisitions', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (dataRes.ok) {
                const raw = await dataRes.json();
                setTestDataPreview(raw.requisitions || []);
                setShowPreview(true);
            }
            
            toast({ 
                title: 'AI Data Synced', 
                description: `Materialized view refreshed with ${Array.isArray(testDataPreview) ? testDataPreview.length : 'latest'} records.` 
            });
        } catch (err: any) {
            toast({ 
                variant: 'destructive', 
                title: 'Sync Failed', 
                description: err.message || 'An error occurred while refreshing data.' 
            });
        } finally {
            setRefreshing(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setResult('');
        try {
            const res = await generateAI(type, requisitionId, { prompt: prompt || undefined });
            const sanitize = (s: string) => s ? s.replace(/[\*\+\[\]\{\}\<\>\`\|\\]/g, '').replace(/\r\n|\r/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/ {2,}/g, ' ') : '';
            setResult(sanitize(res || ''));
        } catch (err: any) {
            setResult('Error: ' + (err?.message || String(err)));
        } finally {
            setLoading(false);
        }
    };

    const canSync = role === 'Admin' || role === 'Procurement_Officer';

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">AI Assistant</h1>
                    <p className="text-muted-foreground mt-1">Generate minutes, reports, and perform system-wide analysis using Ollama.</p>
                </div>
                {canSync && (
                    <div className="flex gap-2">
                        <Button 
                            onClick={handleRefreshSummary} 
                            disabled={refreshing} 
                            variant="default"
                            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-sm"
                        >
                            {refreshing ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <RefreshCw className="mr-2 h-4 w-4" />
                            )}
                            Sync AI Data
                        </Button>
                        {testDataPreview && (
                            <Button variant="outline" onClick={() => setShowPreview(!showPreview)}>
                                {showPreview ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                                {showPreview ? 'Hide Preview' : 'Show Preview'}
                            </Button>
                        )}
                    </div>
                )}
            </div>

            {/* Test Mode Preview - Full Data Display */}
            {testDataPreview && showPreview && (
                <Card className="border-blue-200 bg-blue-50/30 overflow-hidden">
                    <CardHeader className="py-3 px-4 border-b border-blue-100 bg-blue-100/50">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-blue-800">
                                <Database className="h-4 w-4" />
                                Materialized View Preview (Full System Context)
                            </CardTitle>
                            <Badge variant="secondary" className="bg-blue-200 text-blue-800 border-0">
                                {testDataPreview.length} Records Loaded
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <ScrollArea className="h-64">
                            <pre className="p-4 text-[10px] font-mono leading-tight">
                                {JSON.stringify(testDataPreview, null, 2)}
                            </pre>
                        </ScrollArea>
                    </CardContent>
                </Card>
            )}

            <div className="flex flex-col lg:flex-row gap-6">
                <div className="w-full lg:w-1/3 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Configuration</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <label className="text-sm font-medium">Scope</label>
                                <div className="mt-2 flex gap-3">
                                    <button 
                                        onClick={() => setScope('specific')}
                                        className={cn(
                                            "flex-1 px-3 py-2 text-sm rounded-md border transition-all",
                                            scope === 'specific' ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-background border-input hover:bg-muted"
                                        )}
                                    >
                                        Requisition
                                    </button>
                                    <button 
                                        onClick={() => setScope('system')}
                                        className={cn(
                                            "flex-1 px-3 py-2 text-sm rounded-md border transition-all",
                                            scope === 'system' ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-background border-input hover:bg-muted"
                                        )}
                                    >
                                        System-wide
                                    </button>
                                </div>
                            </div>

                            {scope === 'specific' ? (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium mb-1">Requisition</label>
                                        <select 
                                            value={requisitionId} 
                                            onChange={e => setRequisitionId(e.target.value)} 
                                            className="w-full border rounded-md px-3 py-2 bg-background focus:ring-2 focus:ring-primary/20"
                                        >
                                            <option value="">-- Select --</option>
                                            {requisitions.map(r => (
                                                <option key={r.id} value={r.id}>{r.title} ({r.id})</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-1">Type</label>
                                        <select 
                                            value={type} 
                                            onChange={e => setType(e.target.value as any)} 
                                            className="w-full border rounded-md px-3 py-2 bg-background focus:ring-2 focus:ring-primary/20"
                                        >
                                            <option value="minutes">Minutes</option>
                                            <option value="report">Audit Report</option>
                                            <option value="advice">Decision Advice</option>
                                        </select>
                                    </div>
                                </>
                            ) : (
                                <div className="p-3 bg-muted/50 rounded-md border border-dashed text-xs text-muted-foreground leading-relaxed">
                                    <p>System-wide mode uses the high-performance materialized view to scan all requisitions simultaneously.</p>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium mb-1">Your Question / Prompt</label>
                                <Textarea 
                                    value={scope === 'system' ? systemPrompt : prompt} 
                                    onChange={e => scope === 'system' ? setSystemPrompt(e.target.value) : setPrompt(e.target.value)} 
                                    rows={4} 
                                    placeholder={scope === 'system' ? "e.g. Which requisitions are high value and have no quotes yet?" : "Add custom instructions..."}
                                />
                            </div>

                            <Button 
                                className="w-full" 
                                disabled={scope === 'system' ? (systemLoading || !systemPrompt.trim()) : (loading || !requisitionId)}
                                onClick={async () => {
                                    if (scope === 'system') {
                                        setSystemLoading(true);
                                        setSystemResult('');
                                        try {
                                            const res = await fetch('/api/ollama-systemwide-requisitions', { 
                                                method: 'POST', 
                                                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, 
                                                body: JSON.stringify({ prompt: systemPrompt }) 
                                            });
                                            const data = await res.json();
                                            if (!res.ok) throw new Error(data.error || 'AI Failed');
                                            setSystemResult(data.result || '');
                                        } catch (err: any) {
                                            setSystemResult('Error: ' + err.message);
                                        } finally {
                                            setSystemLoading(false);
                                        }
                                    } else {
                                        setLoading(true);
                                        setResult('');
                                        try {
                                            const res = await generateAI(type, requisitionId, { prompt: prompt || undefined });
                                            setResult(res || '');
                                        } catch (err: any) {
                                            setResult('Error: ' + err.message);
                                        } finally {
                                            setLoading(false);
                                        }
                                    }
                                }}
                            >
                                {(scope === 'system' ? systemLoading : loading) ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Thinking...</>
                                ) : (
                                    <><Bot className="mr-2 h-4 w-4" /> Run AI Analysis</>
                                )}
                            </Button>
                        </CardContent>
                    </Card>
                </div>

                <div className="flex-1">
                    <Card className="h-full flex flex-col">
                        <CardHeader className="border-b bg-muted/30">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <ClipboardList className="h-5 w-5 text-primary" />
                                    AI Output
                                </CardTitle>
                                {(scope === 'system' ? systemResult : result) && (
                                    <div className="flex gap-2">
                                        <Button size="sm" variant="outline" onClick={() => window.print()}>
                                            <Printer className="mr-2 h-4 w-4" /> Print
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1 p-0 overflow-hidden">
                            <ScrollArea className="h-[600px]">
                                <div className="p-6">
                                    {((scope === 'system' ? systemResult : result)) ? (
                                        <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap font-body text-base">
                                            {scope === 'system' ? systemResult : result}
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-20">
                                            <Bot className="h-12 w-12 opacity-20 mb-4" />
                                            <p className="text-sm">Configure analysis and run to see AI output here.</p>
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
