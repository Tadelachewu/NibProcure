
"use client";

import React, { useEffect, useState } from 'react';
import { generateAI } from '@/lib/ollama-client';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, Database, Eye, EyeOff, ClipboardList, Bot, Printer, Search, BrainCircuit, CheckCircle2, Download, FileText, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type AIStatus = 'idle' | 'fetching' | 'syncing' | 'analyzing' | 'complete';

export default function AIPromptPage() {
    const { token, role } = useAuth();
    const { toast } = useToast();
    const [requisitionId, setRequisitionId] = useState('');
    const [type, setType] = useState<'minutes' | 'report' | 'summary' | 'advice'>('report');
    const [prompt, setPrompt] = useState('');
    const [status, setStatus] = useState<AIStatus>('idle');
    const [result, setResult] = useState('');
    const [systemPrompt, setSystemPrompt] = useState('');
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
            const res = await fetch('/api/reports/refresh-summary', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Failed to refresh system data');
            }

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
                description: `Materialized view refreshed with latest records.` 
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

    const handleDownload = async () => {
        const content = scope === 'system' ? systemResult : result;
        if (!content) return;

        const blob = new Blob([content], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `requisition-ai-${type}-${new Date().getTime()}.txt`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    const handleRunAnalysis = async () => {
        setResult('');
        setSystemResult('');
        setStatus('fetching');

        try {
            if (scope === 'system') {
                const res = await fetch('/api/ollama-systemwide-requisitions', { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, 
                    body: JSON.stringify({ prompt: systemPrompt }) 
                });
                
                setStatus('syncing');
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'AI Failed');
                
                setStatus('analyzing');
                setSystemResult(data.result || '');
            } else {
                setStatus('syncing');
                const res = await generateAI(type as any, requisitionId, { prompt: prompt || undefined });
                setStatus('analyzing');
                setResult(res || '');
            }
            setStatus('complete');
            setTimeout(() => setStatus('idle'), 3000);
        } catch (err: any) {
            const errorMsg = 'Error: ' + err.message;
            if (scope === 'system') setSystemResult(errorMsg);
            else setResult(errorMsg);
            setStatus('idle');
            toast({ variant: 'destructive', title: 'Analysis Failed', description: err.message });
        }
    };

    const canSync = role === 'Admin' || role === 'Procurement_Officer';
    const isWorking = status !== 'idle' && status !== 'complete';

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">AI Intelligent Assistant</h1>
                    <p className="text-muted-foreground mt-1">Generate professional audit reports and minutes optimized for printing.</p>
                </div>
                {canSync && (
                    <div className="flex gap-2">
                        <Button 
                            onClick={handleRefreshSummary} 
                            disabled={refreshing || isWorking} 
                            variant="default"
                            className="bg-primary hover:bg-primary/90 shadow-sm"
                        >
                            {refreshing ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <RefreshCw className="mr-2 h-4 w-4" />
                            )}
                            Sync AI Brain
                        </Button>
                        {testDataPreview && (
                            <Button variant="outline" onClick={() => setShowPreview(!showPreview)}>
                                {showPreview ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                                {showPreview ? 'Hide Raw Data' : 'Preview Sync'}
                            </Button>
                        )}
                    </div>
                )}
            </div>

            {testDataPreview && showPreview && (
                <Card className="border-blue-200 bg-blue-50/30 overflow-hidden print:hidden">
                    <CardHeader className="py-3 px-4 border-b border-blue-100 bg-blue-100/50">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-blue-800">
                                <Database className="h-4 w-4" />
                                Pre-computed System Context (JSON)
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
                <div className="w-full lg:w-1/3 space-y-6 print:hidden">
                    <Card className="shadow-sm border-muted">
                        <CardHeader className="pb-3 border-b bg-muted/20">
                            <CardTitle className="text-lg">Analysis Configuration</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-5 pt-6">
                            <div>
                                <label className="text-sm font-semibold mb-2 block">Analytical Scope</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button 
                                        onClick={() => setScope('specific')}
                                        disabled={isWorking}
                                        className={cn(
                                            "px-3 py-2 text-sm rounded-md border transition-all flex items-center justify-center gap-2",
                                            scope === 'specific' ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-background border-input hover:bg-muted"
                                        )}
                                    >
                                        <FileText className="h-4 w-4" />
                                        Requisition
                                    </button>
                                    <button 
                                        onClick={() => setScope('system')}
                                        disabled={isWorking}
                                        className={cn(
                                            "px-3 py-2 text-sm rounded-md border transition-all flex items-center justify-center gap-2",
                                            scope === 'system' ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-background border-input hover:bg-muted"
                                        )}
                                    >
                                        <Database className="h-4 w-4" />
                                        System-wide
                                    </button>
                                </div>
                            </div>

                            {scope === 'specific' ? (
                                <div className="space-y-4 animate-in fade-in slide-in-from-top-1 duration-300">
                                    <div>
                                        <label className="block text-sm font-semibold mb-1.5">Select Requisition</label>
                                        <select 
                                            value={requisitionId} 
                                            onChange={e => setRequisitionId(e.target.value)} 
                                            disabled={isWorking}
                                            className="w-full border rounded-md px-3 py-2 bg-background focus:ring-2 focus:ring-primary/20 text-sm h-10 outline-none"
                                        >
                                            <option value="">-- Choose Record --</option>
                                            {requisitions.map(r => (
                                                <option key={r.id} value={r.id}>{r.title} ({r.id})</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold mb-1.5">Report Format</label>
                                        <select 
                                            value={type} 
                                            onChange={e => setType(e.target.value as any)} 
                                            disabled={isWorking}
                                            className="w-full border rounded-md px-3 py-2 bg-background focus:ring-2 focus:ring-primary/20 text-sm h-10 outline-none"
                                        >
                                            <option value="report">Audited Lifecycle Report</option>
                                            <option value="summary">Procurement Summary</option>
                                            <option value="minutes">Formal Meeting Minutes</option>
                                            <option value="advice">Risk & Decision Advice</option>
                                        </select>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-4 bg-primary/5 rounded-md border border-primary/20 text-xs text-muted-foreground leading-relaxed">
                                    <p className="flex items-center gap-2 font-semibold text-primary mb-1">
                                        <ShieldCheck className="h-3 w-3" /> System-wide Intelligence
                                    </p>
                                    Uses the pre-computed materialized view to scan entire system history simultaneously.
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-semibold mb-1.5">Custom Instructions</label>
                                <Textarea 
                                    value={scope === 'system' ? systemPrompt : prompt} 
                                    onChange={e => scope === 'system' ? setSystemPrompt(e.target.value) : setPrompt(e.target.value)} 
                                    rows={4} 
                                    disabled={isWorking}
                                    className="resize-none"
                                    placeholder={scope === 'system' ? "e.g. Which departments have the highest rejection rates?" : "Focus on compliance gaps..."}
                                />
                            </div>

                            <div className="space-y-3 pt-2">
                                <Button 
                                    className="w-full h-11" 
                                    disabled={isWorking || (scope === 'system' ? !systemPrompt.trim() : !requisitionId)}
                                    onClick={handleRunAnalysis}
                                >
                                    {status === 'fetching' ? (
                                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scanning DB...</>
                                    ) : status === 'syncing' ? (
                                        <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading Context...</>
                                    ) : status === 'analyzing' ? (
                                        <><BrainCircuit className="mr-2 h-4 w-4 animate-pulse" /> AI Thinking...</>
                                    ) : status === 'complete' ? (
                                        <><CheckCircle2 className="mr-2 h-4 w-4" /> Ready</>
                                    ) : (
                                        <><Bot className="mr-2 h-4 w-4" /> Run Intelligent Analysis</>
                                    )}
                                </Button>

                                {isWorking && (
                                    <div className="space-y-2 px-1">
                                        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                                            <span>System Load</span>
                                            <span>{status === 'fetching' ? '25%' : status === 'syncing' ? '60%' : '90%'}</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                            <div 
                                                className={cn(
                                                    "h-full bg-primary transition-all duration-700 ease-in-out",
                                                    status === 'fetching' ? "w-[25%]" : status === 'syncing' ? "w-[60%]" : "w-[90%]"
                                                )}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="flex-1">
                    <Card className="h-full flex flex-col shadow-sm min-h-[600px] print:border-0 print:shadow-none">
                        <CardHeader className="border-b bg-muted/10 print:hidden">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <ClipboardList className="h-5 w-5 text-primary" />
                                    Analysis Output
                                </CardTitle>
                                {(scope === 'system' ? systemResult : result) && (
                                    <div className="flex gap-2">
                                        <Button size="sm" variant="outline" onClick={handleDownload}>
                                            <Download className="mr-2 h-4 w-4" /> Download
                                        </Button>
                                        <Button size="sm" variant="outline" onClick={() => window.print()}>
                                            <Printer className="mr-2 h-4 w-4" /> Print
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1 p-0 overflow-hidden bg-white dark:bg-card">
                            <ScrollArea className="h-full max-h-[800px]">
                                <div className="p-8 md:p-12 print:p-0">
                                    {(scope === 'system' ? systemResult : result) ? (
                                        <div className="prose prose-sm max-w-none whitespace-pre-wrap font-body text-base leading-relaxed text-slate-900 dark:text-slate-100">
                                            {scope === 'system' ? systemResult : result}
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground/40 text-center space-y-4 print:hidden">
                                            <div className="p-6 rounded-full bg-muted/20">
                                                <Bot className={cn("h-16 w-16", isWorking && "animate-bounce")} />
                                            </div>
                                            <div>
                                                <p className="text-lg font-medium">Ready for Intelligent Analysis</p>
                                                <p className="text-sm max-w-xs mx-auto">Select a scope and click the button to generate a clean, ready-made report.</p>
                                            </div>
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
