
'use client';

import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { CalendarIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format, setHours, setMinutes } from 'date-fns';

export const NotifyVendorDialog = ({
    isOpen,
    onClose,
    onConfirm,
}: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (deadline?: Date) => void;
}) => {
    const [deadlineDate, setDeadlineDate] = useState<Date | undefined>();
    const [deadlineTime, setDeadlineTime] = useState('17:00');

    const finalDeadline = useMemo(() => {
        if (!deadlineDate) return undefined;
        const [hours, minutes] = deadlineTime.split(':').map(Number);
        return setMinutes(setHours(deadlineDate, hours), minutes);
    }, [deadlineDate, deadlineTime]);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Notify Vendor and Set Deadline</DialogTitle>
                    <DialogDescription>
                        Confirm to send the award notification. You can optionally set a new response deadline for the vendor.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-2">
                    <Label>Vendor Response Deadline (Optional)</Label>
                    <div className="flex gap-2">
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant={"outline"}
                                    className={cn("w-full justify-start text-left font-normal", !deadlineDate && "text-muted-foreground")}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {deadlineDate ? format(deadlineDate, "PPP") : <span>Set a new deadline</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar
                                    mode="single"
                                    selected={deadlineDate}
                                    onSelect={setDeadlineDate}
                                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                                    initialFocus
                                />
                            </PopoverContent>
                        </Popover>
                        <Input
                            type="time"
                            className="w-32"
                            value={deadlineTime}
                            onChange={(e) => setDeadlineTime(e.target.value)}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button onClick={() => onConfirm(finalDeadline)}>Confirm & Notify</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
