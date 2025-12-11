
'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from './ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, Trash2, Edit, Users, X, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, Check } from 'lucide-react';
import { Department, User, UserRole } from '@/lib/types';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form';
import { useAuth } from '@/contexts/auth-context';
import { Badge } from './ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from './ui/command';
import { cn } from '@/lib/utils';
import { ScrollArea } from './ui/scroll-area';

const userFormSchema = z.object({
  name: z.string().min(2, "Name is required."),
  email: z.string().email("Invalid email address."),
  roles: z.array(z.string()).min(1, "At least one role is required."),
  departmentId: z.string().min(1, "Department is required."),
  password: z.string().optional(),
});

const userEditFormSchema = userFormSchema.extend({
    password: z.string().optional(),
});

type UserFormValues = z.infer<typeof userFormSchema>;

const PAGE_SIZE = 10;

export function UserManagementEditor() {
  const { allUsers, fetchAllUsers, user: actor, departments, fetchAllDepartments, rolePermissions } = useAuth();
  const [roles, setRoles] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setDialogOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const { toast } = useToast();

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userToEdit ? userEditFormSchema : userFormSchema),
    defaultValues: {
      name: '',
      email: '',
      roles: [],
      departmentId: '',
      password: '',
    },
  });
  
  const storageKey = useMemo(() => `user-form-${userToEdit?.id || 'new'}`, [userToEdit]);

  useEffect(() => {
    if (isDialogOpen) {
      const savedData = localStorage.getItem(storageKey);
      if (savedData) {
        try {
          form.reset(JSON.parse(savedData));
          toast({ title: 'Draft Restored', description: 'Your unsaved user data has been restored.' });
        } catch (e) {
          console.error("Failed to parse user form data", e);
        }
      }
    }
  }, [isDialogOpen, storageKey, form, toast]);

  useEffect(() => {
    if (isDialogOpen) {
      const subscription = form.watch((value) => {
        localStorage.setItem(storageKey, JSON.stringify(value));
      });
      return () => subscription.unsubscribe();
    }
  }, [isDialogOpen, form, storageKey]);


  const fetchData = async () => {
    setIsLoading(true);
    try {
      await Promise.all([fetchAllUsers(), fetchAllDepartments()]);
      setRoles(Object.keys(rolePermissions)); // Include all roles now
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not load initial data.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [rolePermissions]); // Re-fetch if roles change

  const handleFormSubmit = async (values: UserFormValues) => {
    if (!actor) return;
    setIsLoading(true);
    try {
      const isEditing = !!userToEdit;
      
       const apiValues: any = {
        ...values,
      };

      if (isEditing && !values.password) {
        delete (apiValues as any).password;
      }

      const body = isEditing 
        ? { ...apiValues, id: userToEdit.id, actorUserId: actor.id }
        : { ...apiValues, actorUserId: actor.id };
        
      const response = await fetch('/api/users', {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${isEditing ? 'update' : 'create'} user.`);
      }

      toast({
        title: `User ${isEditing ? 'Updated' : 'Created'}`,
        description: `The user has been successfully ${isEditing ? 'updated' : 'created'}.`,
      });
      localStorage.removeItem(storageKey);
      setDialogOpen(false);
      setUserToEdit(null);
      form.reset({ name: '', email: '', roles: [], departmentId: '', password: '' });
      fetchData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: error instanceof Error ? error.message : 'An unknown error occurred.' });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleDeleteUser = async (userId: string) => {
    if (!actor) return;
    setIsLoading(true);
    try {
        const response = await fetch(`/api/users`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: userId, actorUserId: actor.id }),
        });
         if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to delete user.');
        }
        toast({
            title: 'User Deleted',
            description: `The user has been deleted.`,
        });
        fetchData();
    } catch (error) {
         toast({ variant: 'destructive', title: 'Error', description: error instanceof Error ? error.message : 'An unknown error occurred.'});
    } finally {
        setIsLoading(false);
    }
  };

  const openDialog = (user?: User) => {
    if (user) {
      setUserToEdit(user);
      form.reset({
        name: user.name,
        email: user.email,
        roles: (user.roles as any[]).map(r => r.name),
        departmentId: user.departmentId || '',
        password: '',
      });
    } else {
      setUserToEdit(null);
      form.reset({ name: '', email: '', roles: [], departmentId: '', password: '' });
    }
    setDialogOpen(true);
  };
  
  const totalPages = Math.ceil(allUsers.length / PAGE_SIZE);
  const paginatedUsers = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return allUsers.slice(startIndex, startIndex + PAGE_SIZE);
  }, [allUsers, currentPage]);

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
            <div>
                <CardTitle>User Management</CardTitle>
                <CardDescription>
                Add, edit, and manage application users and their roles.
                </CardDescription>
            </div>
            <Button onClick={() => openDialog()}><PlusCircle className="mr-2"/> Add New User</Button>
        </div>
      </CardHeader>
      <CardContent>
         <div className="border rounded-md">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-16">#</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Roles</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead className="text-right w-40">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {isLoading && paginatedUsers.length === 0 ? (
                         <TableRow>
                            <TableCell colSpan={6} className="h-24 text-center">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" />
                            </TableCell>
                        </TableRow>
                    ) : paginatedUsers.length > 0 ? (
                        paginatedUsers.map((user, index) => (
                            <TableRow key={user.id}>
                                <TableCell className="text-muted-foreground">{(currentPage - 1) * PAGE_SIZE + index + 1}</TableCell>
                                <TableCell className="font-semibold">{user.name}</TableCell>
                                <TableCell>{user.email}</TableCell>
                                <TableCell>
                                  <div className="flex flex-wrap gap-1">
                                    {(user.roles as any[]).map(role => (
                                      <Badge key={role.id} variant="secondary">{role.name.replace(/_/g, ' ')}</Badge>
                                    ))}
                                  </div>
                                </TableCell>
                                <TableCell>{user.department || 'N/A'}</TableCell>
                                <TableCell className="text-right">
                                    <div className="flex gap-2 justify-end">
                                        <Button variant="outline" size="sm" onClick={() => openDialog(user)}>
                                            <Edit className="mr-2 h-4 w-4"/>
                                            Edit
                                        </Button>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="destructive" size="sm" disabled={(user.roles as any[]).some(r => r.name === 'Admin')}>
                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                    Delete
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This will permanently delete the user <strong>{user.name}</strong>. This action cannot be undone.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => handleDeleteUser(user.id)} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                                                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                                                        Yes, delete user
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
                            <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                <div className="flex flex-col items-center gap-4">
                                    <Users className="h-16 w-16 text-muted-foreground/50" />
                                    <p className="font-semibold">No users found.</p>
                                    <p>Click "Add New User" to get started.</p>
                                </div>
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
        {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages} ({allUsers.length} total users)
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}><ChevronsLeft /></Button>
                    <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1}><ChevronLeft /></Button>
                    <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages}><ChevronRight /></Button>
                    <Button variant="outline" size="icon" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}><ChevronsRight /></Button>
                </div>
            </div>
        )}
      </CardContent>
       <Dialog open={isDialogOpen} onOpenChange={(isOpen) => { if (!isOpen) { setUserToEdit(null); form.reset(); localStorage.removeItem(storageKey); } setDialogOpen(isOpen); }}>
        <DialogContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
              <DialogHeader>
                  <DialogTitle>{userToEdit ? 'Edit User' : 'Add New User'}</DialogTitle>
              </DialogHeader>
              <div className="py-4 grid grid-cols-2 gap-x-4 gap-y-6">
                <FormField control={form.control} name="name" render={({ field }) => ( <FormItem className="col-span-2"><FormLabel>Full Name</FormLabel><FormControl><Input placeholder="e.g. John Doe" {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormField control={form.control} name="email" render={({ field }) => ( <FormItem className="col-span-2"><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="e.g. john.doe@example.com" {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormField control={form.control} name="password" render={({ field }) => ( <FormItem className="col-span-2"><FormLabel>Password</FormLabel><FormControl><Input type="password" placeholder={userToEdit ? "Leave blank to keep current password" : ""} {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormField
                    control={form.control}
                    name="roles"
                    render={({ field }) => (
                        <FormItem className="col-span-2">
                        <FormLabel>Roles</FormLabel>
                        <Popover>
                            <PopoverTrigger asChild>
                            <FormControl>
                                <Button variant="outline" role="combobox" className="w-full justify-between">
                                <div className="flex gap-1 flex-wrap">
                                {field.value.length > 0 ? field.value.map(role => (
                                    <Badge key={role} variant="secondary">{role.replace(/_/g, ' ')}</Badge>
                                )) : "Select roles..."}
                                </div>
                                </Button>
                            </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                <Command>
                                <CommandInput placeholder="Search roles..." />
                                <CommandEmpty>No roles found.</CommandEmpty>
                                <ScrollArea className="h-48">
                                  <CommandGroup>
                                  {roles.map(role => (
                                      <CommandItem
                                          key={role}
                                          onSelect={() => {
                                              const newRoles = field.value.includes(role)
                                              ? field.value.filter(r => r !== role)
                                              : [...field.value, role];
                                              field.onChange(newRoles);
                                          }}
                                      >
                                      <Check className={cn("mr-2 h-4 w-4", field.value.includes(role) ? "opacity-100" : "opacity-0")}/>
                                      {role.replace(/_/g, ' ')}
                                      </CommandItem>
                                  ))}
                                  </CommandGroup>
                                </ScrollArea>
                                </Command>
                            </PopoverContent>
                        </Popover>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField control={form.control} name="departmentId" render={({ field }) => ( <FormItem className="col-span-2"><FormLabel>Department</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select a department" /></SelectTrigger></FormControl><SelectContent>{departments.map(dept => <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                
              </div>
              <DialogFooter>
                  <DialogClose asChild><Button type="button" variant="ghost">Cancel</Button></DialogClose>
                  <Button type="submit" disabled={isLoading}>
                       {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                      {userToEdit ? 'Save Changes' : 'Create User'}
                  </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
