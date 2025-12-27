
'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../ui/card';
import { Button } from '../ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Users, Search, UserX, UserCheck, PlusCircle } from 'lucide-react';
import { User, UserRole, Department } from '@/lib/types';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';

interface CommitteeConfig {
    [key: string]: {
        min: number;
        max: number | null;
    }
}

export function CommitteeSettings() {
    const { allUsers, fetchAllUsers, committeeConfig, updateCommitteeConfig, fetchAllSettings } = useAuth();
    const { toast } = useToast();
    const [isSaving, setIsSaving] = useState(false);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [searchTerms, setSearchTerms] = useState<Record<string, string>>({});
    const [departmentFilters, setDepartmentFilters] = useState<Record<string, string>>({});
    const [localConfig, setLocalConfig] = useState<CommitteeConfig>(committeeConfig);
    const [isAddCommitteeOpen, setAddCommitteeOpen] = useState(false);
    const [newCommitteeName, setNewCommitteeName] = useState('');
    const { user: actor } = useAuth();
    const storageKey = 'committee-settings-form';

    useEffect(() => {
        const savedData = localStorage.getItem(storageKey);
        if (savedData) {
            try {
                const parsed = JSON.parse(savedData);
                if(Object.keys(parsed).length > 0) {
                    setLocalConfig(parsed);
                    toast({ title: 'Draft Restored', description: 'Your unsaved changes to committee settings have been restored.'});
                } else {
                    setLocalConfig(committeeConfig);
                }
            } catch (e) {
                console.error("Failed to parse committee settings data", e);
                setLocalConfig(committeeConfig);
            }
        } else {
            setLocalConfig(committeeConfig);
        }
        
        const initialSearchs: Record<string, string> = {};
        const initialFilters: Record<string, string> = {};
        Object.keys(committeeConfig).forEach(key => {
            initialSearchs[key] = '';
            initialFilters[key] = 'all';
        });
        setSearchTerms(initialSearchs);
        setDepartmentFilters(initialFilters);
    }, [committeeConfig, toast]);

    useEffect(() => {
        if(Object.keys(localConfig).length > 0) {
            localStorage.setItem(storageKey, JSON.stringify(localConfig));
        }
    }, [localConfig]);


    useEffect(() => {
        const fetchDepts = async () => {
            try {
                const res = await fetch('/api/departments');
                const data = await res.json();
                setDepartments(data);
            } catch (e) {
                console.error("Failed to fetch departments", e);
            }
        };
        fetchDepts();
        fetchAllUsers();
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        
        // --- Validation Logic ---
        const sortedCommitteeKeys = Object.keys(localConfig).sort((a,b) => localConfig[a].min - localConfig[b].min);
        for(let i=0; i < sortedCommitteeKeys.length; i++) {
            const key = sortedCommitteeKeys[i];
            const committee = localConfig[key];

            // Basic range validation
            if (committee.max !== null && committee.min > committee.max) {
                 toast({ variant: 'destructive', title: 'Invalid Range', description: `In Committee ${key}, the minimum value cannot be greater than the maximum.`});
                 setIsSaving(false);
                 return;
            }
            
            // Check for overlaps and gaps with the previous tier
            if (i > 0) {
                const prevKey = sortedCommitteeKeys[i-1];
                const prevCommittee = localConfig[prevKey];
                if (prevCommittee.max === null) {
                    toast({ variant: 'destructive', title: 'Invalid Configuration', description: `Committee ${prevKey} has no maximum value but is not the last committee.`});
                    setIsSaving(false);
                    return;
                }
                if (committee.min <= prevCommittee.max) {
                    toast({ variant: 'destructive', title: 'Overlapping Ranges', description: `Committee ${key}'s range (starts at ${committee.min.toLocaleString()}) overlaps with Committee ${prevKey}'s range (ends at ${prevCommittee.max.toLocaleString()}).`});
                    setIsSaving(false);
                    return;
                }
                 if (committee.min !== prevCommittee.max + 1) {
                    toast({ variant: 'destructive', title: 'Gap Detected', description: `There is a gap between Committee ${prevKey}'s range (ends at ${prevCommittee.max.toLocaleString()}) and Committee ${key}'s range (starts at ${committee.min.toLocaleString()}). Ranges must be continuous.`});
                    setIsSaving(false);
                    return;
                }
            }
        }
        // --- End Validation ---

        try {
            await updateCommitteeConfig(localConfig);
            localStorage.removeItem(storageKey);
            toast({
                title: 'Settings Saved',
                description: 'Committee configurations have been updated.',
                variant: 'success',
            });
        } catch (error) {
            const isPermissionError = error instanceof Error && error.message.includes('permission');
            toast({
                variant: 'destructive',
                title: isPermissionError ? 'Permission Denied' : 'Error',
                description: error instanceof Error ? error.message : 'Could not save committee configurations.',
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleRoleChange = async (userToUpdate: User, committeeRoleName: UserRole, action: 'add' | 'remove') => {
        if (!actor) return;
        
        const currentRoles = (userToUpdate.roles as any[]).map(r => r.name) as UserRole[];
        let newRoles: UserRole[];

        if (action === 'add') {
            if (!currentRoles.includes(committeeRoleName)) {
                newRoles = [...currentRoles, committeeRoleName];
            } else {
                return; // Role already exists, do nothing
            }
        } else { // remove
            // Prevent removing the last role if it's the committee role
            if(currentRoles.length === 1 && currentRoles[0] === committeeRoleName) {
                toast({ variant: 'destructive', title: 'Action Prevented', description: 'Cannot remove the only role a user has. Assign a new primary role first.' });
                return;
            }
            newRoles = currentRoles.filter(r => r !== committeeRoleName);
        }
    
        try {
            const response = await fetch('/api/users', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    id: userToUpdate.id,
                    name: userToUpdate.name,
                    email: userToUpdate.email,
                    departmentId: userToUpdate.departmentId,
                    roles: newRoles, // Pass the array of role names
                    actorUserId: actor.id 
                })
            });
            if (!response.ok) {
                 const errorData = await response.json();
                throw new Error(errorData.error || "Failed to update role");
            }
            
            toast({
                title: `User Role Updated`,
                description: `${userToUpdate.name} was ${action === 'add' ? 'added to' : 'removed from'} ${committeeRoleName.replace(/_/g, ' ')}.`,
                variant: 'success',
            });
            await fetchAllUsers(); // Refresh the user list
        } catch (e) {
            console.error(e);
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to update user role.' });
        }
    }
    
    const handleAddCommittee = async () => {
        if (!newCommitteeName.trim()) {
            toast({variant: 'destructive', title: 'Error', description: 'Committee name is required.'});
            return;
        }
        if (!actor) return;
        const committeeKey = newCommitteeName.toUpperCase();
        if(committeeConfig[committeeKey]) {
             toast({variant: 'destructive', title: 'Error', description: `Committee ${committeeKey} already exists.`});
            return;
        }

        setIsSaving(true);
        try {
            const response = await fetch('/api/roles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: `Committee ${committeeKey} Member`, description: `Member of the ${committeeKey} review committee.`, actorUserId: actor.id })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to create new committee role.');
            }
            
            const newConfig = { ...localConfig, [committeeKey]: { min: 0, max: 0 } };
            await updateCommitteeConfig(newConfig);

            toast({title: 'Committee Role Created', description: `Successfully created the ${committeeKey} committee. Please configure its financial range.`, variant: 'success'});
            setNewCommitteeName('');
            setAddCommitteeOpen(false);
            await fetchAllSettings(); // Re-fetch settings to update roles across the app
        } catch (error) {
            toast({variant: 'destructive', title: 'Error', description: error instanceof Error ? error.message : 'An unknown error occurred.'});
        } finally {
            setIsSaving(false);
        }
    };

    const renderCommitteeSection = (committeeKey: string) => {
        const committee = localConfig[committeeKey];
        if (!committee) return null;
        
        const roleName: UserRole = `Committee_${committeeKey}_Member`;
        const members = allUsers.filter(u => Array.isArray(u.roles) && (u.roles as any[]).some(r => r.name === roleName));
        const nonMembers = allUsers.filter(u => Array.isArray(u.roles) && !(u.roles as any[]).some(r => r.name === roleName || r.name === 'Admin' || r.name === 'Vendor'))
            .filter(u => departmentFilters[committeeKey] === 'all' || u.departmentId === departmentFilters[committeeKey])
            .filter(u => u.name.toLowerCase().includes(searchTerms[committeeKey]?.toLowerCase() || ''));

        return (
            <AccordionItem value={committeeKey} key={committeeKey}>
                <AccordionTrigger>
                    <CardTitle className="text-base">Procurement Committee {committeeKey}</CardTitle>
                </AccordionTrigger>
                <AccordionContent>
                    <CardContent className="space-y-4 pt-4">
                        <div className="grid md:grid-cols-2 gap-4">
                            <div>
                                <Label>Min Amount (ETB)</Label>
                                <Input type="number" value={committee.min || ''} onChange={(e) => setLocalConfig(prev => ({...prev, [committeeKey]: {...prev[committeeKey], min: Number(e.target.value)}}))} />
                            </div>
                            <div>
                                <Label>Max Amount (ETB)</Label>
                                <Input type="number" placeholder="No Limit" value={committee.max || ''} onChange={(e) => setLocalConfig(prev => ({...prev, [committeeKey]: {...prev[committeeKey], max: e.target.value === '' ? null : Number(e.target.value)}}))} />
                            </div>
                        </div>
                        <div className="grid md:grid-cols-2 gap-6 pt-4">
                            <div className="space-y-2">
                                <h4 className="font-semibold flex items-center gap-2"><Users /> Current Members</h4>
                                <ScrollArea className="h-60 border rounded-md p-2">
                                    {members.length > 0 ? members.map(user => (
                                        <div key={user.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted">
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-8 w-8"><AvatarImage src={`https://picsum.photos/seed/${user.id}/32/32`} /><AvatarFallback>{user.name.charAt(0)}</AvatarFallback></Avatar>
                                                <div>
                                                    <p className="text-sm font-medium">{user.name}</p>
                                                    <p className="text-xs text-muted-foreground">{user.department}</p>
                                                </div>
                                            </div>
                                            <Button size="sm" variant="ghost" onClick={() => handleRoleChange(user, roleName, 'remove')}><UserX className="h-4 w-4" /></Button>
                                        </div>
                                    )) : <p className="text-sm text-muted-foreground text-center py-4">No members assigned.</p>}
                                </ScrollArea>
                            </div>
                            <div className="space-y-2">
                                <h4 className="font-semibold">Add Members</h4>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input placeholder="Search users..." className="pl-8" value={searchTerms[committeeKey] || ''} onChange={(e) => setSearchTerms(prev => ({...prev, [committeeKey]: e.target.value}))}/>
                                    </div>
                                    <Select value={departmentFilters[committeeKey] || 'all'} onValueChange={(val) => setDepartmentFilters(prev => ({...prev, [committeeKey]: val}))}>
                                        <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Departments</SelectItem>
                                            {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <ScrollArea className="h-60 border rounded-md p-2">
                                    {nonMembers.map(user => (
                                        <div key={user.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted">
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-8 w-8"><AvatarImage src={`https://picsum.photos/seed/${user.id}/32/32`} /><AvatarFallback>{user.name.charAt(0)}</AvatarFallback></Avatar>
                                                <div>
                                                    <p className="text-sm font-medium">{user.name}</p>
                                                    <p className="text-xs text-muted-foreground">{user.department}</p>
                                                </div>
                                            </div>
                                            <Button size="sm" variant="outline" onClick={() => handleRoleChange(user, roleName, 'add')}><UserCheck className="h-4 w-4 mr-2" /> Add</Button>
                                        </div>
                                    ))}
                                </ScrollArea>
                            </div>
                        </div>
                    </CardContent>
                </AccordionContent>
            </AccordionItem>
        )
    }

    return (
        <Card>
             <CardHeader>
                <CardTitle>Review Committee Settings</CardTitle>
                <CardDescription>
                    Configure value ranges for high-level review committees and manage their membership.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Accordion type="multiple" className="w-full space-y-4">
                    {Object.keys(localConfig).sort().map(key => renderCommitteeSection(key))}
                </Accordion>
            </CardContent>
            <CardFooter className="flex justify-between items-center">
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
                            <Label htmlFor="committee-name">Committee Name (e.g., "C", "D")</Label>
                            <Input 
                                id="committee-name"
                                value={newCommitteeName}
                                onChange={e => setNewCommitteeName(e.target.value)}
                                placeholder="C"
                            />
                        </div>
                        <DialogFooter>
                            <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                            <Button onClick={handleAddCommittee} disabled={isSaving}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                                Create Committee Role
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardFooter>
        </Card>
    );
}
