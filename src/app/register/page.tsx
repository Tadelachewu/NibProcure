
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { UserRole } from '@/lib/types';
import { Separator } from '@/components/ui/separator';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [licenseFile, setLicenseFile] = useState<File | null>(null);
  const [taxIdFile, setTaxIdFile] = useState<File | null>(null);
  const router = useRouter();
  const { login: authLogin } = useAuth();
  const { toast } = useToast();
  const role: UserRole = 'Vendor'; // Hardcode role to Vendor
  const storageKey = 'vendor-registration-form';

  useEffect(() => {
    const savedData = localStorage.getItem(storageKey);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        setName(parsed.name || '');
        setEmail(parsed.email || '');
        setContactPerson(parsed.contactPerson || '');
        setAddress(parsed.address || '');
        setPhone(parsed.phone || '');
        toast({ title: 'Draft Restored', description: 'Your registration information has been restored.'});
      } catch (e) {
        console.error("Failed to parse saved registration data", e);
      }
    }
  }, [toast]);

  useEffect(() => {
    const dataToSave = JSON.stringify({ name, email, contactPerson, address, phone });
    localStorage.setItem(storageKey, dataToSave);
  }, [name, email, contactPerson, address, phone]);

  const uploadFile = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('directory', 'kyc'); // Specify the subdirectory for KYC docs

    const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
    });
    const result = await response.json();
    if (!response.ok) {
        throw new Error(result.error || 'File upload failed.');
    }
    return result.path;
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseFile || !taxIdFile) {
        toast({
            variant: 'destructive',
            title: 'Missing Documents',
            description: 'Please upload both business license and tax ID documents.',
        });
        return;
    }
    setLoading(true);

    try {
        const [licensePath, taxIdPath] = await Promise.all([
            uploadFile(licenseFile),
            uploadFile(taxIdFile)
        ]);

        const vendorDetails = { 
            contactPerson, 
            address, 
            phone,
            licensePath,
            taxIdPath
        };

        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password, role, vendorDetails }),
        });

        const result = await response.json();

        if (response.ok) {
            localStorage.removeItem(storageKey); // Clear saved data on success
            authLogin(result.token, result.user);
            toast({
                title: 'Registration Successful',
                description: `Welcome, ${result.user.name}! Your vendor application is pending verification.`,
            });
            router.push('/');
        } else {
            throw new Error(result.error || 'Registration failed.');
        }
    } catch (error) {
        toast({
            variant: 'destructive',
            title: 'Registration Error',
            description: error instanceof Error ? error.message : 'An unexpected error occurred.',
        });
        setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">Vendor Registration</CardTitle>
          <CardDescription>
            Enter your company information to create a vendor account.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleRegister}>
          <CardContent className="grid gap-4">
            
            <div className="grid gap-2">
              <Label htmlFor="name">Company Name</Label>
              <Input 
                id="name" 
                placeholder="Your Company LLC"
                required 
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="m@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input 
                id="password" 
                type="password" 
                required 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <>
                <Separator />
                  <p className="text-sm text-muted-foreground">Please provide your business details for verification.</p>
                <div className="grid gap-2">
                    <Label htmlFor="contactPerson">Contact Person</Label>
                    <Input 
                        id="contactPerson" 
                        placeholder="Jane Doe" 
                        required 
                        value={contactPerson}
                        onChange={(e) => setContactPerson(e.target.value)}
                    />
                </div>
                  <div className="grid gap-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input 
                        id="phone" 
                        placeholder="(555) 123-4567" 
                        required 
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                    />
                </div>
                  <div className="grid gap-2">
                    <Label htmlFor="address">Business Address</Label>
                    <Input 
                        id="address" 
                        placeholder="123 Main St, Anytown, USA" 
                        required 
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                    />
                </div>
                  <div className="grid gap-2">
                    <Label htmlFor="license">Business License</Label>
                    <Input id="license" type="file" required onChange={(e) => setLicenseFile(e.target.files?.[0] || null)} />
                      <p className="text-xs text-muted-foreground">Upload a PDF of your business license.</p>
                </div>
                  <div className="grid gap-2">
                    <Label htmlFor="tax-id">Tax ID Document</Label>
                    <Input id="tax-id" type="file" required onChange={(e) => setTaxIdFile(e.target.files?.[0] || null)} />
                      <p className="text-xs text-muted-foreground">Upload a PDF of your tax registration.</p>
                </div>
            </>

          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create an account
            </Button>
            <div className="mt-4 text-center text-sm">
              Already have an account?{' '}
              <Link href="/login" className="underline">
                Sign in
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
