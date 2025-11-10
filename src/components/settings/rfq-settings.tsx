
'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../ui/card';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Button } from '../ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save } from 'lucide-react';
import { UserRole } from '@/lib/types';
import { RfqSenderSetting } from '@/contexts/auth-context';

export function RfqSettings() {
    const { allUsers, rfqSenderSetting, updateRfqSenderSetting } = useAuth();
    const { toast } = useToast();
    const [setting, setSetting] = useState<RfqSenderSetting>(rfqSenderSetting);
    const [isSaving, setIsSaving] = useState(false);

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
            });
        } catch (error) {
             toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Failed to save settings to the database.',
            });
        }
        finally {
            setIsSaving(false);
        }
    };

    const procurementRoles: UserRole[] = ['Procurement_Officer', 'Admin'];
    const procurementUsers = allUsers.filter(user => user.role && procurementRoles.includes(user.role.name as UserRole));

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
                    onValueChange={(value: 'all' | 'specific') => setSetting({ type: value, userId: value === 'all' ? null : setting.userId })}
                    className="space-y-2"
                >
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="all" id="rfq-all" />
                        <Label htmlFor="rfq-all">All Procurement Roles</Label>
                    </div>
                    <p className="pl-6 text-sm text-muted-foreground">
                        Any user with the "Procurement Officer" or "Admin" role can send RFQs.
                    </p>

                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="specific" id="rfq-specific" />
                        <Label htmlFor="rfq-specific">Specific Person</Label>
                    </div>
                     <p className="pl-6 text-sm text-muted-foreground">
                        Only one designated user can send RFQs.
                    </p>
                </RadioGroup>

                {setting.type === 'specific' && (
                    <div className="pl-6 pt-2">
                        <Label htmlFor="specific-user-select">Select a user</Label>
                        <Select
                            value={setting.userId || ''}
                            onValueChange={(userId) => setSetting({ ...setting, userId })}
                        >
                            <SelectTrigger id="specific-user-select" className="w-full md:w-1/2 mt-2">
                                <SelectValue placeholder="Select a procurement user" />
                            </SelectTrigger>
                            <SelectContent>
                                {procurementUsers.map(user => (
                                    <SelectItem key={user.id} value={user.id}>
                                        {user.name} ({user.role.name.replace(/_/g, ' ')})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
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
