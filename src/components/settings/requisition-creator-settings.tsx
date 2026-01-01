
'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../ui/card';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save } from 'lucide-react';
import { UserRole } from '@/lib/types';
import { Checkbox } from '../ui/checkbox';
import { ScrollArea } from '../ui/scroll-area';

export interface RequisitionCreatorSetting {
  type: 'all_users' | 'specific_roles';
  allowedRoles?: UserRole[];
}

export function RequisitionCreatorSettings() {
    const { settings, updateSetting, rolePermissions } = useAuth();
    const { toast } = useToast();
    const [isSaving, setIsSaving] = useState(false);
    const [setting, setSetting] = useState<RequisitionCreatorSetting>({ type: 'all_users', allowedRoles: [] });

    useEffect(() => {
        const currentSetting = settings.find(s => s.key === 'requisitionCreatorSetting');
        if (currentSetting) {
            setSetting(currentSetting.value);
        }
    }, [settings]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await updateSetting('requisitionCreatorSetting', setting);
            toast({
                title: 'Settings Saved',
                description: 'Requisition creator permissions have been updated.',
                variant: 'success',
            });
        } catch (error) {
                 const isPermissionError = error instanceof Error && error.message.includes('permission');
                 toast({
                    variant: 'destructive',
                    title: isPermissionError ? 'Permission Denied' : 'Error',
                    description: error instanceof Error ? error.message : 'Failed to save settings.',
                });
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleRoleChange = (role: UserRole, checked: boolean) => {
        setSetting(prev => {
            const currentRoles = prev.allowedRoles || [];
            const newRoles = checked
                ? [...currentRoles, role]
                : currentRoles.filter(r => r !== role);
            return { ...prev, allowedRoles: newRoles };
        });
    }

    const availableRoles = Object.keys(rolePermissions).filter(role => role !== 'Vendor') as UserRole[];

    return (
        <Card>
            <CardHeader>
                <CardTitle>Requisition Creator Permissions</CardTitle>
                <CardDescription>
                    Define which user roles are allowed to create new purchase requisitions.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <RadioGroup 
                    value={setting.type} 
                    onValueChange={(value: 'all_users' | 'specific_roles') => setSetting(prev => ({ ...prev, type: value }))}
                    className="space-y-2"
                >
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="all_users" id="req-all-users" />
                        <Label htmlFor="req-all-users">All Authenticated Users</Label>
                    </div>
                    <p className="pl-6 text-sm text-muted-foreground">
                        Any logged-in user (excluding vendors) can create a purchase requisition.
                    </p>

                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="specific_roles" id="req-specific-roles" />
                        <Label htmlFor="req-specific-roles">Specific Roles</Label>
                    </div>
                     <p className="pl-6 text-sm text-muted-foreground">
                        Only users with the selected roles below can create requisitions.
                    </p>
                </RadioGroup>

                {setting.type === 'specific_roles' && (
                    <div className="pl-6 pt-2 space-y-2">
                        <Label>Select allowed roles</Label>
                        <ScrollArea className="h-48 border rounded-md p-4">
                             <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {availableRoles.map(role => (
                                    <div key={role} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`role-${role}`}
                                            checked={setting.allowedRoles?.includes(role)}
                                            onCheckedChange={checked => handleRoleChange(role, !!checked)}
                                        />
                                        <Label htmlFor={`role-${role}`} className="font-normal">{role.replace(/_/g, ' ')}</Label>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
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
    )
}
