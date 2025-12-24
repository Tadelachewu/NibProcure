
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Vendor, KycStatus } from '@/lib/types';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle, XCircle, FileText, ArrowLeft } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';

export default function VendorVerificationDetailsPage() {
    const [vendor, setVendor] = useState<Vendor | null>(null);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [action, setAction] = useState<'verify' | 'reject' | null>(null);
    const [rejectionReason, setRejectionReason] = useState('');
    const { user } = useAuth();
    const { toast } = useToast();
    const router = useRouter();
    const params = useParams();
    const vendorId = params.id as string;

    const fetchVendor = useCallback(async () => {
        if (!vendorId) return;
        setLoading(true);
        try {
            const response = await fetch('/api/vendors');
            const data: Vendor[] = await response.json();
            const foundVendor = data.find((v: Vendor) => v.id === vendorId);
            if (!foundVendor) {
                toast({ variant: 'destructive', title: 'Error', description: 'Vendor not found.' });
                router.push('/vendor-verification');
            } else {
                setVendor(foundVendor);
            }
        } catch (error) {
            console.error('Failed to fetch vendor:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch vendor details.' });
        } finally {
            setLoading(false);
        }
    }, [vendorId, toast, router]);

    useEffect(() => {
        fetchVendor();
    }, [fetchVendor]);
    
    const handleSubmit = async () => {
        if (!vendor || !action || !user) return;

        if (action === 'reject' && !rejectionReason) {
            toast({ variant: 'destructive', title: 'Reason Required', description: 'Please provide a reason for rejection.' });
            return;
        }

        setIsSubmitting(true);
        try {
            const response = await fetch(`/api/vendors/${vendor.id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: action === 'verify' ? 'Verified' : 'Rejected',
                    userId: user.id,
                    rejectionReason: action === 'reject' ? rejectionReason : undefined,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to update vendor status.');
            }

            toast({
                title: 'Success',
                description: `Vendor ${vendor.name} has been ${action === 'verify' ? 'verified' : 'rejected'}.`,
            });
            router.push('/vendor-verification');
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error instanceof Error ? error.message : 'An unknown error occurred.',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }

    if (!vendor) {
        return null;
    }

    const licenseDoc = vendor.kycDocuments?.find(doc => doc.name === 'Business License');
    const taxDoc = vendor.kycDocuments?.find(doc => doc.name === 'Tax ID Document');

    return (
         <div className="space-y-6">
            <Button variant="outline" onClick={() => router.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to List
            </Button>

            <Card>
                <CardHeader>
                    <CardTitle>Review Vendor: {vendor.name}</CardTitle>
                    <CardDescription>Review the vendor's details and submitted documents before making a decision.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
                        <h3 className="font-semibold">Vendor Information</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div><Label>Contact Person</Label><p className="text-sm">{vendor.contactPerson}</p></div>
                            <div><Label>Email</Label><p className="text-sm">{vendor.email}</p></div>
                            <div><Label>Phone</Label><p className="text-sm">{vendor.phone}</p></div>
                            <div className="col-span-2"><Label>Address</Label><p className="text-sm">{vendor.address}</p></div>
                        </div>
                    </div>
                    
                    <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
                        <h3 className="font-semibold">Submitted Documents</h3>
                        <div className="flex flex-col sm:flex-row gap-4">
                            <Button asChild variant="outline" className="flex-1" disabled={!licenseDoc?.url}>
                                <a href={licenseDoc?.url || '#'} target="_blank" rel="noopener noreferrer">
                                <FileText className="mr-2"/> Business License
                                </a>
                            </Button>
                            <Button asChild variant="outline" className="flex-1" disabled={!taxDoc?.url}>
                                <a href={taxDoc?.url || '#'} target="_blank" rel="noopener noreferrer">
                                <FileText className="mr-2"/> Tax ID Document
                                </a>
                            </Button>
                        </div>
                    </div>

                    {action === 'reject' && (
                        <div className="pt-4 space-y-2">
                            <Label htmlFor="rejectionReason" className="text-base font-semibold">Reason for Rejection</Label>
                            <Textarea
                                id="rejectionReason"
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                                placeholder="e.g., Invalid document, information mismatch..."
                                className="h-24"
                            />
                        </div>
                    )}
                </CardContent>
                <CardFooter className="flex justify-end gap-4">
                    {action !== 'reject' && (
                        <Button variant="destructive" onClick={() => setAction('reject')} disabled={isSubmitting}>
                            <XCircle className="mr-2" /> Reject
                        </Button>
                    )}
                    {action === 'reject' && (
                         <Button variant="ghost" onClick={() => setAction(null)} disabled={isSubmitting}>
                            Cancel Rejection
                        </Button>
                    )}
                     <Button onClick={action === 'reject' ? handleSubmit : () => setAction('verify')} disabled={isSubmitting || action === 'verify'}>
                        {isSubmitting && action === 'verify' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        <CheckCircle className="mr-2" /> Verify Vendor
                    </Button>
                </CardFooter>
            </Card>

            {action === 'verify' && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
                    <Card className="w-full max-w-md">
                        <CardHeader>
                            <CardTitle>Confirm Verification</CardTitle>
                            <CardDescription>Are you sure you want to verify this vendor? This will allow them to start submitting quotations.</CardDescription>
                        </CardHeader>
                        <CardFooter className="justify-end gap-2">
                            <Button variant="ghost" onClick={() => setAction(null)}>Cancel</Button>
                             <Button onClick={handleSubmit} disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Yes, Verify
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            )}
        </div>
    );
}

