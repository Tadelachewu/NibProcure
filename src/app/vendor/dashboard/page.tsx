
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { PurchaseRequisition, Quotation, Vendor, PerItemAwardDetail, PurchaseOrder } from '@/lib/types';
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
import { ArrowRight, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, Award, Timer, ShoppingCart, Loader2, ShieldAlert, List, AlertCircle, FileText } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const OPEN_PAGE_SIZE = 9;
const ACTIVE_PAGE_SIZE = 6;

type RequisitionCardStatus = 'Awarded' | 'Partially Awarded' | 'Submitted' | 'Not Awarded' | 'Action Required' | 'Accepted' | 'Invoice Submitted' | 'Standby' | 'Processing' | 'Closed' | 'Declined' | 'Delivery Issue' | 'Failed_to_Award' | 'Paid';

const VendorStatusBadge = ({ status, reason }: { status: RequisitionCardStatus, reason?: string }) => {
  const statusInfo: Record<RequisitionCardStatus, {text: string, variant: 'default' | 'secondary' | 'destructive' | 'outline', className: string}> = {
    'Awarded': { text: 'Awarded to You', variant: 'default', className: 'bg-green-600 hover:bg-green-700' },
    'Partially Awarded': { text: 'Partially Awarded', variant: 'default', className: 'bg-green-600 hover:bg-green-700' },
    'Accepted': { text: 'You Accepted', variant: 'default', className: 'bg-blue-600 hover:bg-blue-700' },
    'Invoice Submitted': { text: 'Invoice Submitted', variant: 'default', className: 'bg-purple-600 hover:bg-purple-700' },
    'Paid': { text: 'Paid', variant: 'default', className: 'bg-emerald-600 hover:bg-emerald-700' },
    'Declined': { text: 'You Declined', variant: 'destructive', className: '' },
    'Delivery Issue': { text: 'Delivery Issue', variant: 'destructive', className: '' },
    'Submitted': { text: 'Submitted', variant: 'secondary', className: '' },
    'Processing': { text: 'Processing', variant: 'secondary', className: '' },
    'Closed': { text: 'Closed', variant: 'outline', className: '' },
    'Not Awarded': { text: 'Not Awarded', variant: 'destructive', className: 'bg-gray-500 hover:bg-gray-600' },
    'Failed_to_Award': { text: 'Not Awarded', variant: 'destructive', className: 'bg-gray-500 hover:bg-gray-600' },
    'Action Required': { text: 'Action Required', variant: 'default', className: '' },
    'Standby': { text: 'On Standby', variant: 'outline', className: 'border-amber-500 text-amber-600' },
  };

  const { text, variant, className } = statusInfo[status] || { text: 'Unknown', variant: 'outline', className: '' };

  const badge = <Badge variant={variant} className={cn('absolute top-4 right-4', className)}>{text}</Badge>;

  if (reason) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative">
              {badge}
              <AlertCircle className="absolute top-5 right-5 h-4 w-4 text-destructive-foreground opacity-80" />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Reason: {reason}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return badge;
};


