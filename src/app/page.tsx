
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { Loader2 } from 'lucide-react';

export default function HomePage() {
  const { user, loading, role, rolePermissions } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Wait until authentication is fully loaded and permissions are available.
    if (loading || (user && Object.keys(rolePermissions).length === 0)) {
      return; 
    }

    if (!user || !role) {
      router.push('/login');
      return;
    }

    // Now that we're sure permissions are loaded, proceed with redirection.
    if (role === 'Vendor') {
      router.push('/vendor/dashboard');
    } else {
      const allowedPaths = rolePermissions[role] || [];
      // Prefer dashboard if available, otherwise take the first available path.
      const defaultPath = allowedPaths.includes('/dashboard') ? '/dashboard' : allowedPaths[0];

      if (defaultPath) {
        router.push(defaultPath);
      } else {
        console.error(`User role ${role} has no default path defined. Logging out.`);
        router.push('/login');
      }
    }
  }, [user, loading, role, router, rolePermissions]);

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
