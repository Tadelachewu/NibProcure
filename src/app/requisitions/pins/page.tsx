"use client"

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from '@/hooks/use-toast';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export default function RequisitionPinsPage() {
  const { user, token } = useAuth();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [loading, setLoading] = useState(false);
  const [pins, setPins] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | undefined>();
  const [pinInputs, setPinInputs] = useState<Record<string, string>>({});
  const [verifyingMap, setVerifyingMap] = useState<Record<string, boolean>>({});
  const [plainPinMap, setPlainPinMap] = useState<Record<string, { pin: string, expiresAt?: string }>>({});

  const PLAIN_PIN_STORAGE_KEY = "nibprocure.plainPins.v1";

  const loadPlainPins = () => {
    try {
      const raw = localStorage.getItem(PLAIN_PIN_STORAGE_KEY);
      if (!raw) return {} as Record<string, { pin: string, expiresAt?: string }>;
      const parsed = JSON.parse(raw) as Record<string, { pin: string; expiresAt?: string }>;
      const now = Date.now();
      const cleaned: Record<string, { pin: string; expiresAt?: string }> = {};
      for (const [id, v] of Object.entries(parsed || {})) {
        if (!v?.pin) continue;
        if (v.expiresAt && !Number.isNaN(Date.parse(v.expiresAt)) && Date.parse(v.expiresAt) <= now) continue;
        cleaned[id] = v;
      }
      return cleaned;
    } catch {
      return {};
    }
  };

  const savePlainPins = (next: Record<string, { pin: string, expiresAt?: string }>) => {
    try {
      localStorage.setItem(PLAIN_PIN_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const fetchPins = async (p = 1) => {
    setLoading(true);
    setError(undefined);
    try {
      const res = await fetch(`/api/requisitions/pins?page=${p}&pageSize=${pageSize}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load pins");
      setPins(data.pins || []);
      setTotal(data.total || (data.pins || []).length);
      setPage(data.page || p);
    } catch (e: any) {
      setError(e.message || "Failed to load pins");
    } finally {
      setLoading(false);
    }
  };

  const resendToMe = async (requisitionId: string) => {
    if (!token) {
      toast({ variant: "destructive", title: "Unauthorized", description: "You must be signed in." });
      return;
    }
    try {
      const res = await fetch(`/api/requisitions/${requisitionId}/request-pin?includePins=1`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to resend PIN");
      if (data.plainPin && data.id) {
        // Keep the latest returned pin in the client map (persisted across refresh)
        setPlainPinMap(prev => {
          const next = { ...prev, [data.id]: { pin: data.plainPin, expiresAt: data.expiresAt } };
          savePlainPins(next);
          return next;
        });
        toast({ title: 'PIN available', description: 'Hover the PIN label on the card to reveal it.' });
      } else {
        toast({ title: "PIN sent", description: "A one-time PIN was sent to your email." });
      }
      await fetchPins(page);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e?.message || "Failed to resend PIN" });
    }
  };

  useEffect(() => {
    if (!token) return;
    // Load persisted plaintext pins (dev/testing) so tooltips survive refresh.
    setPlainPinMap(loadPlainPins());
    fetchPins(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const grouped = useMemo(() => {
    const map: Record<string, { requisition: any; pins: any[] }> = {};
    pins.forEach((p) => {
      const id = p.requisition?.id || "unknown";
      if (!map[id]) map[id] = { requisition: p.requisition, pins: [] };
      map[id].pins.push(p);
    });
    return Object.values(map).sort((a, b) => (a.requisition?.title || "").localeCompare(b.requisition?.title || ""));
  }, [pins]);

  return (
    <div className="container mx-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Requisition Pins</h1>
        <div className="flex items-center gap-2">
          <Link href="/">
            <Button variant="ghost">Back</Button>
          </Link>
          <Button onClick={() => fetchPins(1)} disabled={loading}>{loading ? "Loading..." : "Refresh"}</Button>
        </div>
      </div>

      {error && <div className="text-destructive mb-4">{error}</div>}

      {grouped.length === 0 && !loading && <div className="text-sm text-muted-foreground">No pins found.</div>}

      <div className="space-y-4">
        {grouped.map((g, gi) => (
          <Card key={gi} className="p-2">
            <CardHeader>
              <CardTitle>{g.requisition?.title || 'Untitled Requisition'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-xs text-muted-foreground">ID: {g.requisition?.id}</div>
                </div>
                <div className="text-sm text-muted-foreground">Pins: {g.pins.length}</div>
              </div>

              <div className="mt-2 grid gap-2">
                {g.pins.map((p: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between border p-2 rounded">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium">{p.roleName || p.role}</div>
                        {p.recipient && p.recipient.id && user?.id === p.recipient.id && (
                          <div className="text-xs bg-muted px-2 py-1 rounded">You</div>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">Status: {p.used ? 'Used' : 'Pending'}</div>
                      {p.recipient && (
                        <div className="text-xs text-muted-foreground">Recipient: {p.recipient.name || p.recipient.email}</div>
                      )}
                      {p.recipient && p.recipient.id === user?.id && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="text-sm font-mono text-primary cursor-help">PIN: ••••••</div>
                            </TooltipTrigger>
                            <TooltipContent>
                              {plainPinMap[p.id]?.pin ? (
                                <>
                                  <div className="font-mono">{plainPinMap[p.id]?.pin}</div>
                                  {plainPinMap[p.id]?.expiresAt ? (
                                    <div className="text-xs text-muted-foreground">Expires: {new Date(plainPinMap[p.id]?.expiresAt as string).toLocaleString()}</div>
                                  ) : null}
                                </>
                              ) : (
                                <div className="text-xs text-muted-foreground">PIN was sent to your email. Click “Resend to me” to view it here.</div>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-xs text-muted-foreground">Expires: {p.expiresAt ? new Date(p.expiresAt).toLocaleString() : '—'}</div>
                      {p.recipient && p.recipient.id === user?.id && (
                        <div className="flex items-center gap-2">
                          <Input placeholder="Enter PIN" value={pinInputs[p.id] || ''} onChange={(e) => setPinInputs(prev => ({ ...prev, [p.id]: e.target.value }))} />
                          <Button size="sm" variant="outline" onClick={() => resendToMe(g.requisition.id)}>Resend to me</Button>
                          <Button size="sm" onClick={async () => {
                            const pinValue = pinInputs[p.id] || '';
                            if (!pinValue) { toast({ variant: 'destructive', title: 'Failure', description: 'Please enter your PIN before verifying.' }); return; }
                            if (!token) { toast({ variant: 'destructive', title: 'Failure', description: 'You must be signed in.' }); return; }
                            try {
                              setVerifyingMap(m => ({ ...m, [p.id]: true }));
                              const finalRes = await fetch(`/api/requisitions/${g.requisition.id}/verify-pin`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ roleName: p.roleName || p.role, pin: pinValue }) });
                              const finalData = await finalRes.json();
                              if (!finalRes.ok) throw new Error(finalData.error || 'Verification failed');
                              if (finalData.unmasked) {
                                toast({ variant: 'success', title: 'Success', description: 'Quotations have been unmasked.' });
                              } else {
                                toast({ variant: 'success', title: 'Success', description: `${finalData.remaining} remaining to unmask.` });
                              }
                              await fetchPins(page);
                            } catch (err: any) {
                              toast({ variant: 'destructive', title: 'Failure', description: err?.message || 'Verification failed' });
                            } finally {
                              setVerifyingMap(m => ({ ...m, [p.id]: false }));
                            }
                          }} disabled={!!verifyingMap[p.id]}>{verifyingMap[p.id] ? 'Verifying...' : 'Verify'}</Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Total: {total}</div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage(1)} disabled={page === 1}>First</Button>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Prev</Button>
          <div className="text-sm">Page {page}</div>
          <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={(page * pageSize) >= total}>Next</Button>
        </div>
      </div>
    </div>
  );
}
