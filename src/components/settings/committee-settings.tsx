
'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../ui/card';
import { Button } from '../ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, PlusCircle } from 'lucide-react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

interface CommitteeConfig {
    A: {
        min: number;
        max: number;
    },
    B: {
        min: number;
        max: number;
    }
}

export function CommitteeSettings() {
    const { committeeConfig, updateCommitteeConfig } = useAuth();
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();
    
    const [localConfig, setLocalConfig] = useState<CommitteeConfig>({ A: { min: 0, max: 0}, B: { min: 0, max: 0}});

    useEffect(() => {
        if (committeeConfig) {
            setLocalConfig(JSON.parse(JSON.stringify(committeeConfig)));
        }
    }, [committeeConfig]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await updateCommitteeConfig(localConfig);
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
    
    const handleConfigChange = (committee: 'A' | 'B', field: 'min' | 'max', value: string) => {
        const newConfig = { ...localConfig };
        (newConfig[committee] as any)[field] = Number(value);
        setLocalConfig(newConfig);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Review Committee Configuration</CardTitle>
                <CardDescription>
                    Define the value thresholds for high-value (Committee A) and mid-value (Committee B) review committees.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Committee A (High-Value)</CardTitle>
                    </CardHeader>
                    <CardContent className="grid md:grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="comm-a-min">Min Amount (ETB)</Label>
                            <Input 
                                id="comm-a-min"
                                type="number" 
                                value={localConfig.A?.min || ''} 
                                onChange={(e) => handleConfigChange('A', 'min', e.target.value)} 
                            />
                        </div>
                        <div>
                            <Label htmlFor="comm-a-max">Max Amount (ETB)</Label>
                            <Input 
                                id="comm-a-max"
                                type="number" 
                                value={localConfig.A?.max || ''} 
                                onChange={(e) => handleConfigChange('A', 'max', e.target.value)}
                            />
                        </div>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Committee B (Mid-Value)</CardTitle>
                    </CardHeader>
                    <CardContent className="grid md:grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="comm-b-min">Min Amount (ETB)</Label>
                            <Input 
                                id="comm-b-min"
                                type="number" 
                                value={localConfig.B?.min || ''} 
                                onChange={(e) => handleConfigChange('B', 'min', e.target.value)} 
                            />
                        </div>
                        <div>
                            <Label htmlFor="comm-b-max">Max Amount (ETB)</Label>
                            <Input 
                                id="comm-b-max"
                                type="number" 
                                value={localConfig.B?.max || ''} 
                                onChange={(e) => handleConfigChange('B', 'max', e.target.value)}
                            />
                        </div>
                    </CardContent>
                </Card>
                 <Button variant="outline" disabled>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Add New Review Committee
                </Button>
            </CardContent>
            <CardFooter>
                 <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save Committee Settings
                </Button>
            </CardFooter>
        </Card>
    );
}
