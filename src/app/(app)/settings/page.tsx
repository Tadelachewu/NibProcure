
'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { SettingsPage } from '@/components/settings-page';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';

export default function Settings() {
    const router = useRouter();
    const { user, loading } = useAuth();
    const { toast } = useToast();
    const notifiedRef = useRef(false);

    const isAdmin = Boolean(user && (user.roles as any[]).some(r => (typeof r === 'string' ? r === 'Admin' : r?.name === 'Admin')));

    useEffect(() => {
        if (loading) return;
        if (!isAdmin) {
            if (!notifiedRef.current) {
                notifiedRef.current = true;
                toast({ variant: 'destructive', title: 'Restricted', description: 'Settings is restricted to Admin only.' });
            }
            router.replace('/');
        }
    }, [isAdmin, loading, router]);

    if (!isAdmin) return null;
    return <SettingsPage />;
}
