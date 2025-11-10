
'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { User } from 'lucide-react';
import { Label } from './ui/label';
import { useAuth } from '@/contexts/auth-context';

export function RoleSwitcher() {
  const { user, role, allUsers, switchUser } = useAuth();

  return (
    <div className="flex w-full flex-col gap-2 p-2">
      <Label className="text-xs font-medium text-muted-foreground">Switch User</Label>
      <Select
        value={user?.id || ''}
        onValueChange={(userId) => switchUser(userId)}
      >
        <SelectTrigger className="w-full h-auto py-1">
          <div className="flex items-center gap-2 truncate">
            <User className="h-4 w-4" />
             <div className="flex flex-col text-left">
                <span className="font-medium">{user?.name}</span>
                <span className="text-xs text-muted-foreground">{role ? role.replace(/_/g, ' ') : 'No Role'}</span>
            </div>
          </div>
        </SelectTrigger>
        <SelectContent>
            {allUsers.map((u: any) => (
                 <SelectItem key={u.id} value={u.id}>
                    <div className="flex flex-col text-left">
                        <span className="font-medium">{u.name}</span>
                        <span className="text-xs text-muted-foreground">{u.role?.name ? u.role.name.replace(/_/g, ' ') : 'No Role'}</span>
                    </div>
                </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  );
}
