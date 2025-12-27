
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
    role => role !== 'Vendor' && role !== 'Admin'
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
    } catch(e) {
        toast({
            variant: 'destructive',
            title: 'Error Saving Permissions',
            description: e instanceof Error ? e.message : 'Could not update permissions.',
        });
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Role Permissions</CardTitle>
        <CardDescription>
          Define which pages each user role can access in the application.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {editableRoles.map(role => (
          <Card key={role}>
            <CardHeader>
              <CardTitle className="text-lg">{role.replace(/_/g, ' ')}</CardTitle>
            </CardHeader>
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
          </Card>
        ))}
      </CardContent>
      <CardFooter>
        <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Changes
        </Button>
      </CardFooter>
    </Card>
  );
}
