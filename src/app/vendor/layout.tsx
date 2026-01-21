
'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  LogOut,
  User as UserIcon,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ThemeSwitcher } from '@/components/theme-switcher';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';


export default function VendorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, logout, loading, role } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (!loading) {
        if (!user) {
            router.push('/login');
        } else if (role !== 'Vendor') {
            router.push('/dashboard'); // Redirect non-vendors away
        }
    }
  }, [user, loading, role, router]);


  if (loading || !user) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full flex-col">
       <header className="sticky top-0 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6">
        <nav className="hidden flex-col gap-6 text-lg font-medium md:flex md:flex-row md:items-center md:gap-5 md:text-sm lg:gap-6">
          <Link
            href="/vendor/dashboard"
            className="flex items-center gap-2 text-lg font-semibold md:text-base"
          >
            <Image src="/logo.png" alt="Nib InternationalBank Logo" width={24} height={24} className="h-6 w-6" />
            <span className="">Nib InternationalBank Vendor Portal</span>
          </Link>
        </nav>
        <div className="flex w-full items-center gap-4 md:ml-auto md:gap-2 lg:gap-4">
            <div className="ml-auto flex-1 sm:flex-initial">
                <ThemeSwitcher />
            </div>
             <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon" className="rounded-full">
                   <Avatar>
                    <AvatarImage
                        src={`https://picsum.photos/seed/${user.id}/40/40`}
                        alt={user.name}
                        data-ai-hint="logo"
                    />
                    <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                  <span className="sr-only">Toggle user menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link href="/vendor/profile">Profile</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/vendor/support">Support</Link></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout}>Logout</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
        </div>
      </header>
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        {children}
      </main>
    </div>
  )
}
