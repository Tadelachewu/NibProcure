
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// This is a temporary redirect page. The user will be redirected from here
// to their appropriate dashboard by the main layout, which handles auth state.
export default function AppRootPage() {
  const router = useRouter();
  useEffect(() => {
    router.push('/dashboard');
  }, [router]);

  return null; // This page doesn't need to render anything
}
