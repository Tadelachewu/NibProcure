"use client";

import React, { useEffect, useState } from 'react';
import { generateAI } from '@/lib/ollama-client';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
        try {
            const res = await fetch('/api/reports/refresh-summary', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Failed to refresh system data');
            }
            
            toast({ 
                title: 'Data Refreshed', 
                description: 'The pre-computed system summary for AI analysis has been updated.' 
            });
        } catch (err: any) {
            toast({ 
                variant: 'destructive', 
                title: 'Refresh Failed', 
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
            // sanitize client-side as well for display
            const sanitize = (s: string) => s ? s.replace(/[\*\+\[\]\{\}\<\>\`\|\\]/g, '').replace(/\r\n|\r/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/ {2,}/g, ' ') : '';
            setResult(sanitize(res || ''));
        } catch (err: any) {
            setResult('Error: ' + (err?.message || String(err)));
        } finally {
            setLoading(false);
        }
    };

    // Allow Admins and Procurement Officers to sync data
    const canSync = role === 'Admin' || role === 'Procurement_Officer';

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-semibold">AI Assistant</h1>
                {canSync && (
                    <Button 
                        onClick={handleRefreshSummary} 
                        disabled={refreshing} 
                        variant="outline"
                        title="Refreshes the pre-computed data used for system-wide AI scans."
                    >
                        {refreshing ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <RefreshCw className="mr-2 h-4 w-4" />
                        )}
                        Sync AI Data
                    </Button>
                )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
                <div>
                    <label className="block text-sm font-medium">Scope</label>
                    <div className="mt-2 flex gap-3">
                        <label className={`inline-flex items-center px-3 py-2 rounded-md cursor-pointer ${scope === 'specific' ? 'bg-indigo-50 border border-indigo-200' : 'bg-white border border-gray-200'}`}>
                            <input type="radio" name="scope" value="specific" checked={scope === 'specific'} onChange={() => setScope('specific')} className="mr-2" />
                            Specific Requisition
                        </label>
                        <label className={`inline-flex items-center px-3 py-2 rounded-md cursor-pointer ${scope === 'system' ? 'bg-indigo-50 border border-indigo-200' : 'bg-white border border-gray-200'}`}>
                            <input type="radio" name="scope" value="system" checked={scope === 'system'} onChange={() => setScope('system')} className="mr-2" />
                            System-wide
                        </label>
                    </div>
                </div>

                {scope === 'system' ? (
                    <div className="p-4 bg-gray-50 border border-dashed border-gray-200 rounded-md space-y-3">
                        <h3 className="text-sm font-semibold">System-wide AI</h3>
                        <p className="text-sm text-muted-foreground">Ask a simple question about the whole procurement system. Use plain words — the assistant will refine your question and return an easy-to-read answer with suggested next steps.</p>

                        <div>
                            <label className="block text-sm font-medium">Your question (plain language)</label>
                            <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={4} className="w-full mt-1 border rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="E.g. Which requisitions need urgent action this week?" />
                        </div>

                        <div>
                            <button type="button" disabled={systemLoading || !systemPrompt.trim()} onClick={async () => {
                                setSystemLoading(true);
                                setSystemResult('');
                                try {
                                    const res = await fetch('/api/ollama-systemwide-requisitions', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ prompt: systemPrompt }) });
                                    const text = await res.text();
                                    let data: any = null;
                                    try { data = JSON.parse(text); } catch (e) { /* not JSON */ }
                                    if (!res.ok) {
                                        const errMsg = data?.error || text || 'Failed to generate';
                                        throw new Error(errMsg);
                                    }
                                    const out = (data && (data.result || data.prompt)) || (text && !data ? text : JSON.stringify(data?.requisitions || {}).slice(0, 2000));
                                    setSystemResult(typeof out === 'string' ? out : JSON.stringify(out));
                                } catch (err: any) {
                                    setSystemResult('Error: ' + (err?.message || String(err)));
                                } finally {
                                    setSystemLoading(false);
                                }
                            }} className="inline-flex items-center px-4 py-2 rounded-md bg-gradient-to-r from-indigo-600 to-violet-500 text-white">{systemLoading ? 'Generating...' : 'Generate system-wide'}</button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div>
                            <label className="block text-sm font-medium">Requisition</label>
                            <select value={requisitionId} onChange={e => setRequisitionId(e.target.value)} className="w-full mt-1 border rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                                <option value="">-- Select requisition --</option>
                                {requisitions.map(r => (
                                    <option key={r.id} value={r.id}>{r.title} — {r.id}</option>
                                ))}
                            </select>
                            {requisitions.length === 0 && <p className="text-sm text-muted-foreground mt-1">No requisitions found.</p>}
                        </div>
                        <div>
                            <label className="block text-sm font-medium">Type</label>
                            <select value={type} onChange={e => setType(e.target.value as any)} className="w-full mt-1 border rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                                <option value="minutes">Minutes</option>
                                <option value="report">Report</option>
                                <option value="advice">Decision Advice</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium">Optional Prompt Override</label>
                            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4} className="w-full mt-1 border rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="Add specific instructions or leave blank to use generated template." />
                        </div>
                        <div>
                            <button type="submit" disabled={loading || !requisitionId} className="inline-flex items-center px-4 py-2 rounded-md bg-gradient-to-r from-indigo-600 to-violet-500 hover:from-indigo-700 hover:to-violet-600 text-white shadow-md border-0 disabled:opacity-50 disabled:cursor-not-allowed">
                                {loading ? 'Generating...' : 'Generate'}
                            </button>
                        </div>
                    </>
                )}
            </form>

            <div className="mt-6">
                <h2 className="text-lg font-medium">Result</h2>
                {scope === 'system' ? (
                    <pre className="whitespace-pre-wrap bg-white p-6 mt-2 rounded-lg shadow-sm border border-gray-200 text-gray-900">{systemResult || 'No output yet.'}</pre>
                ) : (
                    <pre className="whitespace-pre-wrap bg-white p-6 mt-2 rounded-lg shadow-sm border border-gray-200 text-gray-900">{result || 'No output yet.'}</pre>
                )}
                <div className="flex gap-3 items-center mt-4 justify-end">
                    <button
                        type="button"
                        disabled={!(scope === 'system' ? systemResult : result)}
                        className={`inline-flex items-center px-4 py-2 rounded-md text-white shadow-md border-0 ${(!(scope === 'system' ? systemResult : result)) ? 'opacity-50 cursor-not-allowed bg-gray-300' : 'bg-gradient-to-r from-indigo-600 to-violet-500 hover:from-indigo-700 hover:to-violet-600'}`}
                        onClick={async () => {
                            const effective = scope === 'system' ? systemResult : result;
                            if (!effective) return;
                            try {
                                if (scope === 'system') {
                                    const blob = new Blob([`<!doctype html><html><head><meta charset="utf-8"><title>System-wide AI</title><style>body{font-family:Arial,Helvetica,sans-serif;padding:24px;color:#111}pre{white-space:pre-wrap;word-wrap:break-word;font-family:inherit}</style></head><body><h1>System-wide AI</h1><pre>${effective.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre></body></html>`], { type: 'text/html' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `system-wide-ai.html`;
                                    document.body.appendChild(a);
                                    a.click();
                                    a.remove();
                                    URL.revokeObjectURL(url);
                                    return;
                                }

                                if (!requisitionId) return;
                                const body = { type, requisitionId, prompt: prompt || undefined, filename: `requisition-${requisitionId}-${type}.html` };
                                const res = await fetch('/api/ai/generate/download', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
                                if (!res.ok) {
                                    const err = await res.json().catch(() => ({ error: 'Download failed' }));
                                    throw new Error(err.error || 'Download failed');
                                }
                                const blob = await res.blob();
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = body.filename;
                                document.body.appendChild(a);
                                a.click();
                                a.remove();
                                URL.revokeObjectURL(url);
                            } catch (err: any) {
                                alert('Download error: ' + (err?.message || String(err)));
                            }
                        }}
                    >
                        Download
                    </button>

                    <button
                        type="button"
                        disabled={!(scope === 'system' ? systemResult : result)}
                        className={`inline-flex items-center px-4 py-2 rounded-md text-white shadow-md border-0 ${(!(scope === 'system' ? systemResult : result)) ? 'opacity-50 cursor-not-allowed bg-gray-300' : 'bg-gradient-to-r from-green-500 to-emerald-400 hover:from-green-600 hover:to-emerald-500'}`}
                        onClick={() => {
                            const effective = scope === 'system' ? systemResult : result;
                            if (!effective) return;
                            const w = window.open('', '_blank', 'noopener');
                            if (!w) return;
                            const escapeHtml = (str: string) => str
                                .replace(/&/g, '&amp;')
                                .replace(/</g, '&lt;')
                                .replace(/>/g, '&gt;')
                                .replace(/"/g, '&quot;')
                                .replace(/'/g, '&#39;');
                            const escaped = escapeHtml(effective || '');
                            const title = scope === 'system' ? `System-wide AI` : `Requisition AI - ${requisitionId}`;
                            const printable = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:Arial,Helvetica,sans-serif;padding:24px;color:#111}pre{white-space:pre-wrap;word-wrap:break-word;font-family:inherit}</style></head><body><h1>${title}</h1><pre>${escaped}</pre></body></html>`;
                            w.document.open();
                            w.document.write(printable);
                            w.document.close();
                            w.focus();
                            setTimeout(() => w.print(), 250);
                        }}
                    >
                        Print
                    </button>
                </div>
            </div>
        </div>
    );
}
