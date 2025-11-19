'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { Loader2 } from 'lucide-react';

export default function HomePage() {
  const { user, loading, role, rolePermissions, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) {
      return; // Wait until authentication state is fully loaded
    }

    if (!user || !role) {
      router.push('/login');
      return;
    }

    if (role === 'Vendor') {
      router.push('/vendor/dashboard');
      return;
    } 
    
    // Use the 'Combined' key which holds the merged permissions for the current user.
    const allowedPaths = rolePermissions['Combined'] || [];
    
    // Prefer dashboard if available, otherwise take the first available path.
    const defaultPath = allowedPaths.includes('/dashboard') 
        ? '/dashboard' 
        : allowedPaths[0];

    if (defaultPath) {
      router.push(defaultPath);
    } else {
      // This is a fallback for roles that might have no pages (like a newly created role).
      // For Admin, always go to settings if no other path is found.
      if (user.roles?.includes('Admin')) {
        router.push('/settings');
        return;
      }
      console.error(`User with roles has no default path defined. Logging out.`);
      logout();
    }
    
  }, [user, loading, role, router, rolePermissions, logout]);

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
