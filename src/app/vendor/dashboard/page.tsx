
'use client';

import { useState, useEffect, useMemo } from 'react';
import { PurchaseRequisition, Quotation, QuotationStatus, Vendor, KycStatus } from '@/lib/types';
import { useAuth } from '@/contexts/auth-context';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card"
import { Badge } from '@/components/ui/badge';
import { format, formatDistanceToNow, isPast } from 'date-fns';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowRight, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, Award, Timer, ShoppingCart, Loader2, ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

const PAGE_SIZE = 9;

type RequisitionCardStatus = 'Awarded' | 'Partially Awarded' | 'Submitted' | 'Not Awarded' | 'Action Required' | 'Accepted' | 'Invoice Submitted';

const VendorStatusBadge = ({ status }: { status: RequisitionCardStatus }) => {
  const statusInfo: Record<RequisitionCardStatus, {text: string, variant: 'default' | 'secondary' | 'destructive' | 'outline', className: string}> = {
    'Awarded': { text: 'Awarded to You', variant: 'default', className: 'bg-green-600 hover:bg-green-700' },
    'Partially Awarded': { text: 'Partially Awarded', variant: 'default', className: 'bg-green-600 hover:bg-green-700' },
    'Accepted': { text: 'You Accepted', variant: 'default', className: 'bg-blue-600 hover:bg-blue-700' },
    'Invoice Submitted': { text: 'Invoice Submitted', variant: 'default', className: 'bg-purple-600 hover:bg-purple-700' },
    'Submitted': { text: 'Submitted', variant: 'secondary', className: '' },
    'Not Awarded': { text: 'Not Awarded', variant: 'destructive', className: 'bg-gray-500 hover:bg-gray-600' },
    'Action Required': { text: 'Action Required', variant: 'default', className: '' },
  };

  const { text, variant, className } = statusInfo[status] || { text: 'Unknown', variant: 'outline', className: '' };

  return <Badge variant={variant} className={cn('absolute top-4 right-4', className)}>{text}</Badge>;
};


