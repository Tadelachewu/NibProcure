
'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../ui/card';
import { Button } from '../ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Users, PlusCircle } from 'lucide-react';
import { User, UserRole } from '@/lib/types';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { ScrollArea } from '../ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogTrigger,
} from '@/components/ui/dialog';

interface CommitteeConfig {
    [key: string]: {
        min: number;
        max: number;
    }
}

export function CommitteeSettings() {
    const { allUsers, committeeConfig, updateCommitteeConfig, fetchAllUsers, fetchAllSettings } = useAuth();
    const { toast } = useToast();
    const [roles, setRoles] = useState<{ id: string; name: string; type: string }[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [localConfig, setLocalConfig] = useState<CommitteeConfig>({});
    const [isAddCommitteeOpen, setAddCommitteeOpen] = useState(false);
    const [newCommitteeName, setNewCommitteeName] = useState('');
    const { user: actor } = useAuth();

    const fetchRoles = async () => {
        setIsLoading(true);
        try {
            const rolesRes = await fetch('/api/roles');
            const rolesData = await rolesRes.json();
            setRoles(rolesData);
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to load roles data.'});
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchRoles();
        fetchAllUsers();
    }, []);

    useEffect(() => {
        setLocalConfig(committeeConfig || {});
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

    const handleAddCommittee = async () => {
        if (!newCommitteeName.trim()) {
            toast({variant: 'destructive', title: 'Error', description: 'Committee identifier is required.'});
            return;
        }
        if (!actor) return;

        setIsLoading(true);
        const roleName = `Committee_${newCommitteeName.trim().toUpperCase()}_Member`;

        try {
            const response = await fetch('/api/roles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: roleName, description: `Member of the ${newCommitteeName} review committee.`, actorUserId: actor.id })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to create new committee role.');
            }
            toast({title: 'Committee Role Created', description: `Successfully created the ${roleName.replace(/_/g, ' ')} role.`});
            setNewCommitteeName('');
            setAddCommitteeOpen(false);
            await fetchRoles(); // Refresh roles list
            await fetchAllSettings(); // This will refresh permissions context
        } catch (error) {
            toast({variant: 'destructive', title: 'Error', description: error instanceof Error ? error.message : 'An unknown error occurred.'});
        } finally {
            setIsLoading(false);
        }
    };
    
    const reviewCommitteeRoles = roles
        .filter(r => r.name.startsWith('Committee_') && r.name.endsWith('_Member'))
        .sort((a, b) => a.name.localeCompare(b.name));

    const renderCommitteeSection = (role: UserRole) => {
        const committeeKey = role;
        if (!localConfig) {
            return <Card><CardHeader><CardTitle>Loading...</CardTitle></CardHeader><CardContent><Loader2 className="animate-spin" /></CardContent></Card>;
        }
        
        const members = allUsers.filter(u => u.role === role);

        return (
            <Card key={committeeKey}>
                <CardHeader>
                    <CardTitle>{role.replace(/_/g, ' ')}</CardTitle>
                    <CardDescription>
                        Configure value thresholds and view members for this committee.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                             <Label>Min Review Amount (ETB)</Label>
                             <Input type="number" value={localConfig[committeeKey]?.min || ''} onChange={(e) => setLocalConfig(prev => ({...prev, [committeeKey]: {...prev[committeeKey], min: Number(e.target.value)}}))} />
                        </div>
                         <div>
                             <Label>Max Review Amount (ETB)</Label>
                             <Input type="number" placeholder="No limit" value={localConfig[committeeKey]?.max || ''} onChange={(e) => setLocalConfig(prev => ({...prev, [committeeKey]: {...prev[committeeKey], max: e.target.value === '' ? null : Number(e.target.value)}}))} />
                        </div>
                    </div>
                    <div className="space-y-2 pt-4">
                         <h4 className="font-semibold flex items-center gap-2"><Users /> Current Members</h4>
                         <ScrollArea className="h-40 border rounded-md p-2">
                            {members.length > 0 ? members.map(user => (
                                <div key={user.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted">
                                     <div className="flex items-center gap-3">
                                        <Avatar className="h-8 w-8"><AvatarImage src={`https://picsum.photos/seed/${user.id}/32/32`} /><AvatarFallback>{user.name.charAt(0)}</AvatarFallback></Avatar>
                                        <div>
                                            <p className="text-sm font-medium">{user.name}</p>
                                            <p className="text-xs text-muted-foreground">{user.department}</p>
                                        </div>
                                    </div>
                                </div>
                            )) : <p className="text-sm text-muted-foreground text-center py-4">No members assigned. Assign users to this role in User Management.</p>}
                         </ScrollArea>
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="space-y-6">
            {isLoading ? <Loader2 className="animate-spin" /> : reviewCommitteeRoles.map(role => renderCommitteeSection(role.name as UserRole))}
            <div className="flex justify-between items-center pt-4 border-t">
                <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save All Changes
                </Button>
                <Dialog open={isAddCommitteeOpen} onOpenChange={setAddCommitteeOpen}>
                    <DialogTrigger asChild>
                        <Button variant="outline">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Add New Review Committee
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Create New Review Committee</DialogTitle>
                            <DialogDescription>This will create a new user role for the committee (e.g., "Committee C Member").</DialogDescription>
                        </DialogHeader>
                        <div className="py-4">
                            <Label htmlFor="committee-name">Committee Identifier (e.g., "C", "Special Project")</Label>
                            <Input 
                                id="committee-name"
                                value={newCommitteeName}
                                onChange={e => setNewCommitteeName(e.target.value)}
                                placeholder="C"
                            />
                        </div>
                        <DialogFooter>
                            <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                            <Button onClick={handleAddCommittee} disabled={isLoading}>
                                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                                Create Committee Role
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}
