
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
import { Department, User } from '@/lib/types';
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
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { useAuth } from '@/contexts/auth-context';

export function DepartmentManagementEditor() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setDialogOpen] = useState(false);
  const [departmentToEdit, setDepartmentToEdit] = useState<Department | null>(null);
  
  const [departmentName, setDepartmentName] = useState('');
  const [departmentDesc, setDepartmentDesc] = useState('');
  const [departmentHeadId, setDepartmentHeadId] = useState<string | null>(null);
  
  const { toast } = useToast();
  const { user: actor, allUsers } = useAuth();

  const fetchDepartments = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/departments');
      if (!response.ok) throw new Error('Failed to fetch departments');
      const data = await response.json();
      setDepartments(data);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not load departments.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDepartments();
  }, []);

  const handleFormSubmit = async () => {
    if (!departmentName.trim()) {
        toast({ variant: 'destructive', title: 'Error', description: 'Department name cannot be empty.' });
        return;
    }
    if (!actor) return;
    
    setIsLoading(true);

    const isEditing = !!departmentToEdit;
    const url = '/api/departments';
    const method = isEditing ? 'PATCH' : 'POST';
    const body = {
      id: isEditing ? departmentToEdit.id : undefined,
      name: departmentName,
      description: departmentDesc,
      headId: departmentHeadId,
      userId: actor.id,
    };
    
    try {
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to ${isEditing ? 'update' : 'create'} department.`);
        }
        toast({
            title: `Department ${isEditing ? 'Updated' : 'Added'}`,
            description: `The department "${departmentName}" has been successfully ${isEditing ? 'updated' : 'added'}.`,
        });
        
        setDialogOpen(false);
        fetchDepartments();
    } catch (error) {
        toast({ variant: 'destructive', title: 'Error', description: error instanceof Error ? error.message : 'An unknown error occurred.'});
    } finally {
        setIsLoading(false);
    }
  };


  const handleDeleteDepartment = async (departmentId: string) => {
    if (!actor) return;
    setIsLoading(true);
    try {
         const response = await fetch(`/api/departments`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: departmentId, userId: actor.id }),
        });
         if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to delete department.');
        }
        toast({
            title: 'Department Deleted',
            description: `The department has been deleted.`,
        });
        fetchDepartments();
    } catch (error) {
         toast({ variant: 'destructive', title: 'Error', description: error instanceof Error ? error.message : 'An unknown error occurred.'});
    } finally {
        setIsLoading(false);
    }
  };

  const openDialog = (dept?: Department) => {
    if (dept) {
        setDepartmentToEdit(dept);
        setDepartmentName(dept.name);
        setDepartmentDesc(dept.description || '');
        setDepartmentHeadId(dept.headId || null);
    } else {
        setDepartmentToEdit(null);
        setDepartmentName('');
        setDepartmentDesc('');
        setDepartmentHeadId(null);
    }
    setDialogOpen(true);
  }

  const potentialHeadsForSelectedDept = departmentToEdit
    ? allUsers.filter(u => u.departmentId === departmentToEdit.id && (u.role as any)?.name !== 'Vendor' && (u.role as any)?.name !== 'Requester')
    : allUsers.filter(u => (u.role as any)?.name !== 'Vendor' && (u.role as any)?.name !== 'Requester');


  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
            <div>
                <CardTitle>Department Management</CardTitle>
                <CardDescription>
                Add, edit, and delete departments for user assignment.
                </CardDescription>
            </div>
             <Button onClick={() => openDialog()}><PlusCircle className="mr-2"/> Add New Department</Button>
        </div>
      </CardHeader>
      <CardContent>
         <div className="border rounded-md">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Department Name</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Department Head</TableHead>
                        <TableHead className="text-right w-40">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {isLoading && departments.length === 0 ? (
                         <TableRow>
                            <TableCell colSpan={4} className="h-24 text-center">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" />
                            </TableCell>
                        </TableRow>
                    ) : departments.length > 0 ? (
                        departments.map((dept) => (
                            <TableRow key={dept.id}>
                                <TableCell className="font-semibold">{dept.name}</TableCell>
                                <TableCell className="text-muted-foreground">{dept.description}</TableCell>
                                <TableCell>{dept.head?.name || <span className="text-muted-foreground italic">Not Assigned</span>}</TableCell>
                                <TableCell className="text-right">
                                    <div className="flex gap-2 justify-end">
                                        <Button variant="outline" size="sm" onClick={() => openDialog(dept)}>
                                            <Edit className="mr-2 h-4 w-4"/>
                                            Edit
                                        </Button>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="destructive" size="sm">
                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                    Delete
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This action cannot be undone. This will permanently delete the <strong>{dept.name}</strong> department.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => handleDeleteDepartment(dept.id)} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                                                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                                                        Yes, delete department
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))
                    ) : (
                         <TableRow>
                            <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                No departments found.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
      </CardContent>
       <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) setDepartmentToEdit(null); setDialogOpen(open);}}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>{departmentToEdit ? 'Edit Department' : 'Add New Department'}</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-4">
                <div>
                    <Label htmlFor="dept-name">Department Name</Label>
                    <Input id="dept-name" placeholder="e.g., Human Resources" value={departmentName} onChange={(e) => setDepartmentName(e.target.value)} />
                </div>
                 <div>
                    <Label htmlFor="dept-desc">Description</Label>
                    <Textarea id="dept-desc" placeholder="e.g., Responsible for all employee-related matters." value={departmentDesc} onChange={(e) => setDepartmentDesc(e.target.value)} />
                </div>
                 <div>
                    <Label htmlFor="dept-head">Department Head</Label>
                     <Select value={departmentHeadId || ''} onValueChange={setDepartmentHeadId}>
                        <SelectTrigger id="dept-head">
                            <SelectValue placeholder="Select a responsible person" />
                        </SelectTrigger>
                        <SelectContent>
                             <SelectItem value="null">None</SelectItem>
                            {potentialHeadsForSelectedDept.map(user => (
                                <SelectItem key={user.id} value={user.id}>{user.name} ({(user.role as any).name.replace(/_/g, ' ')})</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
            <DialogFooter>
                <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                <Button onClick={handleFormSubmit} disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                    {departmentToEdit ? 'Save Changes' : 'Create Department'}
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
