
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { Loader2 } from 'lucide-react';

export default function HomePage() {
  const { user, loading, role, rolePermissions } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // **THE FIX - PART 2**
    // Wait for the authentication context to finish loading before doing anything.
    if (loading) {
      return; 
    }

    // If loading is done and there's still no user, go to login.
    if (!user) {
      router.push('/login');
      return;
    }

    // If there is a user and role, figure out where they should go.
    if (role) {
        if (role === 'Vendor') {
            router.push('/vendor/dashboard');
        } else {
            const allowedPaths = rolePermissions[role] || [];
            // Use dashboard as a default, fallback to the first available page.
            const defaultPath = allowedPaths.includes('/dashboard') ? '/dashboard' : allowedPaths[0];

            if (defaultPath) {
                router.push(defaultPath);
            } else {
                // If a user has a role with no defined pages, something is wrong.
                // Log them out so they don't get stuck.
                console.error(`User role ${role} has no default path defined. Logging out.`);
                router.push('/login');
            }
        }
    }
  }, [user, loading, role, router, rolePermissions]);

  // Show a loading spinner while the logic runs.
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
