
'use client';

import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter
} from '@/components/ui/card';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { navItems } from '@/lib/roles';
import { UserRole } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save } from 'lucide-react';
import { Label } from './ui/label';
import { useAuth } from '@/contexts/auth-context';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';

type PermissionsState = Record<UserRole, string[]>;

export function RolePermissionsEditor() {
  const { rolePermissions, updateRolePermissions } = useAuth();
  const [permissions, setPermissions] = useState<PermissionsState>({});
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (rolePermissions) {
      setPermissions(rolePermissions);
    }
  }, [rolePermissions]);

  const editableRoles = Object.keys(permissions).filter(
    role => role !== 'Vendor' && role !== 'Admin' && role !== 'Combined'
  ) as UserRole[];

  const handlePermissionChange = (
    role: UserRole,
    path: string,
    checked: boolean
  ) => {
    setPermissions(prev => {
      const currentPermissions = prev[role] || [];
      const newPermissions = checked
        ? [...currentPermissions, path]
        : currentPermissions.filter(p => p !== path);
      return { ...prev, [role]: newPermissions };
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
        await updateRolePermissions(permissions);
        toast({
            title: 'Permissions Saved',
            description: 'User role permissions have been updated.',
            variant: 'success',
        });
    } catch(error) {
        const isPermissionError = error instanceof Error && error.message.includes('permission');
        toast({
            variant: 'destructive',
            title: isPermissionError ? 'Permission Denied' : 'Error',
            description: error instanceof Error ? error.message : 'Could not update permissions.',
        });
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Role Permissions</CardTitle>
          <CardDescription>
            Define which pages each user role can access in the application.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pb-24">
          <Accordion type="multiple" className="w-full space-y-4">
              {editableRoles.map(role => (
                  <AccordionItem value={role} key={role}>
                      <AccordionTrigger className="p-4 bg-muted/50 rounded-md">
                          <CardTitle className="text-lg">{role.replace(/_/g, ' ')}</CardTitle>
                      </AccordionTrigger>
                      <AccordionContent className="pt-4">
                          <CardContent className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                          {navItems.map(item => (
                              <div key={item.path} className="flex items-center space-x-2">
                              <Checkbox
                                  id={`${role}-${item.path}`}
                                  checked={permissions[role]?.includes(item.path)}
                                  onCheckedChange={checked =>
                                  handlePermissionChange(role, item.path, !!checked)
                                  }
                              />
                              <Label
                                  htmlFor={`${role}-${item.path}`}
                                  className="text-sm font-normal"
                              >
                                  {item.label}
                              </Label>
                              </div>
                          ))}
                          </CardContent>
                      </AccordionContent>
                  </AccordionItem>
              ))}
          </Accordion>
        </CardContent>
      </Card>

      <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-end gap-2 px-4 py-3">
          <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Changes
          </Button>
        </div>
      </div>
    </>
  );
}
