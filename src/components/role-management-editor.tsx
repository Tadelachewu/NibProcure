
'use client';

import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from './ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, Trash2, Edit } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { useAuth } from '@/contexts/auth-context';

interface Role {
    id: string;
    name: string;
    description: string;
}

export function RoleManagementEditor() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setDialogOpen] = useState(false);
  const [roleToEdit, setRoleToEdit] = useState<Role | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const { toast } = useToast();
  const { user, fetchAllSettings } = useAuth();
  
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

  useEffect(() => {
    fetchRoles();
  }, []);

  const handleFormSubmit = async () => {
    if (!roleName.trim()) {
        toast({ variant: 'destructive', title: 'Error', description: 'Role name cannot be empty.' });
        return;
    }
    if (!user) return;
    
    setIsLoading(true);

    const isEditing = !!roleToEdit;
    const url = '/api/roles';
    const method = isEditing ? 'PATCH' : 'POST';
    const body = {
      id: isEditing ? roleToEdit.id : undefined,
      name: roleName,
      description: roleDescription,
      actorUserId: user.id,
    };
    
    try {
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to ${isEditing ? 'update' : 'create'} role.`);
        }
        toast({
            title: `Role ${isEditing ? 'Updated' : 'Added'}`,
            description: `The role "${roleName}" has been successfully ${isEditing ? 'updated' : 'added'}.`,
        });
        
        setDialogOpen(false);
        await fetchRoles(); // Re-fetch the list of roles
        await fetchAllSettings(); // Re-fetch settings to update permissions context
    } catch (error) {
        toast({ variant: 'destructive', title: 'Error', description: error instanceof Error ? error.message : 'An unknown error occurred.'});
    } finally {
        setIsLoading(false);
    }
  };


  const handleDeleteRole = async (roleId: string) => {
    if (!user) return;
    setIsLoading(true);
    try {
         const response = await fetch(`/api/roles`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: roleId, actorUserId: user.id }),
        });
         if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to delete role.');
        }
        toast({
            title: 'Role Deleted',
            description: `The role has been deleted.`,
        });
        await fetchRoles(); // Re-fetch the list of roles
        await fetchAllSettings(); // Re-fetch settings to update permissions context
    } catch (error) {
         toast({ variant: 'destructive', title: 'Error', description: error instanceof Error ? error.message : 'An unknown error occurred.'});
    } finally {
        setIsLoading(false);
    }
  };

  const openDialog = (role?: Role) => {
    if (role) {
        setRoleToEdit(role);
        setRoleName(role.name.replace(/_/g, ' '));
        setRoleDescription(role.description);
    } else {
        setRoleToEdit(null);
        setRoleName('');
        setRoleDescription('');
    }
    setDialogOpen(true);
  }

  const coreRoles: string[] = [
    'ADMIN', 
    'PROCUREMENT_OFFICER', 
    'REQUESTER', 
    'APPROVER', 
    'VENDOR',
    'FINANCE',
    'RECEIVING',
    'COMMITTEE',
    'COMMITTEE_A_MEMBER',
    'COMMITTEE_B_MEMBER',
    'COMMITTEE_MEMBER',
    'MANAGER_PROCUREMENT_DIVISION',
    'DIRECTOR_SUPPLY_CHAIN_AND_PROPERTY_MANAGEMENT',
    'VP_RESOURCES_AND_FACILITIES',
    'PRESIDENT'
  ].map(r => r.toUpperCase());


  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
            <div>
                <CardTitle>Role Management</CardTitle>
                <CardDescription>
                Define, edit, and delete user roles in the application.
                </CardDescription>
            </div>
             <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) setRoleToEdit(null); setDialogOpen(open);}}>
                <DialogTrigger asChild>
                    <Button onClick={() => openDialog()}><PlusCircle className="mr-2"/> Add New Role</Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{roleToEdit ? 'Edit Role' : 'Add New Role'}</DialogTitle>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div>
                            <Label htmlFor="role-name">Role Name</Label>
                            <Input id="role-name" placeholder="e.g., Quality Assurance" value={roleName} onChange={(e) => setRoleName(e.target.value)} />
                        </div>
                        <div>
                            <Label htmlFor="role-desc">Description</Label>
                            <Input id="role-desc" placeholder="A brief description of the role's purpose." value={roleDescription} onChange={(e) => setRoleDescription(e.target.value)} />
                        </div>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                        <Button onClick={handleFormSubmit} disabled={isLoading}>
                             {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                            {roleToEdit ? 'Save Changes' : 'Create Role'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
      </CardHeader>
      <CardContent>
         <div className="border rounded-md">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Role Name</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right w-40">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {isLoading && roles.length === 0 ? (
                        <TableRow><TableCell colSpan={3} className="h-24 text-center"><Loader2 className="animate-spin"/></TableCell></TableRow>
                    ) : roles.length > 0 ? roles.map((role) => (
                        <TableRow key={role.id}>
                            <TableCell className="font-semibold">{role.name.replace(/_/g, ' ')}</TableCell>
                            <TableCell className="text-muted-foreground">{role.description}</TableCell>
                            <TableCell className="text-right">
                                <div className="flex gap-2 justify-end">
                                    <Button variant="outline" size="sm" onClick={() => openDialog(role)}>
                                        <Edit className="mr-2 h-4 w-4"/>
                                        Edit
                                    </Button>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="destructive" size="sm" disabled={coreRoles.includes(role.name.toUpperCase())}>
                                                <Trash2 className="mr-2 h-4 w-4" />
                                                Delete
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    This action cannot be undone. This will permanently delete the <strong>{role.name.replace(/_/g, ' ')}</strong> role.
                                                    Any users with this role will lose their assigned permissions.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction onClick={() => handleDeleteRole(role.id)} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                                                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                                                    Yes, delete role
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </div>
                            </TableCell>
                        </TableRow>
                    )) : (
                         <TableRow>
                            <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                                No custom roles found.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
      </CardContent>
    </Card>
  );
}
