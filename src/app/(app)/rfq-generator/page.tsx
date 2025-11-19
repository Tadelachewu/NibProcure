

'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
  SidebarFooter,
} from '@/components/ui/sidebar';
import {
  LayoutDashboard,
  FilePlus,
  Bot,
  MailQuestion,
  History,
  LogOut,
  User as UserIcon,
  FileText,
  GanttChartSquare,
  Building2,
  FileBadge,
  FileSignature,
  FileStack,
  PackageCheck,
  Wallet,
  Landmark,
  Archive,
  ShieldCheck,
} from 'lucide-react';
import { Icons } from '@/components/icons';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/auth-context';
import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { ThemeSwitcher } from '@/components/theme-switcher';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, logout, loading, role } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  const pageTitle = useMemo(() => {
    switch (pathname) {
      case '/dashboard':
        return 'Dashboard';
      case '/new-requisition':
        return 'Create Purchase Requisition';
      case '/requisitions':
        return 'View Requisitions';
      case '/approvals':
        return 'Approvals';
      case '/vendors':
        return 'Vendors';
       case '/vendor-verification':
        return 'Vendor Verification';
       case '/quotations':
        return 'Quotations';
       case '/contracts':
        return 'Contracts';
      case '/purchase-orders':
        return 'Purchase Orders'
      case '/receive-goods':
        return 'Receive Goods';
       case '/invoices':
        return 'Invoices';
       case '/records':
        return 'Document Records';
      case '/audit-log':
        return 'Audit Log';
      default:
        if (pathname?.startsWith('/purchase-orders/')) return 'Purchase Order';
        return 'Nib InternationalBank';
    }
  }, [pathname]);

  if (loading || !user) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2">
            <Icons.logo className="size-7 text-primary" />
            <span className="text-lg font-semibold">Nib InternationalBank</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <Link href="/dashboard">
                <SidebarMenuButton
                  isActive={pathname === '/dashboard'}
                  tooltip="Dashboard"
                >
                  <LayoutDashboard />
                  <span>Dashboard</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <Link href="/new-requisition">
                <SidebarMenuButton
                  isActive={pathname === '/new-requisition'}
                  tooltip="New Requisition"
                >
                  <FilePlus />
                  <span>New Requisition</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
             <SidebarMenuItem>
              <Link href="/requisitions">
                <SidebarMenuButton
                  isActive={pathname === '/requisitions'}
                  tooltip="View Requisitions"
                >
                  <FileText />
                  <span>Requisitions</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
            {role === 'Approver' && (
              <SidebarMenuItem>
                <Link href="/approvals">
                  <SidebarMenuButton
                    isActive={pathname === '/approvals'}
                    tooltip="Approvals"
                  >
                    <GanttChartSquare />
                    <span>Approvals</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            )}
             {role === 'Procurement_Officer' && (
              <>
                <SidebarMenuItem>
                  <Link href="/vendors">
                    <SidebarMenuButton
                      isActive={pathname === '/vendors'}
                      tooltip="Vendors"
                    >
                      <Building2 />
                      <span>Vendors</span>
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <Link href="/vendor-verification">
                    <SidebarMenuButton
                      isActive={pathname === '/vendor-verification'}
                      tooltip="Vendor Verification"
                    >
                      <ShieldCheck />
                      <span>Vendor Verification</span>
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
                 <SidebarMenuItem>
                  <Link href="/quotations">
                    <SidebarMenuButton
                      isActive={pathname === '/quotations'}
                      tooltip="Quotations"
                    >
                      <FileBadge />
                      <span>Quotations</span>
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
                 <SidebarMenuItem>
                  <Link href="/contracts">
                    <SidebarMenuButton
                      isActive={pathname === '/contracts'}
                      tooltip="Contracts"
                    >
                      <FileSignature />
                      <span>Contracts</span>
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <Link href="/purchase-orders">
                    <SidebarMenuButton
                      isActive={pathname === '/purchase-orders'}
                      tooltip="Purchase Orders"
                    >
                      <FileStack />
                      <span>Purchase Orders</span>
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
              </>
            )}
             {role === 'Finance' && (
                <SidebarMenuItem>
                  <Link href="/invoices">
                    <SidebarMenuButton
                      isActive={pathname === '/invoices'}
                      tooltip="Invoices"
                    >
                      <Landmark />
                      <span>Invoices</span>
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
             )}
            {role === 'Receiving' && (
               <SidebarMenuItem>
                  <Link href="/receive-goods">
                    <SidebarMenuButton
                      isActive={pathname === '/receive-goods'}
                      tooltip="Receive Goods"
                    >
                      <PackageCheck />
                      <span>Receive Goods</span>
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
            )}
          </SidebarMenu>

          <Separator className="my-2" />

          <SidebarMenu>
             <SidebarMenuItem>
              <Link href="/records">
                <SidebarMenuButton
                  isActive={pathname === '/records'}
                  tooltip="Records"
                >
                  <Archive />
                  <span>Records</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <Link href="/audit-log">
                <SidebarMenuButton
                  isActive={pathname === '/audit-log'}
                  tooltip="Audit Log"
                >
                  <History />
                  <span>Audit Log</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <Separator className="my-2" />
          <div className="p-2">
            <Button variant="ghost" className="w-full justify-start" onClick={logout}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Logout</span>
            </Button>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 items-center justify-between border-b bg-card px-4 lg:px-6">
          <div className="flex items-center gap-4">
            <SidebarTrigger className="md:hidden" />
            <h1 className="text-xl font-semibold">{pageTitle}</h1>
          </div>
          <div className="flex items-center gap-4">
            <ThemeSwitcher />
            <span className="text-sm text-muted-foreground">{user.name}</span>
            <Avatar>
              <AvatarImage
                src="https://picsum.photos/40/40"
                data-ai-hint="profile picture"
              />
              <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
            </Avatar>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

    