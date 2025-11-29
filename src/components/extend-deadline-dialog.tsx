
'use client';

import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { Loader2, CalendarIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';
import { cn } from '@/lib/utils';
import { format, isBefore, setHours, setMinutes } from 'date-fns';
import { User, PurchaseRequisition } from '@/lib/types';

export const ExtendDeadlineDialog = ({ isOpen, onClose, member, requisition, onSuccess }: { isOpen: boolean, onClose: () => void, member: User, requisition: PurchaseRequisition, onSuccess: () => void }) => {
    const { toast } = useToast();
    const { user } = useAuth();
    const [isSubmitting, setSubmitting] = useState(false);
    const [newDeadline, setNewDeadline] = useState<Date|undefined>();
    const [newDeadlineTime, setNewDeadlineTime] = useState('17:00');

    const finalNewDeadline = useMemo(() => {
        if (!newDeadline) return undefined;
        const [hours, minutes] = newDeadlineTime.split(':').map(Number);
        return setMinutes(setHours(newDeadline, hours), minutes);
    }, [newDeadline, newDeadlineTime]);
    
    const handleSubmit = async () => {
        if (!user || !finalNewDeadline) return;
        if (isBefore(finalNewDeadline, new Date())) {
            toast({ variant: 'destructive', title: 'Error', description: 'The new deadline must be in the future.' });
            return;
        }

        setSubmitting(true);
        try {
            const response = await fetch(`/api/requisitions/${requisition.id}/extend-scoring-deadline`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, newDeadline: finalNewDeadline })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to extend deadline.');
            }

            toast({ title: 'Success', description: 'Scoring deadline has been extended for all committee members.' });
            onSuccess();
            onClose();

        } catch (error) {
             toast({ variant: 'destructive', title: 'Error', description: error instanceof Error ? error.message : 'An unknown error occurred.',});
        } finally {
            setSubmitting(false);
        }
    }


    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Extend Scoring Deadline</DialogTitle>
                    <DialogDescription>Set a new scoring deadline for all committee members of this requisition.</DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    <div className="space-y-2">
                        <Label>New Scoring Deadline</Label>
                        <div className="flex gap-2">
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !newDeadline && "text-muted-foreground")}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {newDeadline ? format(newDeadline, "PPP") : <span>Pick a date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={newDeadline} onSelect={setNewDeadline} initialFocus disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))} /></PopoverContent>
                            </Popover>
                             <Input type="time" className="w-32" value={newDeadlineTime} onChange={(e) => setNewDeadlineTime(e.target.value)} />
                        </div>
                    </div>
                </div>
                 <DialogFooter>
                    <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                    <Button onClick={handleSubmit} disabled={isSubmitting || !finalNewDeadline}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Confirm Extension
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
