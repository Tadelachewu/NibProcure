
'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../ui/card';
import { Button } from '../ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, PlusCircle, Trash2, ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { ApprovalStep, ApprovalThreshold, UserRole } from '@/lib/types';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Reorder } from 'framer-motion';
import { produce } from 'immer';

export function ApprovalMatrixEditor() {
    const { approvalThresholds, updateApprovalThresholds, committeeConfig, rolePermissions } = useAuth();
    const [localThresholds, setLocalThresholds] = useState<ApprovalThreshold[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        setLocalThresholds(JSON.parse(JSON.stringify(approvalThresholds)));
    }, [approvalThresholds]);

    const handleSave = async () => {
        setIsSaving(true);
        
        // --- START VALIDATION LOGIC ---
        const sortedThresholds = [...localThresholds].sort((a, b) => a.min - b.min);

        for (let i = 0; i < sortedThresholds.length; i++) {
            const tier = sortedThresholds[i];

            // Basic range validation
            if (tier.max !== null && tier.min > tier.max) {
                toast({ variant: 'destructive', title: 'Invalid Range', description: `In tier "${tier.name}", the minimum value cannot be greater than the maximum.`});
                setIsSaving(false);
                return;
            }

            // Check for overlaps and gaps with the previous tier
            if (i > 0) {
                const prevTier = sortedThresholds[i - 1];
                if (prevTier.max === null) {
                    toast({ variant: 'destructive', title: 'Invalid Configuration', description: `Tier "${prevTier.name}" has no maximum value but is not the last tier.`});
                    setIsSaving(false);
                    return;
                }
                if (tier.min <= prevTier.max) {
                    toast({ variant: 'destructive', title: 'Overlapping Tiers', description: `Tier "${tier.name}" (starts at ${tier.min.toLocaleString()}) overlaps with tier "${prevTier.name}" (ends at ${prevTier.max.toLocaleString()}).`});
                    setIsSaving(false);
                    return;
                }
                 if (tier.min !== prevTier.max + 1) {
                    toast({ variant: 'destructive', title: 'Gap Detected', description: `There is a gap between tier "${prevTier.name}" (ends at ${prevTier.max.toLocaleString()}) and tier "${tier.name}" (starts at ${tier.min.toLocaleString()}). Tiers must be continuous.`});
                    setIsSaving(false);
                    return;
                }
            } else {
                 if (tier.min !== 0) {
                    toast({ variant: 'destructive', title: 'Invalid Start', description: `The first tier ("${tier.name}") must start at 0.`});
                    setIsSaving(false);
                    return;
                }
            }


            // Committee range validation
            for (const step of tier.steps) {
                const match = step.role.match(/Committee_(\w+)_Member/);
                if (match) {
                    const committeeKey = match[1];
                     if (committeeKey && committeeConfig[committeeKey]) {
                        const committeeRange = committeeConfig[committeeKey];
                        const tierMax = tier.max ?? Infinity;

                        if (tierMax < committeeRange.min) {
                            toast({ 
                                variant: 'destructive', 
                                title: 'Configuration Conflict', 
                                description: `Tier "${tier.name}" (max value: ${tierMax.toLocaleString()}) is too low for Committee ${committeeKey}, which reviews items starting at ${committeeRange.min.toLocaleString()} ETB.`,
                                duration: 10000,
                            });
                            setIsSaving(false);
                            return;
                        }
                    }
                }
            }
        }
        // --- END VALIDATION LOGIC ---

        await updateApprovalThresholds(localThresholds);
        toast({
            title: 'Settings Saved',
            description: 'Approval matrix has been updated.',
        });
        setIsSaving(false);
    };

    const handleThresholdChange = (id: string, field: 'min' | 'max' | 'name', value: string | number | null) => {
        setLocalThresholds(produce(draft => {
            const threshold = draft.find(t => t.id === id);
            if (threshold) {
                (threshold as any)[field] = value;
            }
        }));
    };

    const addThreshold = () => {
        const newId = `tier-${Date.now()}`;
        setLocalThresholds(produce(draft => {
            const highestMax = Math.max(...draft.filter(t => t.max !== null).map(t => t.max as number), -1);
            draft.push({ id: newId, name: 'New Tier', min: highestMax + 1, max: null, steps: [] });
        }));
    };

    const removeThreshold = (id: string) => {
        setLocalThresholds(prev => prev.filter(t => t.id !== id));
    };

    const handleStepChange = (thresholdId: string, stepIndex: number, newRole: UserRole) => {
         setLocalThresholds(produce(draft => {
            const threshold = draft.find(t => t.id === thresholdId);
            if (threshold) {
                threshold.steps[stepIndex].role = newRole;
            }
        }));
    };

    const addStep = (thresholdId: string) => {
        setLocalThresholds(produce(draft => {
            const threshold = draft.find(t => t.id === thresholdId);
            if (threshold) {
                threshold.steps.push({ role: 'Approver' });
            }
        }));
    };

    const removeStep = (thresholdId: string, stepIndex: number) => {
        setLocalThresholds(produce(draft => {
            const threshold = draft.find(t => t.id === thresholdId);
            if (threshold) {
                threshold.steps.splice(stepIndex, 1);
            }
        }));
    };
    
    const reorderSteps = (thresholdId: string, newOrder: ApprovalStep[]) => {
       setLocalThresholds(produce(draft => {
            const threshold = draft.find(t => t.id === thresholdId);
            if (threshold) {
                threshold.steps = newOrder.map((step, index) => ({...step, order: index}));
            }
        }));
    };

    const availableRoles = Object.keys(rolePermissions).filter(r => r !== 'Vendor' && r !== 'Requester');

    return (
        <Card>
            <CardHeader>
                <CardTitle>Approval Matrix</CardTitle>
                <CardDescription>
                    Define the approval chains for different procurement value thresholds.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {[...localThresholds].sort((a,b) => a.min - b.min).map(threshold => (
                    <Card key={threshold.id} className="p-4">
                        <div className="flex justify-between items-start">
                             <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <Label>Tier Name</Label>
                                    <Input value={threshold.name} onChange={(e) => handleThresholdChange(threshold.id, 'name', e.target.value)} />
                                </div>
                                 <div>
                                    <Label>Min Amount (ETB)</Label>
                                    <Input type="number" value={threshold.min} onChange={(e) => handleThresholdChange(threshold.id, 'min', Number(e.target.value))} />
                                </div>
                                 <div>
                                    <Label>Max Amount (ETB)</Label>
                                    <Input type="number" placeholder="No limit" value={threshold.max ?? ''} onChange={(e) => handleThresholdChange(threshold.id, 'max', e.target.value === '' ? null : Number(e.target.value))} />
                                </div>
                             </div>
                            <Button variant="ghost" size="icon" onClick={() => removeThreshold(threshold.id)} className="ml-4"><Trash2 className="h-4 w-4"/></Button>
                        </div>
                        <div className="mt-4 pl-4 border-l-2">
                             <h4 className="mb-2 font-medium text-sm">Approval Steps</h4>
                             <Reorder.Group axis="y" values={threshold.steps} onReorder={(newOrder) => reorderSteps(threshold.id, newOrder)} className="space-y-2">
                                {threshold.steps.map((step, index) => (
                                    <Reorder.Item key={step.id || `step-${index}`} value={step} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                                        <GripVertical className="cursor-grab text-muted-foreground" />
                                        <span className="font-mono text-xs">{index + 1}.</span>
                                        <Select value={step.role} onValueChange={(role: UserRole) => handleStepChange(threshold.id, index, role)}>
                                            <SelectTrigger><SelectValue/></SelectTrigger>
                                            <SelectContent>
                                                {availableRoles.map(r => <SelectItem key={r} value={r}>{r.replace(/_/g, ' ')}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                        <Button variant="ghost" size="icon" onClick={() => removeStep(threshold.id, index)}><Trash2 className="h-4 w-4"/></Button>
                                    </Reorder.Item>
                                ))}
                            </Reorder.Group>
                            <Button variant="outline" size="sm" onClick={() => addStep(threshold.id)} className="mt-2"><PlusCircle className="mr-2"/>Add Step</Button>
                        </div>
                    </Card>
                ))}
                 <Button variant="secondary" onClick={addThreshold}><PlusCircle className="mr-2"/>Add New Approval Tier</Button>
            </CardContent>
            <CardFooter>
                <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save Approval Matrix
                </Button>
            </CardFooter>
        </Card>
    );
}
