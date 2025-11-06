
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

    // If there's no user, redirect to login
    if (!user) {
      router.replace('/login');
      return;
    }
    
    // If user and role are present, but permissions aren't loaded yet, wait.
    if (role && Object.keys(rolePermissions).length === 0) {
      return;
    }

    // Redirect based on role
    if (role === 'Vendor') {
      router.replace('/vendor/dashboard');
    } else if (role) {
      const allowedPaths = rolePermissions[role] || [];
      const defaultPath = allowedPaths.includes('/dashboard') ? '/dashboard' : allowedPaths[0];

      if (defaultPath) {
        router.replace(defaultPath);
      } else {
        // This is a fallback for roles with no defined paths.
        console.error(`Role ${role} has no default path. Logging out.`);
        router.replace('/login');
      }
    } else {
      // Fallback if role is somehow null after loading
       router.replace('/login');
    }
  }, [user, loading, role, router, rolePermissions]);

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
