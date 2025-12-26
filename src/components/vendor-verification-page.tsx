
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from './ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Vendor, KycStatus } from '@/lib/types';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ShieldQuestion, ShieldX } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function VendorVerificationPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const router = useRouter();
  const { token } = useAuth();

  const fetchVendors = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await fetch('/api/vendors', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setVendors(data.filter((v: Vendor) => v.kycStatus === 'Pending'));
    } catch (error) {
      console.error('Failed to fetch vendors:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch vendors for verification.' });
    } finally {
      setLoading(false);
    }
  }, [toast, token]);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  const getStatusVariant = (status: KycStatus) => {
    switch (status) {
      case 'Verified': return 'default';
      case 'Pending': return 'secondary';
      case 'Rejected': return 'destructive';
    }
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Vendor KYC Verification</CardTitle>
          <CardDescription>
            Review and verify new vendor applications.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Vendor Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendors.length > 0 ? (
                  vendors.map((vendor, index) => (
                    <TableRow key={vendor.id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell className="font-medium">{vendor.name}</TableCell>
                      <TableCell>
                        <div>{vendor.contactPerson}</div>
                        <div className="text-sm text-muted-foreground">{vendor.email}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(vendor.kycStatus)}>{vendor.kycStatus}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button onClick={() => router.push(`/vendor-verification/${vendor.id}`)}>Review & Verify</Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="h-48 text-center">
                        <div className="flex flex-col items-center gap-4">
                            <ShieldX className="h-16 w-16 text-muted-foreground/50" />
                            <div className="space-y-1">
                                <p className="font-semibold">No Pending Verifications</p>
                                <p className="text-muted-foreground">There are no new vendors to verify at this time.</p>
                            </div>
                        </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
