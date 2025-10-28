
'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../ui/card';
import { Button } from '../ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save } from 'lucide-react';
import { Input } from '../ui/input';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../ui/table';
import { RoleType } from '@/lib/types';

interface CommitteeConfig {
    [key: string]: {
        min: number;
        max: number | null;
    }
}

interface Role {
    id: string;
    name: string;
    description: string;
    type: RoleType;
}


export function CommitteeSettings() {
    const { settings, updateSetting } = useAuth();
    const [roles, setRoles] = useState<Role[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const { toast } = useToast();
    
    const [localConfig, setLocalConfig] = useState<CommitteeConfig>({});

    useEffect(() => {
        const committeeSetting = settings.find(s => s.key === 'committeeConfig');
        if (committeeSetting) {
            setLocalConfig(committeeSetting.value || {});
        }
    }, [settings]);

    useEffect(() => {
        const fetchRoles = async () => {
            setIsLoading(true);
            try {
                const response = await fetch('/api/roles');
                if (!response.ok) throw new Error('Failed to fetch roles');
                const data = await response.json();
                setRoles(data);
            } catch (error) {
                toast({ variant: 'destructive', title: 'Error', description: 'Could not load roles.' });
            } finally {
                setIsLoading(false);
            }
        };
        fetchRoles();
    }, [toast]);


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
    
    const handleConfigChange = (role: string, field: 'min' | 'max', value: string | number | null) => {
        const newConfig = { ...localConfig };
        if (!newConfig[role]) {
            newConfig[role] = { min: 0, max: null };
        }
        if (field === 'max') {
            (newConfig[role] as any)[field] = value === '' ? null : Number(value);
        } else {
             (newConfig[role] as any)[field] = Number(value);
        }
        setLocalConfig(newConfig);
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
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={3} className="h-24 text-center">
                                        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                                    </TableCell>
                                </TableRow>
                            ) : reviewCommitteeRoles.length > 0 ? (
                                reviewCommitteeRoles.map(role => (
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
                                ))
                            ) : (
                                 <TableRow>
                                    <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                                        No "Review Committee" type roles found. Go to Role Management to create one.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
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