export default function VendorDashboardPage() {
    const { token, user } = useAuth();
    const router = useRouter();
    const [openRequisitions, setOpenRequisitions] = useState<PurchaseRequisition[]>([]);
    const [awardedRequisitions, setAwardedRequisitions] = useState<PurchaseRequisition[]>([]);
    const [vendor, setVendor] = useState<Vendor | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);

    useEffect(() => {
        if (!token || !user?.vendorId) return;

        const fetchAllData = async () => {
            setLoading(true);
            setError(null);
            try {
                // Fetch vendor details
                const vendorRes = await fetch(`/api/vendors`);
                if(!vendorRes.ok) throw new Error('Could not fetch vendor details.');
                const allVendors: Vendor[] = await vendorRes.json();
                const currentVendor = allVendors.find(v => v.id === user.vendorId);
                setVendor(currentVendor || null);

                // If vendor is not verified, don't fetch requisitions
                if (currentVendor?.kycStatus !== 'Verified') {
                    setOpenRequisitions([]);
                    setAwardedRequisitions([]);
                    return;
                }

                const response = await fetch('/api/requisitions?forVendor=true', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                if (!response.ok) {
                    if (response.status === 403) {
                         throw new Error('You do not have permission to view these resources.');
                    }
                    throw new Error('Failed to fetch requisitions.');
                }
                const allRequisitions: PurchaseRequisition[] = await response.json();

                const vendorAwards: PurchaseRequisition[] = [];
                const availableForQuoting: PurchaseRequisition[] = [];
                
                const awardStatuses: Array<QuotationStatus> = ['Awarded', 'Partially_Awarded', 'Accepted', 'Invoice_Submitted'];

                allRequisitions.forEach(req => {
                    const vendorQuote = req.quotations?.find(
                        (q: Quotation) => q.vendorId === user.vendorId
                    );

                    if (vendorQuote && awardStatuses.includes(vendorQuote.status)) {
                        vendorAwards.push(req);
                    }
                     else if (
                        req.status === 'RFQ_In_Progress' && 
                        req.deadline && !isPast(new Date(req.deadline)) &&
                        !vendorQuote
                    ) {
                        const isPublic = !req.allowedVendorIds || req.allowedVendorIds.length === 0;
                        const isPrivateAndAllowed = req.allowedVendorIds && req.allowedVendorIds.includes(user.vendorId!);

                        if (isPublic || isPrivateAndAllowed) {
                           availableForQuoting.push(req);
                        }
                    }
                });

                setAwardedRequisitions(vendorAwards.sort((a,b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
                setOpenRequisitions(availableForQuoting);

            } catch (err) {
                setError(err instanceof Error ? err.message : 'An unknown error occurred.');
            } finally {
                setLoading(false);
            }
        };

        fetchAllData();
    }, [token, user]);

    const getRequisitionCardStatus = (req: PurchaseRequisition): RequisitionCardStatus => {
        if (!user?.vendorId) return 'Action Required';

        const vendorQuote = req.quotations?.find(q => q.vendorId === user.vendorId);
        
        if (vendorQuote) {
          if (vendorQuote.status === 'Awarded') return 'Awarded';
          if (vendorQuote.status === 'Partially_Awarded') return 'Partially Awarded';
          if (vendorQuote.status === 'Accepted') return 'Accepted';
          if (vendorQuote.status === 'Invoice_Submitted') return 'Invoice Submitted';
          if (vendorQuote.status === 'Submitted') return 'Submitted';
        }
        
        const anAwardedQuote = req.quotations?.find(q => q.status === 'Awarded' || q.status === 'Accepted' || q.status === 'Partially_Awarded');
        if (anAwardedQuote && (!vendorQuote || vendorQuote.status === 'Rejected')) {
            return 'Not Awarded';
        }

        return 'Action Required';
    }


    const totalPages = Math.ceil(openRequisitions.length / PAGE_SIZE);
    const paginatedData = useMemo(() => {
        const startIndex = (currentPage - 1) * PAGE_SIZE;
        return openRequisitions.slice(startIndex, startIndex + PAGE_SIZE);
    }, [openRequisitions, currentPage]);


    return (
        <div className="space-y-8">

            {loading && <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}
            {error && <p className="text-destructive">Error: {error}</p>}

            {!loading && !error && (
                <>
                    {vendor?.kycStatus === 'Rejected' && (
                        <Alert variant="destructive">
                            <ShieldAlert className="h-5 w-5" />
                            <AlertTitle className="text-xl font-bold">Action Required: Your Account</AlertTitle>
                            <AlertDescription>
                                Your KYC verification was not successful. Reason: <strong>{vendor.rejectionReason || "No reason provided."}</strong>
                                <div className="mt-4">
                                    <Button onClick={() => router.push('/vendor/profile')}>
                                        Update Profile & Resubmit
                                    </Button>
                                </div>
                            </AlertDescription>
                        </Alert>
                    )}

                    {vendor?.kycStatus === 'Pending' && (
                         <Alert>
                            <AlertTitle className="font-bold">Account Pending Verification</AlertTitle>
                            <AlertDescription>
                                Your account is currently under review. You will be able to view and bid on requisitions once your account is verified.
                            </AlertDescription>
                        </Alert>
                    )}

                    {vendor?.kycStatus === 'Verified' && (
                        <>
                            {awardedRequisitions.length > 0 && (
                                <div className="space-y-4">
                                    <Alert className="border-primary/50 text-primary">
                                        <Award className="h-5 w-5 !text-primary" />
                                        <AlertTitle className="text-xl font-bold">Your Awarded Requisitions</AlertTitle>
                                        <AlertDescription className="text-primary/90">
                                            These are requisitions you have been awarded. Please respond or submit invoices as needed.
                                        </AlertDescription>
                                    </Alert>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {awardedRequisitions.map(req => {
                                            const vendorQuote = req.quotations?.find(q => q.vendorId === user.vendorId);
                                            const status = getRequisitionCardStatus(req);
                                            const isExpired = req.awardResponseDeadline && isPast(new Date(req.awardResponseDeadline)) && (status === 'Awarded' || status === 'Partially Awarded');
                                            return (
                                                <Card key={req.id} className={cn("border-primary ring-2 ring-primary/50 bg-primary/5 relative", isExpired && "opacity-60")}>
                                                    <VendorStatusBadge status={status} />
                                                    <CardHeader>
                                                        <CardTitle>{req.title}</CardTitle>
                                                        <CardDescription>From {req.department} Department</CardDescription>
                                                    </CardHeader>
                                                    <CardContent>
                                                        <div className="text-sm text-muted-foreground space-y-2">
                                                            <div><span className="font-semibold text-foreground">Requisition ID:</span> {req.id}</div>
                                                            {(status === 'Awarded' || status === 'Partially Awarded') && req.awardResponseDeadline && (
                                                                <div className={cn("flex items-center gap-1", isExpired ? "text-destructive" : "text-amber-600")}>
                                                                    <Timer className="h-4 w-4" />
                                                                    <span className="font-semibold">
                                                                        Respond by: {format(new Date(req.awardResponseDeadline), 'PPpp')}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </CardContent>
                                                    <CardFooter>
                                                        <Button asChild className="w-full" variant="secondary" disabled={isExpired}>
                                                            <Link href={`/vendor/requisitions/${req.id}`}>
                                                                {(status === 'Awarded' || status === 'Partially Awarded') && (isExpired ? 'Offer Expired' : 'Respond to Award')}
                                                                {status === 'Accepted' && 'Submit Invoice'}
                                                                {status === 'Invoice Submitted' && 'View PO / Invoice'}
                                                                <ArrowRight className="ml-2 h-4 w-4" />
                                                            </Link>
                                                        </Button>
                                                    </CardFooter>
                                                </Card>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <h2 className="text-3xl font-bold">Open for Quotation</h2>
                                    <p className="text-muted-foreground">
                                        The following requisitions are currently open for quotation.
                                    </p>
                                </div>
                                {paginatedData.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {paginatedData.map((req) => {
                                        const status = getRequisitionCardStatus(req);
                                        const isClickable = status !== 'Not Awarded';

                                        return (
                                            <Card key={req.id} className={cn("flex flex-col hover:shadow-md transition-shadow relative", !isClickable && "opacity-60")}>
                                                <VendorStatusBadge status={status} />
                                                <CardHeader>
                                                    <CardTitle>{req.title}</CardTitle>
                                                    <CardDescription>From {req.department} Department</CardDescription>
                                                </CardHeader>
                                                <CardContent className="flex-grow">
                                                    <div className="text-sm text-muted-foreground space-y-2">
                                                        <div>
                                                            <span className="font-semibold text-foreground">Requisition ID:</span> {req.id}
                                                        </div>
                                                        <div>
                                                            <span className="font-semibold text-foreground">Posted:</span> {formatDistanceToNow(new Date(req.createdAt), { addSuffix: true })}
                                                        </div>
                                                        {req.deadline && (
                                                            <div>
                                                                <span className="font-semibold text-foreground">Deadline:</span> {format(new Date(req.deadline), 'PPpp')}
                                                            </div>
                                                        )}
                                                    </div>
                                                </CardContent>
                                                <CardFooter>
                                                    <Button asChild className="w-full" disabled={!isClickable}>
                                                        <Link href={`/vendor/requisitions/${req.id}`}>
                                                            {status === 'Submitted' ? 'View Your Quote' : 'View & Quote'} <ArrowRight className="ml-2 h-4 w-4" />
                                                        </Link>
                                                    </Button>
                                                </CardFooter>
                                            </Card>
                                        )}
                                    )}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed rounded-lg bg-muted/30">
                                        <ShoppingCart className="h-16 w-16 text-muted-foreground/50" />
                                        <h3 className="mt-6 text-xl font-semibold">No Open Requisitions</h3>
                                        <p className="mt-2 text-sm text-muted-foreground">There are no requisitions currently available for quotation.</p>
                                    </div>
                                )}

                                {totalPages > 1 && (
                                    <div className="flex items-center justify-between mt-4">
                                        <div className="text-sm text-muted-foreground">
                                            Page {currentPage} of {totalPages}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button variant="outline" size="icon" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}><ChevronsLeft /></Button>
                                            <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft /></Button>
                                            <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight /></Button>
                                            <Button variant="outline" size="icon" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}><ChevronsRight /></Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </>
            )}
        </div>
    )
}
    
