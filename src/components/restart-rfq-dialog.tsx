
'use client';

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from './ui/button';
import { useAuth } from '@/contexts/auth-context';
import { PurchaseRequisition, Vendor } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useState, useMemo } from 'react';
import { Loader2, RefreshCw, CalendarIcon, Search } from 'lucide-react';
import { Label } from './ui/label';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';
import { cn } from '@/lib/utils';
import { format, setHours, setMinutes } from 'date-fns';
import { Input } from './ui/input';
import { Checkbox } from './ui/checkbox';
import { ScrollArea } from './ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Card, CardContent } from './ui/card';

export function RestartRfqDialog({
    requisition,
    vendors = [],
    onRfqRestarted
}: {
    requisition: PurchaseRequisition;
    vendors: Vendor[];
    onRfqRestarted: () => void;
}) {
    const { user, token } = useAuth();
    const { toast } = useToast();
    const [isOpen, setOpen] = useState(false);
    const [isSubmitting, setSubmitting] = useState(false);
    const [deadlineDate, setDeadlineDate] = useState<Date|undefined>();
    const [deadlineTime, setDeadlineTime] = useState('17:00');
    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
    const [vendorSearch, setVendorSearch] = useState('');

    const deadline = useMemo(() => {
        if (!deadlineDate) return undefined;
        const [hours, minutes] = deadlineTime.split(':').map(Number);
        return setMinutes(setHours(deadlineDate, hours), minutes);
    }, [deadlineDate, deadlineTime]);
    
    const failedItems = useMemo(() => {
        if (!requisition?.items) return [];
        return requisition.items.filter(item => 
            (item.perItemAwardDetails || []).some(d => d.status === 'Declined' || d.status === 'Failed_to_Award') &&
            !(item.perItemAwardDetails || []).some(d => d.status === 'Accepted')
        );
    }, [requisition]);

    const handleSubmit = async () => {
        if (!user || !token || !deadline || selectedItems.length === 0 || selectedVendors.length === 0) {
            toast({ variant: 'destructive', title: 'Error', description: 'Please select items, vendors, and set a new deadline.' });
            return;
        }

        setSubmitting(true);
        try {
            const response = await fetch(`/api/requisitions/restart-item-rfq`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    originalRequisitionId: requisition.id,
                    itemIds: selectedItems,
                    vendorIds: selectedVendors,
                    newDeadline: deadline,
                    actorUserId: user.id
                }),
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Failed to restart RFQ.');
            }
            toast({ title: 'Success', description: `A new RFQ has been created for the failed items (ID: ${result.newRequisitionId}).`});
            setOpen(false);
            onRfqRestarted();
        } catch(error) {
            toast({ variant: 'destructive', title: 'Error', description: error instanceof Error ? error.message : 'An unknown error occurred.'});
        } finally {
            setSubmitting(false);
        }
    };
    
    const filteredVendors = useMemo(() => {
        const lowercasedSearch = vendorSearch.toLowerCase();
        return vendors.filter(v => v.kycStatus === 'Verified' && v.name.toLowerCase().includes(lowercasedSearch));
    }, [vendors, vendorSearch]);


    if (failedItems.length === 0) {
        return null; // Don't render the button if there are no failed items to restart
    }

    return (
        <Dialog open={isOpen} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="destructive">
                    <RefreshCw className="mr-2 h-4 w-4" /> Restart RFQ for Failed Items
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Restart RFQ Process for Failed Items</DialogTitle>
                    <DialogDescription>
                        Create a new, targeted RFQ for items that were declined or failed to be awarded from requisition {requisition.id}.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto space-y-6 pr-2">
                    {/* Item Selection */}
                    <div>
                        <Label className="text-base font-semibold">1. Select Items to Re-Tender</Label>
                        <Card className="mt-2">
                            <CardContent className="p-4 space-y-2">
                                {failedItems.map(item => (
                                    <div key={item.id} className="flex items-center space-x-2 p-2 rounded-md has-[:checked]:bg-muted">
                                        <Checkbox 
                                            id={`item-${item.id}`}
                                            checked={selectedItems.includes(item.id)}
                                            onCheckedChange={(checked) => setSelectedItems(prev => checked ? [...prev, item.id] : prev.filter(id => id !== item.id))}
                                        />
                                        <Label htmlFor={`item-${item.id}`} className="font-normal">{item.name}</Label>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Vendor Selection */}
                    <div>
                        <Label className="text-base font-semibold">2. Select Vendors to Notify</Label>
                        <Card className="mt-2">
                            <CardContent className="p-4">
                                <Input placeholder="Search vendors..." value={vendorSearch} onChange={e => setVendorSearch(e.target.value)} className="mb-4" />
                                <ScrollArea className="h-48">
                                    <div className="space-y-2">
                                        {filteredVendors.map(vendor => (
                                            <div key={vendor.id} className="flex items-center space-x-3 p-2 has-[:checked]:bg-muted rounded-md">
                                                <Checkbox
                                                    id={`vendor-${vendor.id}`}
                                                    checked={selectedVendors.includes(vendor.id)}
                                                    onCheckedChange={(checked) => setSelectedVendors(prev => checked ? [...prev, vendor.id] : prev.filter(id => id !== vendor.id))}
                                                />
                                                 <Avatar className="h-8 w-8">
                                                    <AvatarImage src={`https://picsum.photos/seed/${vendor.id}/32/32`} />
                                                    <AvatarFallback>{vendor.name.charAt(0)}</AvatarFallback>
                                                </Avatar>
                                                <Label htmlFor={`vendor-${vendor.id}`} className="font-normal flex-1">{vendor.name}</Label>
                                            </div>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    </div>
                    
                    {/* Deadline */}
                    <div>
                        <Label className="text-base font-semibold">3. Set New Deadline</Label>
                         <div className="flex gap-2 mt-2">
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn("w-full justify-start text-left font-normal", !deadlineDate && "text-muted-foreground")}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {deadlineDate ? format(deadlineDate, "PPP") : <span>Pick a submission date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar mode="single" selected={deadlineDate} onSelect={setDeadlineDate} disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))} initialFocus />
                                </PopoverContent>
                            </Popover>
                            <Input type="time" className="w-32" value={deadlineTime} onChange={(e) => setDeadlineTime(e.target.value)} />
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                    <Button onClick={handleSubmit} disabled={isSubmitting || !deadline || selectedItems.length === 0 || selectedVendors.length === 0}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Create New RFQ
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
