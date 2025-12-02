
'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { User as UserIcon } from 'lucide-react';
import { Label } from './ui/label';
import { useAuth } from '@/contexts/auth-context';
import { UserRole, User } from '@/lib/types';

export function RoleSwitcher() {
  const { user, allUsers, switchUser } = useAuth();

  const getPrimaryRole = (user: User | null): string => {
    if (user && Array.isArray(user.roles) && user.roles.length > 0) {
      // Assuming roles is an array of strings now
      return (user.roles[0] as string).replace(/_/g, ' ') || 'No Role';
    }
    return 'No Role';
  }

  return (
    <div className="flex w-full flex-col gap-2 p-2">
      <Label className="text-xs font-medium text-muted-foreground">Switch User</Label>
      <Select
        value={user?.id || ''}
        onValueChange={(userId) => switchUser(userId)}
      >
        <SelectTrigger className="w-full h-auto py-1">
          <div className="flex items-center gap-2 truncate">
            <UserIcon className="h-4 w-4" />
             <div className="flex flex-col text-left">
                <span className="font-medium">{user?.name}</span>
                <span className="text-xs text-muted-foreground">{getPrimaryRole(user)}</span>
            </div>
          </div>
        </SelectTrigger>
        <SelectContent>
            {allUsers.map((u: User) => (
                 <SelectItem key={u.id} value={u.id}>
                    <div className="flex flex-col text-left">
                        <span className="font-medium">{u.name}</span>
                        <span className="text-xs text-muted-foreground">{getPrimaryRole(u)}</span>
                    </div>
                </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  );
}