export default function VendorDashboardPage() {
    const { token, user } = useAuth();
    const router = useRouter();
    const { toast } = useToast();
    const [allRequisitions, setAllRequisitions] = useState<PurchaseRequisition[]>([]);
    const [vendor, setVendor] = useState<Vendor | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [openCurrentPage, setOpenCurrentPage] = useState(1);
    const [activeCurrentPage, setActiveCurrentPage] = useState(1);
    const [allPOs, setAllPOs] = useState<PurchaseOrder[]>([]);

    const fetchAllData = useCallback(async () => {
        if (!token || !user?.vendorId) {
            setLoading(false);
            return;
        };

        setLoading(true);
        setError(null);
        try {
            const [vendorRes, reqRes, poRes] = await Promise.all([
                fetch(`/api/vendors`),
                fetch('/api/requisitions?forVendor=true', { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch('/api/purchase-orders', { headers: { 'Authorization': `Bearer ${token}` } })
            ]);

            if(!vendorRes.ok) throw new Error('Could not fetch vendor details.');
            const allVendors: Vendor[] = await vendorRes.json();
            const currentVendor = allVendors.find(v => v.id === user.vendorId);
            setVendor(currentVendor || null);
            
            if (!reqRes.ok) {
                if (reqRes.status === 403) throw new Error('You do not have permission to view these resources.');
                throw new Error('Failed to fetch requisitions.');
            }
            const reqData = await reqRes.json();
            const requisitionsData: PurchaseRequisition[] = reqData.requisitions || [];
            
            if(!poRes.ok) throw new Error('Could not fetch purchase orders.');
            const poData: PurchaseOrder[] = await poRes.json();
            setAllPOs(poData);

            setAllRequisitions(requisitionsData);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred.');
        } finally {
            setLoading(false);
        }
    }, [token, user]);

    useEffect(() => {
        fetchAllData();
    }, [fetchAllData]);

    const getRequisitionCardStatus = useCallback((req: PurchaseRequisition): { status: RequisitionCardStatus, reason?: string } => {
        if (!user?.vendorId) return { status: 'Action Required' };

        const vendorQuote = req.quotations?.find(q => q.vendorId === user.vendorId);
        const isPerItemAward = (req.rfqSettings as any)?.awardStrategy === 'item';
        
        const posForVendor = allPOs.filter(po => po.requisitionId === req.id && po.vendor.id === user.vendorId) || [];
        const isAnyPaid = posForVendor.some(po => po.invoices?.some(inv => inv.status === 'Paid'));

        if (isAnyPaid) return { status: 'Paid' };

        const isAnyDisputed = posForVendor.some(po => po.receipts?.some(r => r.status === 'Disputed'));
        if (isAnyDisputed) {
            const firstDisputedReceipt = posForVendor.flatMap(po => po.receipts || []).find(r => r.status === 'Disputed');
            const firstDisputedItem = firstDisputedReceipt?.items.find(i => i.condition !== 'Good');
            return { status: 'Delivery Issue', reason: firstDisputedItem?.notes || 'An item was marked as damaged or incorrect.' };
        }
        
        if (isPerItemAward) {
            const vendorItemDetails = req.items.flatMap(item => 
                (item.perItemAwardDetails as PerItemAwardDetail[] || []).filter(d => d.vendorId === user.vendorId)
            );

            if (vendorItemDetails.some(d => d.status === 'Declined')) {
                const declinedDetail = vendorItemDetails.find(d => d.status === 'Declined');
                return { status: 'Declined', reason: (declinedDetail as any)?.rejectionReason };
            }

            if (vendorItemDetails.some(d => d.status === 'Accepted')) return { status: 'Accepted' };
            if (vendorItemDetails.some(d => d.status === 'Awarded')) {
                const totalAwardsPossible = req.items.flatMap(i => (i.perItemAwardDetails || [])).filter(d => d.vendorId === user.vendorId).length;
                const wonAwards = vendorItemDetails.filter(d => d.status === 'Awarded' || d.status === 'Accepted').length;
                return { status: wonAwards === totalAwardsPossible ? 'Awarded' : 'Partially Awarded' };
            }
            if (vendorItemDetails.some(d => d.status === 'Standby')) {
                const isStandbyRelevant = vendorItemDetails.some(detail => {
                    if (detail.status !== 'Standby') return false;
                    const item = req.items.find(i => i.id === detail.requisitionItemId);
                    if (!item) return false;
                    const allDetailsForItem = (item.perItemAwardDetails as PerItemAwardDetail[] || []);
                    return !allDetailsForItem.some(d => d.status === 'Accepted');
                });

                if (!isStandbyRelevant || req.status === 'Closed' || req.status === 'Fulfilled') {
                    return { status: 'Not Awarded' };
                }
                return { status: 'Standby' };
            }
        }
        
        if (vendorQuote) {
            if (req.status === 'Closed' || req.status === 'Fulfilled') {
                return vendorQuote.status === 'Accepted' ? { status: 'Closed' } : { status: 'Not Awarded' };
            }
            if (vendorQuote.status === 'Invoice_Submitted') return { status: 'Invoice Submitted' };
            if (vendorQuote.status === 'Accepted') return { status: 'Accepted' };
            if (vendorQuote.status === 'Declined') return { status: 'Declined', reason: vendorQuote.rejectionReason };
            if (vendorQuote.status === 'Awarded') return { status: 'Awarded' };
            if (vendorQuote.status === 'Standby') return { status: 'Standby' };
            if (vendorQuote.status === 'Rejected') return { status: 'Not Awarded' };

            if (vendorQuote.status === 'Submitted') {
                if (req.quotations?.some(q => q.vendorId !== user.vendorId && ['Awarded', 'Accepted', 'Partially_Awarded'].includes(q.status))) return { status: 'Not Awarded' };
                return { status: 'Submitted' };
            }
        }
        
        if (req.status === 'Accepting_Quotes') {
            return { status: 'Action Required' };
        }
        
        return { status: 'Processing' };
    }, [user, allPOs]);


    const { activeRequisitions, openForQuoting } = useMemo(() => {
        const active: PurchaseRequisition[] = [];
        const open: PurchaseRequisition[] = [];

        allRequisitions.forEach(req => {
            const vendorQuote = req.quotations?.find(q => q.vendorId === user?.vendorId);
            const isRelated = vendorQuote || 
                              req.items.some(item => (item.perItemAwardDetails as any[])?.some(d => d.vendorId === user?.vendorId));

            if (isRelated) {
                active.push(req);
            } else if (req.status === 'Accepting_Quotes') {
                open.push(req);
            }
        });
        
        return { 
            activeRequisitions: active.sort((a,b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
            openForQuoting: open.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
        };

    }, [allRequisitions, user]);


    const openTotalPages = Math.ceil(openForQuoting.length / OPEN_PAGE_SIZE);
    const paginatedOpenData = useMemo(() => {
        const startIndex = (openCurrentPage - 1) * OPEN_PAGE_SIZE;
        return openForQuoting.slice(startIndex, startIndex + OPEN_PAGE_SIZE);
    }, [openForQuoting, openCurrentPage]);

    const activeTotalPages = Math.ceil(activeRequisitions.length / ACTIVE_PAGE_SIZE);
    const paginatedActiveData = useMemo(() => {
        const startIndex = (activeCurrentPage - 1) * ACTIVE_PAGE_SIZE;
        return activeRequisitions.slice(startIndex, startIndex + ACTIVE_PAGE_SIZE);
    }, [activeRequisitions, activeCurrentPage]);


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
                             <div className="space-y-4">
                                <div className="space-y-1">
                                    <h2 className="text-3xl font-bold">Open for Quotation</h2>
                                    <p className="text-muted-foreground">
                                        The following requisitions are currently open for quotation.
                                    </p>
                                </div>
                                {paginatedOpenData.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {paginatedOpenData.map((req) => (
                                        <Card key={req.id} className="flex flex-col hover:shadow-md transition-shadow relative">
                                            <CardHeader>
                                                <CardTitle>{req.title}</CardTitle>
                                                <CardDescription>From {req.department} Department</CardDescription>
                                            </CardHeader>
                                            <CardContent className="flex-grow">
                                                <div className="text-sm text-muted-foreground space-y-2">
                                                    <div>
                                                        <span className="font-semibold text-foreground">Posted:</span> {formatDistanceToNow(new Date(req.updatedAt), { addSuffix: true })}
                                                    </div>
                                                    {req.deadline && (
                                                        <div className="flex items-center gap-1.5 font-semibold text-destructive">
                                                            <Timer className="h-4 w-4" />
                                                            <span>Deadline: {format(new Date(req.deadline), 'PPpp')}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </CardContent>
                                            <CardFooter>
                                                <Button asChild className="w-full">
                                                    <Link href={`/vendor/requisitions/${req.id}`}>
                                                        View & Quote <ArrowRight className="ml-2 h-4 w-4" />
                                                    </Link>
                                                </Button>
                                            </CardFooter>
                                        </Card>
                                        )
                                    )}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-32 border-2 border-dashed rounded-lg bg-muted/30">
                                        <ShoppingCart className="h-10 w-10 text-muted-foreground/50" />
                                        <h3 className="mt-4 text-lg font-semibold">No Open Requisitions</h3>
                                        <p className="mt-1 text-sm text-muted-foreground">There are no new requisitions available for quotation.</p>
                                    </div>
                                )}

                                {openTotalPages > 1 && (
                                    <div className="flex items-center justify-between mt-4">
                                        <div className="text-sm text-muted-foreground">
                                            Page {openCurrentPage} of {openTotalPages}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button variant="outline" size="icon" onClick={() => setOpenCurrentPage(1)} disabled={openCurrentPage === 1}><ChevronsLeft /></Button>
                                            <Button variant="outline" size="icon" onClick={() => setOpenCurrentPage(p => Math.max(1, p - 1))} disabled={openCurrentPage === 1}><ChevronLeft /></Button>
                                            <Button variant="outline" size="icon" onClick={() => setOpenCurrentPage(p => Math.min(openTotalPages, p + 1))} disabled={openCurrentPage === openTotalPages}><ChevronRight /></Button>
                                            <Button variant="outline" size="icon" onClick={() => setOpenCurrentPage(openTotalPages)} disabled={openCurrentPage === openTotalPages}><ChevronsRight /></Button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {activeRequisitions.length > 0 && (
                                <div className="space-y-4 pt-8 border-t">
                                    <Alert className="border-primary/50 text-primary">
                                        <Award className="h-5 w-5 !text-primary" />
                                        <AlertTitle className="text-xl font-bold">Your Active Requisitions</AlertTitle>
                                        <AlertDescription className="text-primary/90">
                                            This includes requisitions you have quoted on, been awarded, or are on standby for.
                                        </AlertDescription>
                                    </Alert>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {paginatedActiveData.map(req => {
                                            const { status, reason } = getRequisitionCardStatus(req);
                                            const isExpired = req.awardResponseDeadline && isPast(new Date(req.awardResponseDeadline)) && (status === 'Awarded' || status === 'Partially Awarded');
                                            const isActionable = status === 'Awarded' || status === 'Partially Awarded' || status === 'Accepted' || status === 'Invoice Submitted' || status === 'Paid';
                                            const vendorPO = allPOs.find(po => po.requisitionId === req.id && po.vendor.id === user?.vendorId);
                                            const paymentEvidenceUrl = vendorPO?.invoices?.find(inv => inv.status === 'Paid')?.paymentEvidenceUrl;

                                            return (
                                                <Card key={req.id} className={cn("relative flex flex-col", (status === 'Awarded' || status === 'Partially Awarded') && "border-primary ring-2 ring-primary/50 bg-primary/5", isExpired && "opacity-60")}>
                                                    <VendorStatusBadge status={status} reason={reason} />
                                                    <CardHeader>
                                                        <CardTitle>{req.title}</CardTitle>
                                                        <CardDescription>From {req.department} Department</CardDescription>
                                                    </CardHeader>
                                                    <CardContent className="flex-grow space-y-4">
                                                        <div className="text-sm text-muted-foreground space-y-2">
                                                            {(status === 'Awarded' || status === 'Partially Awarded') && req.awardResponseDeadline && (
                                                                <div className={cn("flex items-center gap-1", isExpired ? "text-destructive" : "text-amber-600")}>
                                                                    <Timer className="h-4 w-4" />
                                                                    <span className="font-semibold">
                                                                        Respond by: {format(new Date(req.awardResponseDeadline), 'PPpp')}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            {status === 'Paid' && paymentEvidenceUrl && (
                                                                 <a href={paymentEvidenceUrl} target="_blank" rel="noopener noreferrer">
                                                                    <Button variant="outline" size="sm" className="w-full">
                                                                        <FileText className="mr-2 h-4 w-4" /> View Payment Evidence
                                                                    </Button>
                                                                </a>
                                                            )}
                                                        </div>
                                                    </CardContent>
                                                    <CardFooter>
                                                        <Button asChild className="w-full" variant={isActionable ? "default" : "secondary"} disabled={isExpired}>
                                                            <Link href={`/vendor/requisitions/${req.id}`}>
                                                                {status === 'Awarded' || status === 'Partially Awarded' ? (isExpired ? 'Offer Expired' : 'Respond to Award') : 'View Details'}
                                                                <ArrowRight className="ml-2 h-4 w-4" />
                                                            </Link>
                                                        </Button>
                                                    </CardFooter>
                                                </Card>
                                            )
                                        })}
                                    </div>
                                    {activeTotalPages > 1 && (
                                        <div className="flex items-center justify-between mt-4">
                                            <div className="text-sm text-muted-foreground">
                                                Page {activeCurrentPage} of {activeTotalPages}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Button variant="outline" size="icon" onClick={() => setActiveCurrentPage(1)} disabled={activeCurrentPage === 1}><ChevronsLeft /></Button>
                                                <Button variant="outline" size="icon" onClick={() => setActiveCurrentPage(p => Math.max(1, p - 1))} disabled={activeCurrentPage === 1}><ChevronLeft /></Button>
                                                <Button variant="outline" size="icon" onClick={() => setActiveCurrentPage(p => Math.min(activeTotalPages, p + 1))} disabled={activeCurrentPage === activeTotalPages}><ChevronRight /></Button>
                                                <Button variant="outline" size="icon" onClick={() => setActiveCurrentPage(activeTotalPages)} disabled={activeCurrentPage === activeTotalPages}><ChevronsRight /></Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    )
