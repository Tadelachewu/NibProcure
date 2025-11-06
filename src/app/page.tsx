
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { Loader2 } from 'lucide-react';

export default function HomePage() {
  const { user, loading, role, rolePermissions } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Wait until the initial loading of auth data is complete
    if (loading) {
      return;
    }

    // If there's no user after loading, they need to log in.
    if (!user) {
      router.replace('/login');
      return;
    }
    
    // If the user is present but role/permissions are not yet loaded, wait.
    if (!role || Object.keys(rolePermissions).length === 0) {
      return;
    }

    // Now we have a user, role, and permissions, so we can safely redirect.
    if (role === 'Vendor') {
      router.replace('/vendor/dashboard');
    } else {
      const allowedPaths = rolePermissions[role] || [];
      const defaultPath = allowedPaths.includes('/dashboard') ? '/dashboard' : allowedPaths[0];

      if (defaultPath) {
        router.replace(defaultPath);
      } else {
        // This is a fallback for roles with no defined paths.
        // It's better to log out than to loop.
        console.error(`Role ${role} has no default path. Logging out.`);
        router.replace('/login');
      }
    }
  }, [user, loading, role, router, rolePermissions]);

  // Render a loading spinner while the logic runs.
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
