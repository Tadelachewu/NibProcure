
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { Loader2 } from 'lucide-react';

export default function HomePage() {
  const { user, loading, role, rolePermissions } = useAuth();
  const router = useRouter();

  useEffect(() => {
    console.log('[Home Page] useEffect triggered. State:', { loading, user: !!user, role, permsLoaded: Object.keys(rolePermissions).length > 0 });

    // Wait until the initial loading of auth data is complete
    if (loading) {
      console.log('[Home Page] Still loading auth data, waiting...');
      return;
    }

    // If there's no user after loading, they need to log in.
    if (!user) {
      console.log('[Home Page] No user found after loading. Redirecting to /login.');
      router.replace('/login');
      return;
    }
    
    // If the user is present but role/permissions are not yet loaded, wait.
    if (!role || Object.keys(rolePermissions).length === 0) {
      console.log('[Home Page] User exists, but role or permissions are not yet loaded. Waiting...');
      return;
    }

    // Now we have a user, role, and permissions, so we can safely redirect.
    console.log(`[Home Page] All data loaded. Role: ${role}. Attempting to redirect.`);
    if (role === 'Vendor') {
      console.log('[Home Page] User is a Vendor. Redirecting to /vendor/dashboard.');
      router.replace('/vendor/dashboard');
    } else {
      const allowedPaths = rolePermissions[role] || [];
      const defaultPath = allowedPaths.includes('/dashboard') ? '/dashboard' : allowedPaths[0];
      console.log(`[Home Page] User is not a Vendor. Allowed paths: [${allowedPaths.join(', ')}]. Default path: ${defaultPath}`);

      if (defaultPath) {
        console.log(`[Home Page] Redirecting to default path: ${defaultPath}`);
        router.replace(defaultPath);
      } else {
        // This is a fallback for roles with no defined paths.
        console.error(`[Home Page] Role ${role} has no default path. Logging out to prevent loop.`);
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
