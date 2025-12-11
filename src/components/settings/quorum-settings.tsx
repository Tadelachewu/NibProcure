
'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../ui/card';
import { Button } from '../ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Users, FileBadge } from 'lucide-react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

export function QuorumSettings() {
    const { settings, updateSetting } = useAuth();
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();
    
    const [rfqQuorum, setRfqQuorum] = useState<number>(3);
    const [committeeQuorum, setCommitteeQuorum] = useState<number>(3);
    const storageKey = 'quorum-settings-form';


    useEffect(() => {
        const savedData = localStorage.getItem(storageKey);
        if(savedData) {
            try {
                const parsed = JSON.parse(savedData);
                setRfqQuorum(parsed.rfqQuorum);
                setCommitteeQuorum(parsed.committeeQuorum);
                toast({ title: 'Draft Restored', description: 'Your unsaved quorum settings have been restored.'});
            } catch(e) { console.error(e) }
        } else {
            const rfqSetting = settings.find(s => s.key === 'rfqQuorum');
            const committeeSetting = settings.find(s => s.key === 'committeeQuorum');
            if (rfqSetting) setRfqQuorum(Number(rfqSetting.value));
            if (committeeSetting) setCommitteeQuorum(Number(committeeSetting.value));
        }
    }, [settings, toast]);
    
    useEffect(() => {
        localStorage.setItem(storageKey, JSON.stringify({ rfqQuorum, committeeQuorum }));
    }, [rfqQuorum, committeeQuorum]);


    const handleSave = async () => {
        setIsSaving(true);
        try {
            await Promise.all([
                updateSetting('rfqQuorum', rfqQuorum),
                updateSetting('committeeQuorum', committeeQuorum),
            ]);
            localStorage.removeItem(storageKey);
            toast({
                title: 'Settings Saved',
                description: 'Quorum configurations have been updated.',
            });
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Failed to save quorum settings.',
            });
        } finally {
            setIsSaving(false);
        }
    };
    
    return (
        <Card>
            <CardHeader>
                <CardTitle>Quorum &amp; Threshold Settings</CardTitle>
                <CardDescription>
                    Set minimum participation levels for key procurement stages.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-6 items-start">
                    <div className="space-y-2">
                        <Label htmlFor="rfq-quorum" className="flex items-center gap-2"><Users /> Minimum Vendors for RFQ</Label>
                        <Input 
                            id="rfq-quorum"
                            type="number" 
                            value={rfqQuorum}
                            onChange={(e) => setRfqQuorum(Number(e.target.value))}
                            min="1"
                        />
                        <p className="text-sm text-muted-foreground">
                            The minimum number of specific vendors required to send an RFQ.
                        </p>
                    </div>
                    <div className="space-y-2">
                         <Label htmlFor="committee-quorum" className="flex items-center gap-2"><FileBadge /> Minimum Quotes for Committee Assignment</Label>
                         <Input 
                            id="committee-quorum"
                            type="number" 
                            value={committeeQuorum}
                            onChange={(e) => setCommitteeQuorum(Number(e.target.value))}
                            min="1"
                         />
                         <p className="text-sm text-muted-foreground">
                            The minimum number of submitted quotes required to enable the committee assignment stage.
                        </p>
                    </div>
                </div>
            </CardContent>
            <CardFooter>
                 <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save Quorum Settings
                </Button>
            </CardFooter>
        </Card>
    )
}
