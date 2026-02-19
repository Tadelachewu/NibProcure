import React, { useState, useEffect, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { format, isBefore, setHours, setMinutes } from 'date-fns';
import { cn } from '@/lib/utils';
import { PurchaseRequisition, Vendor, Quotation } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Landmark } from '@/components/ui/icons';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Loader2, Send, CheckCircle, CalendarIcon, Search } from 'lucide-react';

type Props = {
  requisition: PurchaseRequisition;
  vendors: Vendor[];
  quotations?: Quotation[];
  onRfqSent: () => void;
  isAuthorized: boolean;
};

export default function RFQDistribution({ requisition, vendors, quotations = [], onRfqSent, isAuthorized }: Props) {
  const [distributionType, setDistributionType] = useState('all');
  const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
  const [vendorSearch, setVendorSearch] = useState('');
  const [isSubmitting, setSubmitting] = useState(false);
  const [deadlineDate, setDeadlineDate] = useState<Date | undefined>();
  const [deadlineTime, setDeadlineTime] = useState('17:00');
  const [cpoAmount, setCpoAmount] = useState<number | undefined>(requisition.cpoAmount);
  const [rfqFile, setRfqFile] = useState<File | null>(null);
  const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

  const [allowQuoteEdits, setAllowQuoteEdits] = useState(requisition.rfqSettings?.allowQuoteEdits ?? true);
  const [experienceDocumentRequired, setExperienceDocumentRequired] = useState(requisition.rfqSettings?.experienceDocumentRequired ?? false);
  const [needsCompliance, setNeedsCompliance] = useState<boolean>(requisition.rfqSettings?.needsCompliance ?? true);
  const [termsAndConditions, setTermsAndConditions] = useState<string[]>(
    Array.isArray((requisition.rfqSettings as any)?.termsAndConditions)
      ? (requisition.rfqSettings as any).termsAndConditions
      : ((requisition.rfqSettings as any)?.termsAndConditions
        ? String((requisition.rfqSettings as any).termsAndConditions)
          .split('\n')
          .map(t => t.trim())
          .filter(Boolean)
        : [])
  );
  const [procurementMethod, setProcurementMethod] = useState<string>(
    requisition.procurementMethod ?? (requisition.isOpenTender ? 'OpenTender' : ((requisition.rfqSettings && (requisition.rfqSettings as any).method) || 'RFQ'))
  );

  const { user } = useAuth();
  const { toast } = useToast();

  const isSent = requisition.status === 'Accepting_Quotes' || requisition.status === 'Scoring_In_Progress' || requisition.status === 'Scoring_Complete';

  useEffect(() => {
    if (requisition.deadline) {
      setDeadlineDate(new Date(requisition.deadline));
      setDeadlineTime(format(new Date(requisition.deadline), 'HH:mm'));
    } else {
      setDeadlineDate(undefined);
      setDeadlineTime('17:00');
    }
    setCpoAmount(requisition.cpoAmount);
    setAllowQuoteEdits(requisition.rfqSettings?.allowQuoteEdits ?? true);
    setExperienceDocumentRequired(requisition.rfqSettings?.experienceDocumentRequired ?? false);
    setNeedsCompliance((requisition.rfqSettings as any)?.needsCompliance ?? true);
    const existingTerms = (requisition.rfqSettings as any)?.termsAndConditions;
    if (Array.isArray(existingTerms)) {
      setTermsAndConditions(existingTerms.map((t: any) => String(t).trim()).filter(Boolean));
    } else if (existingTerms) {
      setTermsAndConditions(
        String(existingTerms)
          .split('\n')
          .map(t => t.trim())
          .filter(Boolean)
      );
    } else {
      setTermsAndConditions([]);
    }
    setProcurementMethod(requisition.procurementMethod ?? (requisition.isOpenTender ? 'OpenTender' : ((requisition.rfqSettings && (requisition.rfqSettings as any).method) || 'RFQ')));
  }, [requisition]);

  const deadline = useMemo(() => {
    if (!deadlineDate || !deadlineTime) return undefined;
    const [hours, minutes] = deadlineTime.split(':').map(Number);
    return setMinutes(setHours(deadlineDate, hours), minutes);
  }, [deadlineDate, deadlineTime]);

  const handleSendRFQ = async () => {
    if (!user || !deadline) return;

    if (procurementMethod !== 'RFQ' && procurementMethod !== 'OpenTender') {
      toast({ title: 'Coming Soon', description: `${procurementMethod} procurement method is coming soon. Only RFQ and Open Tender are supported currently.` });
      return;
    }

    // If this requisition was approved as Open Tender, disallow changing method away from OpenTender
    if (requisition.isOpenTender && procurementMethod !== 'OpenTender') {
      toast({ variant: 'destructive', title: 'Invalid Procurement Method', description: 'This requisition was approved as Open Tender; procurement method must remain Open Tender.' });
      return;
    }

    // If this is an Open Tender, ensure public announcement period has ended
    if (procurementMethod === 'OpenTender') {
      const ann = requisition.announcementEndDate ? new Date(requisition.announcementEndDate) : undefined;
      if (!ann) {
        toast({ variant: 'destructive', title: 'Missing Announcement Date', description: 'This requisition is marked as Open Tender but has no public announcement end date.' });
        return;
      }
      if (isBefore(new Date(), ann)) {
        toast({ variant: 'destructive', title: 'Public Announcement Active', description: 'The public announcement period has not ended. You cannot send RFQ until after the announcement end date/time.' });
        return;
      }
    }

    if (isBefore(deadline, new Date())) {
      toast({ variant: 'destructive', title: 'Invalid Deadline', description: 'The quotation submission deadline must be in the future.' });
      return;
    }

    if (requisition.scoringDeadline && !isBefore(deadline, new Date(requisition.scoringDeadline))) {
      toast({ variant: 'destructive', title: 'Invalid Deadline', description: 'The quotation submission deadline must be earlier than the committee scoring deadline.' });
      return;
    }

    if (distributionType === 'select' && selectedVendors.length === 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please select at least one vendor.' });
      return;
    }

    setSubmitting(true);
    try {
      let rfqDocumentUrl: string | undefined;
      if (rfqFile) {
        const form = new FormData();
        form.append('file', rfqFile);
        form.append('directory', 'rfq');
        const uploadResponse = await fetch('/api/upload', { method: 'POST', body: form });
        const uploadResult = await uploadResponse.json();
        if (!uploadResponse.ok) throw new Error(uploadResult.error || 'Failed to upload RFQ document.');
        rfqDocumentUrl = uploadResult.path;
      }
      const response = await fetch(`/api/requisitions/${requisition.id}/send-rfq`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          vendorIds: distributionType === 'all' ? [] : selectedVendors,
          deadline,
          cpoAmount,
          rfqSettings: {
            allowQuoteEdits,
            experienceDocumentRequired,
            needsCompliance,
            method: procurementMethod,
            rfqDocumentUrl,
            termsAndConditions,
          },
          procurementMethod,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({} as any));
        throw new Error(errorData.error || 'Failed to send RFQ.');
      }

      toast({ title: 'RFQ Sent!', description: 'The requisition is now open for quotations from the selected vendors.' });
      onRfqSent();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err instanceof Error ? err.message : 'An unknown error occurred.' });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredVendors = useMemo(() => {
    const verifiedVendors = Array.isArray(vendors) ? vendors.filter(v => v.kycStatus === 'Verified' && !(v.blacklist && (v.blacklist.blacklisted === true || v.blacklist.status === 'blacklisted'))) : [];
    if (!vendorSearch) return verifiedVendors;
    const lower = vendorSearch.toLowerCase();
    return verifiedVendors.filter(v => v.name.toLowerCase().includes(lower) || v.email.toLowerCase().includes(lower) || v.contactPerson.toLowerCase().includes(lower));
  }, [vendors, vendorSearch]);

  const canTakeAction = !isSent && isAuthorized;

  return (
    <>
      <Card className={cn(isSent && 'bg-muted/30')}>
        <CardHeader>
          <div className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>RFQ Distribution</CardTitle>
              <CardDescription>
                {isSent ? 'The RFQ has been distributed to vendors.' : 'Send the Request for Quotation to vendors to begin receiving bids.'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isAuthorized && !isSent && (
            <div className="border-amber-500 p-3 rounded-md bg-yellow-50">
              <div className="font-medium">Read-Only Mode</div>
              <div className="text-sm text-muted-foreground">You do not have permission to send RFQs based on current system settings.</div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Quotation Submission Deadline</Label>
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant={'outline'} disabled={!canTakeAction} className={cn('w-full justify-start text-left font-normal', !deadlineDate && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {deadlineDate ? format(deadlineDate, 'PPP') : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={deadlineDate} onSelect={setDeadlineDate} disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0)) || !canTakeAction} initialFocus />
                </PopoverContent>
              </Popover>
              <Input type="time" className="w-32" value={deadlineTime} onChange={(e) => setDeadlineTime(e.target.value)} disabled={!canTakeAction} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Procurement Method</Label>
            <select value={procurementMethod} onChange={(e) => setProcurementMethod(e.target.value)} disabled={!canTakeAction} className="w-full border rounded px-2 py-1">
              <option value="RFQ">RFQ (Request for Quotation)</option>
              <option value="RFP">RFP (Request for Proposal) — Coming Soon</option>
              <option value="OpenTender">Open Tender</option>
              <option value="RestrictedTender">Restricted Tender — Coming Soon</option>
              <option value="DirectProcurement">Direct Procurement — Coming Soon</option>
              <option value="TwoStage">Two-Stage Bidding — Coming Soon</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label>Distribution Type</Label>
            <Select value={distributionType} onValueChange={(v) => setDistributionType(v as any)} disabled={!canTakeAction}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Send to all verified vendors</SelectItem>
                <SelectItem value="select">Send to selected vendors</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>RFQ Attachment (optional)</Label>
            {!rfqFile ? (
              <input
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.txt"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  if (!f) return setRfqFile(null);
                  if (f.size > MAX_FILE_BYTES) {
                    toast({ variant: 'destructive', title: 'File too large', description: 'Maximum allowed size is 25 MB.' });
                    return;
                  }
                  setRfqFile(f);
                }}
                disabled={!canTakeAction}
              />
            ) : (
              <div className="flex items-center justify-between gap-4 p-2 border rounded-md bg-muted/50">
                <div className="flex items-center gap-3">
                  <div className="text-sm">
                    <div className="font-medium">{rfqFile.name}</div>
                    <div className="text-xs text-muted-foreground">{(rfqFile.size / 1024 / 1024).toFixed(2)} MB</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer text-sm text-primary underline" aria-label="Change attached file">
                    <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.txt" className="hidden" onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      if (!f) return;
                      if (f.size > MAX_FILE_BYTES) {
                        toast({ variant: 'destructive', title: 'File too large', description: 'Maximum allowed size is 25 MB.' });
                        return;
                      }
                      setRfqFile(f);
                    }} disabled={!canTakeAction} />
                    Change
                  </label>
                  <button type="button" className="text-sm text-destructive underline" onClick={() => setRfqFile(null)} aria-label="Remove attached file">Remove</button>
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">Attach an RFQ document that vendors can read when submitting quotations. Optional. Allowed: PDF, DOCX, XLSX, PNG, JPG, TXT. Max 25 MB.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cpoAmount">CPO Amount (ETB)</Label>
            <div className="relative">
              <Landmark className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input id="cpoAmount" type="number" placeholder="Enter required CPO amount" className="pl-10" value={cpoAmount || ''} onChange={(e) => setCpoAmount(Number(e.target.value))} disabled={!canTakeAction} />
            </div>
            <p className="text-xs text-muted-foreground">Optional. If set, vendors must submit a CPO of this amount to qualify.</p>
          </div>

          <Accordion type="single" collapsible defaultValue="terms">
            <AccordionItem value="terms">
              <AccordionTrigger>
                <span className="text-sm font-medium">Terms and Conditions</span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 mt-2">
                  <div className="space-y-2">
                    {termsAndConditions.length > 0 && (
                      <div className="space-y-1">
                        {termsAndConditions.map((term, index) => (
                          <div key={index} className="flex items-start gap-2">
                            <span className="mt-1 text-xs text-muted-foreground">{index + 1}.</span>
                            <Input
                              value={term}
                              onChange={(e) => {
                                const next = [...termsAndConditions];
                                next[index] = e.target.value;
                                const cleaned = next.map(t => t.trim());
                                setTermsAndConditions(cleaned.filter(t => t.length > 0));
                              }}
                              disabled={!canTakeAction}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const next = termsAndConditions.filter((_, i) => i !== index);
                                setTermsAndConditions(next);
                              }}
                              disabled={!canTakeAction}
                            >
                              Remove
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setTermsAndConditions([...termsAndConditions, ''])}
                      disabled={!canTakeAction}
                    >
                      Add Term
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Optional. Add one term per input. Vendors will see each term separately and must accept all of them when submitting quotations.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="allow-edits">Allow Quote Edits</Label>
                <Switch id="allow-edits" checked={allowQuoteEdits} onCheckedChange={setAllowQuoteEdits} disabled={!canTakeAction} />
              </div>
              <p className="text-xs text-muted-foreground">If enabled, vendors can edit their submitted quotes until the deadline passes.</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="experience-doc">Require Experience Document</Label>
                <Switch id="experience-doc" checked={experienceDocumentRequired} onCheckedChange={setExperienceDocumentRequired} disabled={!canTakeAction} />
              </div>
              <p className="text-xs text-muted-foreground">If enabled, vendors must upload a document detailing their relevant experience.</p>
            </div>
          </div>

          {distributionType === 'select' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Select Vendors</CardTitle>
                <div className="relative mt-2">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search vendors..." className="pl-8 w-full" value={vendorSearch} onChange={(e) => setVendorSearch(e.target.value)} disabled={!canTakeAction} />
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-60">
                  <div className="space-y-4">
                    {filteredVendors.map(vendor => (
                      <div key={vendor.id} className="flex items-start space-x-4 rounded-md border p-4 has-[:checked]:bg-muted">
                        <Checkbox id={`vendor-${vendor.id}`} checked={selectedVendors.includes(vendor.id)} onCheckedChange={(checked) => setSelectedVendors(prev => checked ? [...prev, vendor.id] : prev.filter(id => id !== vendor.id))} className="mt-1" disabled={!canTakeAction} />
                        <div className="flex items-start gap-4 flex-1">
                          <Avatar>
                            <AvatarImage src={`https://picsum.photos/seed/${vendor.id}/40/40`} data-ai-hint="logo" />
                            <AvatarFallback>{vendor.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div className="grid gap-1">
                            <Label htmlFor={`vendor-${vendor.id}`} className="font-semibold cursor-pointer">{vendor.name}</Label>
                            <p className="text-xs text-muted-foreground">{vendor.email}</p>
                            <p className="text-xs text-muted-foreground">Contact: {vendor.contactPerson}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                    {filteredVendors.length === 0 && (<div className="text-center text-muted-foreground py-10">No vendors found matching your search.</div>)}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {isAuthorized && requisition.allowedVendorIds && requisition.allowedVendorIds.length > 0 && (
            <div className="mt-4">
              <h4 className="font-medium mb-2">Invited Vendors</h4>
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requisition.allowedVendorIds.map(id => {
                      const vendor = vendors.find(v => v.id === id);
                      const submitted = quotations.some(q => q.vendorId === id);
                      return (
                        <TableRow key={id}>
                          <TableCell>{vendor ? vendor.name : id}</TableCell>
                          <TableCell>{submitted ? (<Badge className="bg-green-600 text-white hover:bg-green-600">Submitted</Badge>) : (<Badge variant="secondary">Not Submitted</Badge>)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-4">
            <Button onClick={handleSendRFQ} disabled={isSubmitting || !deadline || !isAuthorized || isSent}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send RFQ
            </Button>
            {isSent ? (
              <Badge variant="default" className="gap-2"><CheckCircle className="h-4 w-4" />RFQ Distributed on {format(new Date(requisition.updatedAt), 'PP')}</Badge>
            ) : (!deadline && (<p className="text-xs text-muted-foreground">A quotation deadline must be set.</p>))}
          </div>
        </CardFooter>
      </Card>
    </>
  );
}
