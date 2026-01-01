
'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../ui/card';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Users, Check, ChevronsUpDown } from 'lucide-react';
import { UserRole } from '@/lib/types';
import { RfqSenderSetting } from '@/contexts/auth-context';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '../ui/command';
import { Badge } from '../ui/badge';
import { cn } from '@/lib/utils';
import { ScrollArea } from '../ui/scroll-area';

export function RfqSettings() {
    const { allUsers, rfqSenderSetting, updateRfqSenderSetting } = useAuth();
    const { toast } = useToast();
    const [setting, setSetting] = useState<RfqSenderSetting>(rfqSenderSetting);
    const [isSaving, setIsSaving] = useState(false);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        setSetting(rfqSenderSetting);
    }, [rfqSenderSetting]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await updateRfqSenderSetting(setting);
            toast({
                title: 'Settings Saved',
                description: 'RFQ sender configuration has been updated.',
                variant: 'success',
            });
        } catch (error) {
             const isPermissionError = error instanceof Error && error.message.includes('permission');
             toast({
                variant: 'destructive',
                title: isPermissionError ? 'Permission Denied' : 'Error',
                description: error instanceof Error ? error.message : 'Failed to save settings.',
            });
        }
        finally {
            setIsSaving(false);
        }
    };

    const procurementRoles: UserRole[] = ['Procurement_Officer', 'Admin'];
    const procurementUsers = allUsers.filter(user => 
        Array.isArray(user.roles) && user.roles.some(role => procurementRoles.includes((role as any).name))
    );

    const handleUserSelection = (userId: string) => {
        setSetting(prev => {
            const currentIds = prev.userIds || [];
            const newIds = currentIds.includes(userId)
                ? currentIds.filter(id => id !== userId)
                : [...currentIds, userId];
            return { ...prev, userIds: newIds };
        })
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>RFQ Sender Configuration</CardTitle>
                <CardDescription>
                    Define who has the permission to send Requests for Quotation (RFQs) to vendors.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <RadioGroup 
                    value={setting.type} 
                    onValueChange={(value: 'all' | 'specific' | 'assigned') => setSetting({ type: value, userIds: value === 'all' ? [] : setting.userIds })}
                    className="space-y-2"
                >
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="all" id="rfq-all" />
                        <Label htmlFor="rfq-all">All Procurement Officers</Label>
                    </div>
                    <p className="pl-6 text-sm text-muted-foreground">
                        Any user with the "Procurement Officer" role can send RFQs.
                    </p>

                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="specific" id="rfq-specific" />
                        <Label htmlFor="rfq-specific">Specific People</Label>
                    </div>
                     <p className="pl-6 text-sm text-muted-foreground">
                        Only designated users can send RFQs.
                    </p>

                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="assigned" id="rfq-assigned" />
                        <Label htmlFor="rfq-assigned">Assigned by Procurement Team</Label>
                    </div>
                    <p className="pl-6 text-sm text-muted-foreground">
                        The procurement manager will assign who sends RFQs on a per-requisition basis.
                    </p>
                </RadioGroup>

                {setting.type === 'specific' && (
                    <div className="pl-6 pt-2">
                        <Label>Select designated users</Label>
                        <Popover open={open} onOpenChange={setOpen}>
                            <PopoverTrigger asChild>
                                <Button variant="outline" role="combobox" aria-expanded={open} className="w-full md:w-1/2 justify-between mt-2">
                                    <div className="flex gap-1 flex-wrap">
                                        {(setting.userIds && setting.userIds.length > 0)
                                            ? setting.userIds.map(id => {
                                                const user = procurementUsers.find(u => u.id === id);
                                                return <Badge key={id} variant="secondary">{user?.name || 'Unknown'}</Badge>;
                                            })
                                            : "Select users..."}
                                    </div>
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                <Command>
                                    <CommandInput placeholder="Search users..." />
                                    <CommandEmpty>No users found.</CommandEmpty>
                                    <ScrollArea className="h-48">
                                        <CommandGroup>
                                            {procurementUsers.map(user => (
                                                <CommandItem
                                                    key={user.id}
                                                    onSelect={() => handleUserSelection(user.id)}
                                                >
                                                    <Check className={cn("mr-2 h-4 w-4", setting.userIds?.includes(user.id) ? "opacity-100" : "opacity-0")} />
                                                    {user.name}
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </ScrollArea>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>
                )}
            </CardContent>
            <CardFooter>
                <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save Changes
                </Button>
            </CardFooter>
        </Card>
    );
}
