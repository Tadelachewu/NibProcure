
'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../ui/card';
import { Button } from '../ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Users, PlusCircle } from 'lucide-react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { produce } from 'immer';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../ui/table';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '../ui/dialog';
import { UserRole } from '@/lib/types';


interface CommitteeConfig {
    [key: string]: {
        min: number;
        max: number | null;
        description: string;
    }
}

export function CommitteeSettings() {
    const { settings, updateSetting, roles } = useAuth();
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();
    
    const [localConfig, setLocalConfig] = useState<CommitteeConfig>({});

    useEffect(() => {
        const committeeSetting = settings.find(s => s.key === 'committeeConfig');
        if (committeeSetting) {
            setLocalConfig(committeeSetting.value || {});
        }
    }, [settings]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await updateSetting('committeeConfig', localConfig);
            toast({
                title: 'Settings Saved',
                description: 'Committee configurations have been updated.',
            });
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Failed to save committee configurations.',
            });
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleConfigChange = (role: string, field: 'min' | 'max' | 'description', value: string | number | null) => {
        setLocalConfig(produce(draft => {
            if (!draft[role]) {
                draft[role] = { min: 0, max: null, description: '' };
            }
            if (field === 'max') {
                (draft[role] as any)[field] = value === '' ? null : Number(value);
            } else if (field === 'min') {
                 (draft[role] as any)[field] = Number(value);
            } else {
                 (draft[role] as any)[field] = value;
            }
        }));
    };

    const reviewCommitteeRoles = roles.filter(r => r.type === 'REVIEW_COMMITTEE');

    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle>Review Committee Configuration</CardTitle>
                        <CardDescription>
                            Define the value thresholds for different review committees. These roles can then be used in the Approval Matrix.
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="border rounded-md">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Committee Role</TableHead>
                                <TableHead>Min Amount (ETB)</TableHead>
                                <TableHead>Max Amount (ETB)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {reviewCommitteeRoles.map(role => (
                                <TableRow key={role.id}>
                                    <TableCell className="font-medium">{role.name.replace(/_/g, ' ')}</TableCell>
                                    <TableCell>
                                        <Input 
                                            type="number" 
                                            value={localConfig[role.name]?.min ?? ''} 
                                            onChange={(e) => handleConfigChange(role.name, 'min', e.target.value)} 
                                            className="w-40"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Input 
                                            type="number" 
                                            placeholder="No Limit"
                                            value={localConfig[role.name]?.max ?? ''} 
                                            onChange={(e) => handleConfigChange(role.name, 'max', e.target.value)}
                                            className="w-40"
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
                {reviewCommitteeRoles.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">No Review Committee roles have been created. Go to Role Management to add one.</p>
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

    