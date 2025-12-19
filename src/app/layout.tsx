import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/contexts/auth-context';
import { ThemeProvider } from '@/contexts/theme-context';
import { headers } from 'next/headers';
import Head from 'next/head';

export const metadata: Metadata = {
  title: 'Nib InternationalBank',
  description: 'A modern Procurement Management System',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = headers().get('x-nonce') || '';

  return (
    <html lang="en" suppressHydrationWarning>
      <Head>
        {/* Pass the nonce to Next.js scripts */}
        <meta property="csp-nonce" content={nonce} />
      </Head>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap"
          rel="stylesheet"
          integrity="sha384-AB/lrCiUjxv3RC/rgYH0zXZL0iCKlSYMt5WHMDrk+D07iDHTnhzx0tQVGtWyMUZO"
          crossOrigin="anonymous"
          nonce={nonce}
        />
      </head>
      <body className="font-body antialiased">
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
