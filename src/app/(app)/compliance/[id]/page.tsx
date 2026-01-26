
"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { differenceInCalendarDays } from 'date-fns';
import Link from 'next/link';

const CompliancePage = () => {
  const { id } = useParams() as { id: string };
  const { user, token, allUsers } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [requisition, setRequisition] = useState<any | null>(null);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [openQuoteId, setOpenQuoteId] = useState<string | null>(null);
  const [formState, setFormState] = useState<any>({ committeeComment: '', checks: {} });
  const [submittingFinalize, setSubmittingFinalize] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const [rRes, qRes] = await Promise.all([
          fetch(`/api/requisitions/${id}`),
          fetch(`/api/quotations?requisitionId=${id}`),
        ]);
        const rJson = await rRes.json();
        const qJson = await qRes.json();
        setRequisition(rJson);
        setQuotations(qJson || []);
      } catch (e) {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to load data.' });
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id, toast]);

  const isAssigned = useMemo(() => {
    if (!user || !requisition) return false;
    const uId = user.id;
    const assignedOnReq = (requisition.financialCommitteeMemberIds || []).includes(uId) || 
                          (requisition.technicalCommitteeMemberIds || []).includes(uId) ||
                          (requisition.complianceCommitteeMemberIds || []).includes(uId);
    if (assignedOnReq) return true;
    
    return (user.committeeAssignments || []).some((a:any) => a.requisitionId === requisition.id);
  }, [user, requisition]);

  const hasFinalizedChecks = useMemo(() => {
      if (!user || !allUsers || !requisition) return false;
      const currentUserWithDetails = allUsers.find(u => u.id === user.id);
      if (!currentUserWithDetails) return false;
      const assign = (currentUserWithDetails.committeeAssignments || []).find((a: any) => a.requisitionId === requisition.id);
      return assign?.scoresSubmitted === true;
  }, [user, requisition, allUsers]);

  const hidePrices = useMemo(() => {
    if (!user || !requisition) return false; // Default to showing prices if data is not loaded

    // Only hide prices if the RFQ requires compliance checks
    const needsCompliance = (requisition.rfqSettings as any)?.needsCompliance ?? true;
    if (!needsCompliance) {
      return false;
    }
    
    // Check if the user is assigned to this requisition's committee
    if (!isAssigned) {
      return false; // Not on the committee, prices are not hidden for them.
    }

    // Check if the RFQ setting explicitly allows evaluators to see prices
    if (requisition.rfqSettings?.technicalEvaluatorSeesPrices) {
      return false; // Setting is ON, so show prices.
    }
    
    // If the user has already finalized their checks, show the prices.
    if (hasFinalizedChecks) {
      return false;
    }
    
    // If none of the "show price" conditions are met, hide the prices.
    return true;
  }, [user, requisition, isAssigned, hasFinalizedChecks]);
  
  const hasSubmittedAll = useMemo(() => {
    if (!user || !quotations) return false;
    const uid = user.id;
    return quotations.every(q => (q.complianceSets || []).some((c:any) => c.scorerId === uid));
  }, [user, quotations]);

  const openForQuote = (quote: any) => {
    // initialize form state
    const checksObj: any = {};
    quote.items.forEach((it: any) => {
      // prefill from existing user compliance if present
      const existing = (quote.complianceSets || []).find((c: any) => c.scorerId === user?.id);
      const item = existing?.itemCompliances?.find((ic: any) => ic.quoteItemId === it.id);
      checksObj[it.id] = { comply: item ? Boolean(item.comply) : true, comment: item?.comment || '' };
    });
    setFormState({ committeeComment: (quote.complianceSets || []).find((c:any)=>c.scorerId===user?.id)?.committeeComment || '', checks: checksObj });
    setOpenQuoteId(quote.id);
  };

  const closeDialog = () => { setOpenQuoteId(null); setFormState({ committeeComment: '', checks: {} }); };

  const submitCompliance = async (quoteId: string) => {
    if (!user || !token) {
      toast({ variant: 'destructive', title: 'Not authenticated', description: 'You must be signed in to submit compliance checks.' });
      return;
    }
    setSubmittingFinalize(true);
    const checks = Object.entries(formState.checks).map(([quoteItemId, v]: any) => ({ quoteItemId, comply: !!v.comply, comment: v.comment }));
    try {
      const res = await fetch(`/api/quotations/${quoteId}/score`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ checks, committeeComment: formState.committeeComment, userId: user.id }) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as any));
        if (res.status === 409) {
          toast({ title: 'Already submitted', description: 'You have already submitted compliance checks for this quotation.' });
          closeDialog();
          setSubmittingFinalize(false);
          return;
        }
        throw new Error(data.error || 'Failed to submit compliance.');
      }
      toast({ title: 'Saved', description: 'Compliance checks submitted.' });
      // refresh
      const qRes = await fetch(`/api/quotations?requisitionId=${id}`);
      const qJson = await qRes.json();
      setQuotations(qJson || []);
      closeDialog();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e?.message || 'Failed to submit.' });
    } finally {
      setSubmittingFinalize(false);
    }
  };

  const finalizeChecks = async () => {
    if (!hasSubmittedAll) {
      const remaining = quotations.filter(q => !(q.complianceSets || []).some((c:any) => c.scorerId === user?.id)).length;
      toast({ title: 'Incomplete', description: `You must complete checks for ${remaining} more quotation(s).` });
      return;
    }
    try {
      setSubmittingFinalize(true);
      const res = await fetch(`/api/requisitions/${id}/submit-scores`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ userId: user?.id }) });
      
      if (res.status === 409) {
        toast({ title: 'Already Finalized', description: 'Your compliance checks were already finalized.' });
      } else if (!res.ok) {
        const data = await res.json().catch(() => ({} as any));
        throw new Error(data.error || 'Failed to finalize your checks.');
      } else {
        toast({ title: 'Finalized', description: 'Your checks have been finalized.' });
      }
      
      // Full refresh to update all states
      const [rRes, qRes] = await Promise.all([fetch(`/api/requisitions/${id}`), fetch(`/api/quotations?requisitionId=${id}`)]);
      setRequisition(await rRes.json());
      setQuotations(await qRes.json());

    } catch (e:any) {
      toast({ variant: 'destructive', title: 'Error', description: e?.message || 'Failed to finalize.' });
    } finally {
      setSubmittingFinalize(false);
    }
  }

  if (loading || !requisition) return <div className="p-8">Loading...</div>;

  if (!isAssigned) return (
    <div className="p-8">
      <Card>
        <CardHeader>
          <CardTitle>Access Denied</CardTitle>
          <CardDescription>You are not assigned to the evaluation committee for this requisition.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">If you believe this is an error, contact procurement or the requisition owner.</p>
            <Link href={`/compliance`}><Button>Back</Button></Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Compliance Checks — {requisition.title}</h2>
        <div className="flex gap-2">
          <Link href={`/compliance`}><Button variant="outline">Back to Compliance</Button></Link>
          <div>
            {hasFinalizedChecks ? (
              <Button disabled>Submitted</Button>
            ) : (
              <Button disabled={!hasSubmittedAll || submittingFinalize} onClick={finalizeChecks}>
                {submittingFinalize && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Finalize My Checks
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {quotations.map(q => (
          <Card key={q.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="font-semibold">{q.vendorName}</div>
                  <div className="text-xs text-muted-foreground">{q.vendorContact || ''}</div>
                </div>
                <div className="text-right">
                  {!hidePrices && <div className="text-sm font-bold">{q.totalPrice?.toLocaleString?.() ?? q.totalPrice} ETB</div>}
                  {q.deliveryDate && (() => {
                    const maxLead = Math.max(...(q.items?.map((i:any) => Number(i.leadTimeDays) || 0) || [0]));
                    if (q.status === 'Accepted') {
                      const ref = new Date(q.updatedAt || q.createdAt || new Date());
                      const days = Math.max(0, differenceInCalendarDays(new Date(q.deliveryDate), ref));
                      return <div className="text-xs text-muted-foreground">Delivery: {days} days after acceptance</div>;
                    }
                    return <div className="text-xs text-muted-foreground">Delivery: Delivery time in {maxLead} days after acceptance</div>;
                  })()}
                </div>
              </CardTitle>
              <CardDescription className="mt-1 text-xs text-muted-foreground">
                {q.submissionMethod ? `${q.submissionMethod} submission` : ''} • {q.status?.replace(/_/g, ' ') || ''}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {requisition.customQuestions && requisition.customQuestions.length > 0 && (
                  <div className="border rounded mb-2">
                    <details>
                      <summary className="cursor-pointer font-semibold p-2">General Questions</summary>
                      <div className="p-2">
                        {requisition.customQuestions.filter((qst:any) => !qst.requisitionItemId).map((qst:any) => {
                          const answer = (q.answers || []).find((a:any) => a.questionId === qst.id)?.answer;
                          return (
                            <div key={qst.id} className="mb-2">
                              <div className="font-medium">{qst.questionText}</div>
                              <div className="text-xs text-muted-foreground">{qst.isRequired ? 'Required' : 'Optional'}</div>
                              <div className="text-xs mt-1"><span className="font-semibold">Answer:</span> {answer || <span className="text-muted-foreground">No answer</span>}</div>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  </div>
                )}

                {q.items.map((it:any) => (
                  <div key={it.id} className="border rounded mb-2">
                    <details>
                      <summary className="cursor-pointer font-semibold p-2">{it.name} — Qty: {it.quantity}</summary>
                      <div className="p-2 space-y-2">
                        <div className="font-medium">Requester Info</div>
                        <div className="text-xs text-muted-foreground">{requisition.requesterName} ({requisition.department})</div>
                        <div className="font-medium mt-2">Requested Spec</div>
                        <div className="text-xs text-muted-foreground">{
                          (requisition.items?.find((reqItem:any) => reqItem.id === it.requisitionItemId)?.description) || 'N/A'
                        }</div>
                        {it.imageUrl && <img src={it.imageUrl} alt="Requested Item" className="max-h-32 mt-2" />}
                        <div className="font-medium mt-2">Quotation Info</div>
                        {!hidePrices && <div className="text-xs text-muted-foreground">Unit Price: {it.unitPrice?.toFixed?.(2) ?? it.unitPrice} ETB</div>}
                        {!hidePrices && <div className="text-xs text-muted-foreground">Total: {(it.unitPrice * it.quantity)?.toFixed?.(2) ?? ''} ETB</div>}
                        <div className="font-medium mt-2">Vendor Spec</div>
                        <div className="text-xs text-muted-foreground">{it.brandDetails || 'N/A'}</div>
                        {it.vendorImageUrl && <img src={it.vendorImageUrl} alt="Vendor Item" className="max-h-32 mt-2" />}
                        {requisition.customQuestions && requisition.customQuestions.length > 0 && (
                          <div className="mt-2">
                            <div className="font-medium">Item Questions & Answers</div>
                            {requisition.customQuestions.filter((qst:any) => qst.requisitionItemId === it.requisitionItemId).map((qst:any) => {
                              const answer = (q.answers || []).find((a:any) => a.questionId === qst.id)?.answer;
                              return (
                                <div key={qst.id} className="mb-1">
                                  <div className="text-xs text-muted-foreground">Q: {qst.questionText}</div>
                                  <div className="text-xs">A: {answer || <span className="text-muted-foreground">No answer</span>}</div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </details>
                  </div>
                ))}

                {q.cpoDocumentUrl && (
                  <div className="text-sm space-y-1">
                    <h4 className="font-semibold">CPO Document</h4>
                    <Button asChild variant="link" className="p-0 h-auto">
                      <a href={q.cpoDocumentUrl} target="_blank" rel="noopener noreferrer">{q.cpoDocumentUrl.split('/').pop()}</a>
                    </Button>
                  </div>
                )}
                {q.experienceDocumentUrl && (
                  <div className="text-sm space-y-1">
                    <h4 className="font-semibold">Experience Document</h4>
                    <Button asChild variant="link" className="p-0 h-auto">
                      <a href={q.experienceDocumentUrl} target="_blank" rel="noopener noreferrer">{q.experienceDocumentUrl.split('/').pop()}</a>
                    </Button>
                  </div>
                )}

                {q.notes && (
                  <div className="text-sm">
                    <h4 className="font-semibold">Notes</h4>
                    <p className="text-xs text-muted-foreground">{q.notes}</p>
                  </div>
                )}
              </div>
            </CardContent>
            <div className="p-4 border-t flex items-center justify-end">
              <Button onClick={() => openForQuote(q)}>{(q.complianceSets || []).some((c:any) => c.scorerId === user?.id) ? 'View / Already Checked' : 'Open Compliance'}</Button>
            </div>
          </Card>
        ))}
      </div>

      {openQuoteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded shadow max-w-3xl w-full p-6">
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-semibold">Compliance Check</h3>
              <Button variant="ghost" onClick={closeDialog}>Close</Button>
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Committee Comment</label>
                <Textarea value={formState.committeeComment} onChange={(e) => setFormState((s:any) => ({ ...s, committeeComment: e.target.value }))} />
              </div>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {quotations.find(q => q.id === openQuoteId)?.items.map((it:any) => (
                  <div key={it.id} className="flex items-start gap-4">
                    <div className="pt-1">
                      <Checkbox checked={formState.checks[it.id]?.comply ?? true} onCheckedChange={(v) => setFormState((s:any) => ({ ...s, checks: { ...s.checks, [it.id]: { ...(s.checks[it.id]||{}), comply: v } } }))} />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">{it.name} — Qty: {it.quantity}</div>
                      <Input placeholder="Optional comment" value={formState.checks[it.id]?.comment || ''} onChange={(e) => setFormState((s:any) => ({ ...s, checks: { ...s.checks, [it.id]: { ...(s.checks[it.id]||{}), comment: e.target.value } } }))} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={closeDialog}>Cancel</Button>
                <Button onClick={() => submitCompliance(openQuoteId)} disabled={submittingFinalize}>
                  {submittingFinalize && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Compliance
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompliancePage;

