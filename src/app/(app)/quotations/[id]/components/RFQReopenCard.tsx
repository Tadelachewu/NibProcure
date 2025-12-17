
'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { PurchaseRequisition } from '@/lib/types';
import { cn } from '@/lib/utils';
import { format, isBefore, setHours, setMinutes } from 'date-fns';
import { Loader2, RefreshCw, CalendarIcon, AlertTriangle } from 'lucide-react';

export function RFQReopenCard({
  requisition,
  onRfqReopened
}: {
  requisition: PurchaseRequisition;
  onRfqReopened: () => void;
}) {
  const { user, token } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newDeadlineDate, setNewDeadlineDate] = useState<Date | undefined>();
  const [newDeadlineTime, setNewDeadlineTime] = useState<string>('17:00');

  const finalNewDeadline = useMemo(() => {
    if (!newDeadlineDate) return undefined;
    const [hours, minutes] = newDeadlineTime.split(':').map(Number);
    return setMinutes(setHours(newDeadlineDate, hours), minutes);
  }, [newDeadlineDate, newDeadlineTime]);

  const handleReopen = async () => {
    if (!user || !token) return;
    if (!finalNewDeadline || isBefore(finalNewDeadline, new Date())) {
      toast({ variant: 'destructive', title: 'Error', description: 'A new deadline in the future must be set.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/requisitions/${requisition.id}/reopen-rfq`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: user.id, newDeadline: finalNewDeadline }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to re-open RFQ.`);
      }
      toast({ title: 'Success', description: `The RFQ has been re-opened to new vendors.` });
      onRfqReopened();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: error instanceof Error ? error.message : 'An unknown error occurred.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-amber-500">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-600"><AlertTriangle /> Quorum Not Met</CardTitle>
        <CardDescription>
          The submission deadline has passed, but not enough quotes were submitted. You can re-open the RFQ to all other verified vendors.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>New Quotation Submission Deadline</Label>
          <div className="flex gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !newDeadlineDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {newDeadlineDate ? format(newDeadlineDate, "PPP") : <span>Pick a new date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={newDeadlineDate} onSelect={setNewDeadlineDate} disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))} initialFocus />
              </PopoverContent>
            </Popover>
            <Input type="time" className="w-32" value={newDeadlineTime} onChange={(e) => setNewDeadlineTime(e.target.value)} />
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={handleReopen} disabled={isSubmitting || !finalNewDeadline}>
          {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Re-open RFQ
        </Button>
      </CardFooter>
    </Card>
  );
};
