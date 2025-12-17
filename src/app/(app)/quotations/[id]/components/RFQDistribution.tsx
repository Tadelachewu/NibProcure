
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { PurchaseRequisition, Vendor } from '@/lib/types';
import { cn } from '@/lib/utils';
import { format, isBefore, setHours, setMinutes } from 'date-fns';
import { Loader2, Send, CheckCircle, CalendarIcon, Landmark, Search, AlertCircle } from 'lucide-react';

export function RFQDistribution({
  requisition,
  vendors,
  onRfqSent,
  isAuthorized,
}: {
  requisition: PurchaseRequisition;
  vendors: Vendor[];
  onRfqSent: () => void;
  isAuthorized: boolean;
}) {
  const [distributionType, setDistributionType] = useState('all');
  const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
  const [vendorSearch, setVendorSearch] = useState('');
  const [isSubmitting, setSubmitting] = useState(false);
  const [deadlineDate, setDeadlineDate] = useState<Date | undefined>();
  const [deadlineTime, setDeadlineTime] = useState('17:00');
  const [cpoAmount, setCpoAmount] = useState<number | undefined>(requisition.cpoAmount);

  const [allowQuoteEdits, setAllowQuoteEdits] = useState(requisition.rfqSettings?.allowQuoteEdits ?? true);
  const [experienceDocumentRequired, setExperienceDocumentRequired] = useState(requisition.rfqSettings?.experienceDocumentRequired ?? false);
  const { user, token } = useAuth();
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
  }, [requisition]);

  const deadline = useMemo(() => {
    if (!deadlineDate || !deadlineTime) return undefined;
    const [hours, minutes] = deadlineTime.split(':').map(Number);
    return setMinutes(setHours(deadlineDate, hours), minutes);
  }, [deadlineDate, deadlineTime]);

  const handleSendRFQ = async () => {
    if (!user || !token || !deadline) return;

    if (isBefore(deadline, new Date())) {
      toast({
        variant: 'destructive',
        title: 'Invalid Deadline',
        description: 'The quotation submission deadline must be in the future.',
      });
      return;
    }

    if (requisition.scoringDeadline && !isBefore(deadline, new Date(requisition.scoringDeadline))) {
      toast({
        variant: 'destructive',
        title: 'Invalid Deadline',
        description: 'The quotation submission deadline must be earlier than the committee scoring deadline.',
      });
      return;
    }

    if (distributionType === 'select' && selectedVendors.length === 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please select at least one vendor.' });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/requisitions/${requisition.id}/send-rfq`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          userId: user.id,
          vendorIds: distributionType === 'all' ? [] : selectedVendors,
          deadline,
          cpoAmount,
          rfqSettings: {
            allowQuoteEdits,
            experienceDocumentRequired
          }
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send RFQ.');
      }

      toast({ title: 'RFQ Sent!', description: 'The requisition is now open for quotations from the selected vendors.' });
      onRfqSent();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'An unknown error occurred.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  const filteredVendors = useMemo(() => {
    const verifiedVendors = Array.isArray(vendors) ? vendors.filter(v => v.kycStatus === 'Verified') : [];
    if (!vendorSearch) {
      return verifiedVendors;
    }
    const lowercasedSearch = vendorSearch.toLowerCase();
    return verifiedVendors.filter(vendor =>
      vendor.name.toLowerCase().includes(lowercasedSearch) ||
      vendor.email.toLowerCase().includes(lowercasedSearch) ||
      vendor.contactPerson.toLowerCase().includes(lowercasedSearch)
    );
  }, [vendors, vendorSearch]);

  const canTakeAction = !isSent && isAuthorized;

  return (
    <Card className={cn(isSent && "bg-muted/30")}>
      <CardHeader>
        <div>
          <CardTitle>RFQ Distribution</CardTitle>
          <CardDescription>
            {isSent
              ? "The RFQ has been distributed to vendors."
              : "Send the Request for Quotation to vendors to begin receiving bids."
            }
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isAuthorized && !isSent && (
          <Alert variant="default" className="border-amber-500/50">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertTitle>Read-Only Mode</AlertTitle>
            <AlertDescription>
              You do not have permission to send RFQs based on current system settings.
            </AlertDescription>
          </Alert>
        )}
        <div className="space-y-2">
          <Label>Quotation Submission Deadline</Label>
          <div className="flex gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  disabled={!canTakeAction}
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !deadlineDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {deadlineDate ? format(deadlineDate, "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={deadlineDate}
                  onSelect={setDeadlineDate}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0)) || !canTakeAction}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <Input
              type="time"
              className="w-32"
              value={deadlineTime}
              onChange={(e) => setDeadlineTime(e.target.value)}
              disabled={!canTakeAction}
            />
          </div>
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
          <Label htmlFor="cpoAmount">CPO Amount (ETB)</Label>
          <div className="relative">
            <Landmark className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="cpoAmount"
              type="number"
              placeholder="Enter required CPO amount"
              className="pl-10"
              value={cpoAmount || ''}
              onChange={(e) => setCpoAmount(Number(e.target.value))}
              disabled={!canTakeAction}
            />
          </div>
          <p className="text-xs text-muted-foreground">Optional. If set, vendors must submit a CPO of this amount to qualify.</p>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="allow-edits">Allow Quote Edits</Label>
              <Switch
                id="allow-edits"
                checked={allowQuoteEdits}
                onCheckedChange={setAllowQuoteEdits}
                disabled={!canTakeAction}
              />
            </div>
            <p className="text-xs text-muted-foreground">If enabled, vendors can edit their submitted quotes until the deadline passes.</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="experience-doc">Require Experience Document</Label>
              <Switch
                id="experience-doc"
                checked={experienceDocumentRequired}
                onCheckedChange={setExperienceDocumentRequired}
                disabled={!canTakeAction}
              />
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
                <Input
                  placeholder="Search vendors..."
                  className="pl-8 w-full"
                  value={vendorSearch}
                  onChange={(e) => setVendorSearch(e.target.value)}
                  disabled={!canTakeAction}
                />
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-60">
                <div className="space-y-4">
                  {filteredVendors.map(vendor => (
                    <div key={vendor.id} className="flex items-start space-x-4 rounded-md border p-4 has-[:checked]:bg-muted">
                      <Checkbox
                        id={`vendor-${vendor.id}`}
                        checked={selectedVendors.includes(vendor.id)}
                        onCheckedChange={(checked) => {
                          setSelectedVendors(prev =>
                            checked ? [...prev, vendor.id] : prev.filter(id => id !== vendor.id)
                          )
                        }}
                        className="mt-1"
                        disabled={!canTakeAction}
                      />
                      <div className="flex items-start gap-4 flex-1">
                        <Avatar>
                          <AvatarImage src={`https://picsum.photos/seed/${vendor.id}/40/40`} data-ai-hint="logo" />
                          <AvatarFallback>{vendor.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="grid gap-1">
                          <Label htmlFor={`vendor-${vendor.id}`} className="font-semibold cursor-pointer">
                            {vendor.name}
                          </Label>
                          <p className="text-xs text-muted-foreground">{vendor.email}</p>
                          <p className="text-xs text-muted-foreground">Contact: {vendor.contactPerson}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {filteredVendors.length === 0 && (
                    <div className="text-center text-muted-foreground py-10">
                      No vendors found matching your search.
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-4">
          <Button onClick={handleSendRFQ} disabled={isSubmitting || !deadline || !isAuthorized || isSent}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Send RFQ
          </Button>
          {isSent ? (
            <Badge variant="default" className="gap-2">
              <CheckCircle className="h-4 w-4" />
              RFQ Distributed on {format(new Date(requisition.updatedAt), 'PP')}
            </Badge>
          ) : (
            !deadline && (
              <p className="text-xs text-muted-foreground">A quotation deadline must be set.</p>
            )
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
