
import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/contexts/auth-context';
import { ThemeProvider } from '@/contexts/theme-context';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Nib InternationalBank',
  description: 'A modern Procurement Management System',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link 
          href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" 
          rel="stylesheet" 
          integrity="sha384-VT5fPqL7tIgcR60YVnOOJ6H3C2ebMN6+qXn7C/c3i5d/K3gklG3Y3Y2soiSL2o2h"
          crossOrigin="anonymous"
        />
      </head>
      <body className={cn("font-body antialiased", "text-gradient")}>
        <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
        >
            <AuthProvider>
            {children}
            <Toaster />
            </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
