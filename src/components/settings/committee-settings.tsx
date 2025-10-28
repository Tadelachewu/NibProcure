
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

interface CommitteeConfig {
    [key: string]: {
        min: number;
        max: number;
    }
}

export function CommitteeSettings() {
    const { allUsers, updateUserRole, committeeConfig, updateCommitteeConfig, fetchAllUsers, fetchAllSettings } = useAuth();
    const { toast } = useToast();
    const [roles, setRoles] = useState<{ id: string; name: string; type: string }[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [searchTerms, setSearchTerms] = useState<{[key: string]: string}>({});
    const [departmentFilters, setDepartmentFilters] = useState<{[key: string]: string}>({});
    const [localConfig, setLocalConfig] = useState<CommitteeConfig>(committeeConfig);
    const [isAddCommitteeOpen, setAddCommitteeOpen] = useState(false);
    const [newCommitteeName, setNewCommitteeName] = useState('');
    const { user: actor } = useAuth();

    const fetchRolesAndDepartments = async () => {
        setIsLoading(true);
        try {
            const [rolesRes, deptsRes] = await Promise.all([
                fetch('/api/roles'),
                fetch('/api/departments')
            ]);
            const rolesData = await rolesRes.json();
            const deptsData = await deptsRes.json();
            setRoles(rolesData);
            setDepartments(deptsData);
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to load initial component data.'});
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchRolesAndDepartments();
    }, []);

    useEffect(() => {
        setLocalConfig(committeeConfig || {});
    }, [committeeConfig]);

    const handleSave = async () => {
        setIsLoading(true);
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

    const handleRoleChange = async (user: User, newRole: UserRole) => {
        await updateUserRole(user.id, newRole);
        toast({
            title: `User Role Updated`,
            description: `${user.name} is now a ${newRole.replace(/_/g, ' ')}.`,
        });
        fetchAllUsers(); // Refresh the user list
    }
    
    const handleAddCommittee = async () => {
        if (!newCommitteeName.trim()) {
            toast({variant: 'destructive', title: 'Error', description: 'Committee name is required.'});
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
            await fetchRolesAndDepartments();
            await fetchAllSettings(); 
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
        const currentSearchTerm = searchTerms[committeeKey] || '';
        const currentDeptFilter = departmentFilters[committeeKey] || 'all';

        const nonMembers = allUsers.filter(u => u.role !== role && u.role !== 'Admin' && u.role !== 'Vendor')
            .filter(u => currentDeptFilter === 'all' || u.departmentId === currentDeptFilter)
            .filter(u => u.name.toLowerCase().includes(currentSearchTerm.toLowerCase()));

        return (
            <Card key={committeeKey}>
                <CardHeader>
                    <CardTitle>{role.replace(/_/g, ' ')}</CardTitle>
                    <CardDescription>
                        Configure value thresholds and members for this committee.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                             <Label>Min Amount (ETB)</Label>
                             <Input type="number" value={localConfig[committeeKey]?.min || ''} onChange={(e) => setLocalConfig(prev => ({...prev, [committeeKey]: {...prev[committeeKey], min: Number(e.target.value)}}))} />
                        </div>
                         <div>
                             <Label>Max Amount (ETB)</Label>
                             <Input type="number" placeholder="No limit" value={localConfig[committeeKey]?.max || ''} onChange={(e) => setLocalConfig(prev => ({...prev, [committeeKey]: {...prev[committeeKey], max: e.target.value === '' ? null : Number(e.target.value)}}))} />
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
                                        <Button size="sm" variant="ghost" onClick={() => handleRoleChange(user, 'Committee_Member')}><UserX className="h-4 w-4" /></Button>
                                    </div>
                                )) : <p className="text-sm text-muted-foreground text-center py-4">No members assigned.</p>}
                             </ScrollArea>
                        </div>
                        <div className="space-y-2">
                             <h4 className="font-semibold">Add Members</h4>
                             <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input placeholder="Search users..." className="pl-8" value={currentSearchTerm} onChange={(e) => setSearchTerms(prev => ({...prev, [committeeKey]: e.target.value}))}/>
                                </div>
                                <Select value={currentDeptFilter} onValueChange={(val) => setDepartmentFilters(prev => ({...prev, [committeeKey]: val}))}>
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
                                        <Button size="sm" variant="outline" onClick={() => handleRoleChange(user, role)}><UserCheck className="h-4 w-4 mr-2" /> Add</Button>
                                    </div>
                                ))}
                             </ScrollArea>
                        </div>
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="space-y-6">
            {isLoading ? <Loader2 className="animate-spin" /> : reviewCommitteeRoles.map(role => renderCommitteeSection(role.name as UserRole))}
            <div className="flex justify-between items-center">
                <Button onClick={handleSave} disabled={isLoading}>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
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
                            <Label htmlFor="committee-name">Committee Identifier (e.g., "C", "D", "Special Project")</Label>
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
