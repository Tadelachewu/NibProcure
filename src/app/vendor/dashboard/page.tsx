
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { PurchaseRequisition, Quotation, QuotationStatus, Vendor, KycStatus, PerItemAwardDetail, RequisitionItem, QuoteItem } from '@/lib/types';
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
import { ArrowRight, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, Award, Timer, ShoppingCart, Loader2, ShieldAlert, List } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

const OPEN_PAGE_SIZE = 9;
const ACTIVE_PAGE_SIZE = 6;

type RequisitionCardStatus = 'Awarded' | 'Partially Awarded' | 'Submitted' | 'Not Awarded' | 'Action Required' | 'Accepted' | 'Invoice Submitted' | 'Standby' | 'Processing' | 'Closed' | 'Declined' | 'Failed_to_Award';

const VendorStatusBadge = ({ status }: { status: RequisitionCardStatus }) => {
  const statusInfo: Record<RequisitionCardStatus, {text: string, variant: 'default' | 'secondary' | 'destructive' | 'outline', className: string}> = {
    'Awarded': { text: 'Awarded to You', variant: 'default', className: 'bg-green-600 hover:bg-green-700' },
    'Partially Awarded': { text: 'Partially Awarded', variant: 'default', className: 'bg-green-600 hover:bg-green-700' },
    'Accepted': { text: 'You Accepted', variant: 'default', className: 'bg-blue-600 hover:bg-blue-700' },
    'Invoice Submitted': { text: 'Invoice Submitted', variant: 'default', className: 'bg-purple-600 hover:bg-purple-700' },
    'Declined': { text: 'You Declined', variant: 'destructive', className: '' },
    'Submitted': { text: 'Submitted', variant: 'secondary', className: '' },
    'Processing': { text: 'Processing', variant: 'secondary', className: '' },
    'Closed': { text: 'Closed', variant: 'outline', className: '' },
    'Not Awarded': { text: 'Not Awarded', variant: 'destructive', className: 'bg-gray-500 hover:bg-gray-600' },
    'Failed_to_Award': { text: 'Not Awarded', variant: 'destructive', className: 'bg-gray-500 hover:bg-gray-600' },
    'Action Required': { text: 'Action Required', variant: 'default', className: '' },
    'Standby': { text: 'On Standby', variant: 'outline', className: 'border-amber-500 text-amber-600' },
  };

  const { text, variant, className } = statusInfo[status] || { text: 'Unknown', variant: 'outline', className: '' };

  return <Badge variant={variant} className={cn('absolute top-4 right-4', className)}>{text}</Badge>;
};


export default function VendorDashboardPage() {
    const { token, user } = useAuth();
    const router = useRouter();
    const [allRequisitions, setAllRequisitions] = useState<PurchaseRequisition[]>([]);
    const [vendor, setVendor] = useState<Vendor | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [openCurrentPage, setOpenCurrentPage] = useState(1);
    const [activeCurrentPage, setActiveCurrentPage] = useState(1);

    const fetchAllData = useCallback(async () => {
        if (!token || !user?.vendorId) {
            setLoading(false);
            return;
        };

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
                setAllRequisitions([]);
                setLoading(false);
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
            const requisitionsData: PurchaseRequisition[] = await response.json();
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

    const getRequisitionCardStatus = useCallback((req: PurchaseRequisition): RequisitionCardStatus => {
        if (!user?.vendorId) return 'Action Required';

        const vendorQuote = req.quotations?.find(q => q.vendorId === user.vendorId);
        const isPerItemAward = (req.rfqSettings as any)?.awardStrategy === 'item';

        if (vendorQuote?.status === 'Awarded' && !isPerItemAward) {
            return 'Awarded';
        }
        
        // Highest priority statuses from the vendor's main quote
        if (vendorQuote) {
            if (vendorQuote.status === 'Invoice_Submitted') return 'Invoice Submitted';
            if (vendorQuote.status === 'Accepted') return 'Accepted';
            if (vendorQuote.status === 'Declined') return 'Declined';
        }

        let vendorItemStatuses: PerItemAwardDetail[] = [];
        if (isPerItemAward) {
            vendorItemStatuses = req.items.flatMap(item => 
                (item.perItemAwardDetails as PerItemAwardDetail[] || [])
                .filter(d => d.vendorId === user.vendorId)
            );
        } else if (vendorQuote) { // For single-vendor award, derive item statuses from quote status
            if (vendorQuote.status === 'Awarded') vendorItemStatuses.push({ status: 'Awarded' } as PerItemAwardDetail);
            if (vendorQuote.status === 'Partially_Awarded') vendorItemStatuses.push({ status: 'Awarded' } as PerItemAwardDetail);
            if (vendorQuote.status === 'Standby') vendorItemStatuses.push({ status: 'Standby' } as PerItemAwardDetail);
        }

        // Check for highest priority statuses derived from items
        if (vendorItemStatuses.some(d => d.status === 'Accepted')) return 'Accepted';
        if (vendorItemStatuses.some(d => d.status === 'Declined')) return 'Declined';
        if (vendorItemStatuses.some(d => d.status === 'Awarded')) {
             if (!isPerItemAward) {
                return 'Awarded';
            }
            // For per-item, check if ALL potential awards were won.
            const potentialAwards = req.items.flatMap(i => (i.perItemAwardDetails || [])).filter(d => d.vendorId === user.vendorId);
            const wonAwards = potentialAwards.filter(d => d.status === 'Awarded' || d.status === 'Accepted');
            
            return wonAwards.length === potentialAwards.length ? 'Awarded' : 'Partially Awarded';
        }
        if (vendorItemStatuses.some(d => d.status === 'Standby')) return 'Standby';

        // Check statuses from the main quote again if no item-level status took precedence
        if (vendorQuote) {
             if (vendorQuote.status === 'Standby') return 'Standby';
            if (vendorQuote.status === 'Submitted') {
                if (req.status === 'Closed' || req.status === 'Fulfilled') return 'Not Awarded';
                if (req.quotations?.some(q => q.vendorId !== user.vendorId && ['Awarded', 'Accepted', 'Partially_Awarded'].includes(q.status))) return 'Not Awarded';
                return 'Submitted';
            }
        }
        
        // If related but no other status fits, it means they can quote
        const isRelated = vendorQuote || vendorItemStatuses.length > 0;
        if (!isRelated) {
            return 'Action Required';
        }

        // Final fallbacks
        if (req.status === 'Closed' || req.status === 'Fulfilled') return 'Closed';
        
        return 'Processing'; // Default for other intermediate states
    }, [user]);


    const { activeRequisitions, openForQuoting } = useMemo(() => {
        const active: PurchaseRequisition[] = [];
        const open: PurchaseRequisition[] = [];

        allRequisitions.forEach(req => {
            const vendorQuote = req.quotations?.find(q => q.vendorId === user?.vendorId);
            
            // Check if any item in this requisition is specifically re-opened for this vendor
            const hasReopenedItemForVendor = req.items.some(item => 
                item.reopenDeadline && isPast(new Date(item.reopenDeadline)) === false &&
                item.reopenVendorIds?.includes(user?.vendorId || '')
            );

            // A requisition is active if the vendor submitted a quote for it, OR if they won an award
            const isRelated = vendorQuote || 
                              req.items.some(item => (item.perItemAwardDetails as any[])?.some(d => d.vendorId === user?.vendorId));

            if (isRelated) {
                active.push(req);
            } else if (hasReopenedItemForVendor || req.status === 'Accepting_Quotes') {
                // It's open if it's generally accepting quotes, OR has a specific re-opened item for this vendor
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
                                                        <span className="font-semibold text-foreground">Requisition ID:</span> {req.id}
                                                    </div>
                                                    <div>
                                                        <span className="font-semibold text-foreground">Posted:</span> {formatDistanceToNow(new Date(req.createdAt), { addSuffix: true })}
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
                                            const status = getRequisitionCardStatus(req);
                                            const isExpired = req.awardResponseDeadline && isPast(new Date(req.awardResponseDeadline)) && (status === 'Awarded' || status === 'Partially Awarded');
                                            const isActionable = status === 'Awarded' || status === 'Partially Awarded' || status === 'Accepted' || status === 'Invoice Submitted';
                                            const vendorQuote = req.quotations?.find(q => q.vendorId === user?.vendorId);
                                            
                                            let itemsToList: (QuoteItem | { id: string, name: string, quantity: number })[] = [];

                                            if (status === 'Awarded' || status === 'Partially Awarded' || status === 'Accepted') {
                                                const strategy = (req.rfqSettings as any)?.awardStrategy || 'all';
                                                if (strategy === 'item' && user) {
                                                    const awardedDetails = req.items.flatMap(item => (item.perItemAwardDetails || []).filter(d => d.vendorId === user.vendorId && (d.status === 'Awarded' || d.status === 'Accepted')));
                                                    itemsToList = awardedDetails.map(detail => {
                                                        const reqItem = req.items.find(i => i.id === detail.requisitionItemId);
                                                        return { id: detail.quoteItemId, name: detail.proposedItemName, quantity: reqItem?.quantity || 0 };
                                                    });
                                                } else if (vendorQuote) {
                                                    const awardedItemIds = new Set(req.awardedQuoteItemIds || []);
                                                    if (awardedItemIds.size > 0) {
                                                        itemsToList = vendorQuote.items.filter(i => awardedItemIds.has(i.id));
                                                    } else {
                                                        itemsToList = vendorQuote.items;
                                                    }
                                                }
                                            } else if (status === 'Standby' && vendorQuote) {
                                                const strategy = (req.rfqSettings as any)?.awardStrategy || 'all';
                                                if(strategy === 'item' && user) {
                                                    const standbyDetails = req.items.flatMap(item => (item.perItemAwardDetails || []).filter(d => d.vendorId === user.vendorId && d.status === 'Standby'));
                                                    itemsToList = standbyDetails.map(detail => {
                                                        const reqItem = req.items.find(i => i.id === detail.requisitionItemId);
                                                        return { id: detail.quoteItemId, name: detail.proposedItemName, quantity: reqItem?.quantity || 0 };
                                                    });
                                                } else { // Single vendor standby logic
                                                    const championBids: QuoteItem[] = [];
                                                    for (const reqItem of req.items) {
                                                        const proposalsForItem = vendorQuote.items.filter(i => i.requisitionItemId === reqItem.id);
                                                        if (proposalsForItem.length === 0) continue;

                                                        let bestProposalForItem: QuoteItem | null = null;
                                                        let bestItemScore = -1;

                                                        proposalsForItem.forEach(proposal => {
                                                            let totalItemScore = 0;
                                                            let scoreCount = 0;
                                                            vendorQuote.scores?.forEach(scoreSet => {
                                                                const itemScore = scoreSet.itemScores?.find(i => i.quoteItemId === proposal.id);
                                                                if (itemScore) {
                                                                    totalItemScore += itemScore.finalScore;
                                                                    scoreCount++;
                                                                }
                                                            });
                                                            const averageItemScore = scoreCount > 0 ? totalItemScore / scoreCount : 0;
                                                            
                                                            if (averageItemScore > bestItemScore) {
                                                                bestItemScore = averageItemScore;
                                                                bestProposalForItem = proposal;
                                                            }
                                                        });

                                                        if (bestProposalForItem) {
                                                            championBids.push(bestProposalForItem);
                                                        }
                                                    }
                                                    itemsToList = championBids;
                                                }
                                            }

                                            return (
                                                <Card key={req.id} className={cn("relative flex flex-col", (status === 'Awarded' || status === 'Partially Awarded') && "border-primary ring-2 ring-primary/50 bg-primary/5", isExpired && "opacity-60")}>
                                                    <VendorStatusBadge status={status} />
                                                    <CardHeader>
                                                        <CardTitle>{req.title}</CardTitle>
                                                        <CardDescription>From {req.department} Department</CardDescription>
                                                    </CardHeader>
                                                    <CardContent className="flex-grow space-y-4">
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
                                                        {itemsToList.length > 0 && (
                                                            <div className="text-sm space-y-2 pt-2 border-t">
                                                                <h4 className="font-semibold flex items-center gap-2"><List /> {status.includes('Award') ? 'Awarded Items' : 'Standby Items'}</h4>
                                                                <ul className="list-disc pl-5 text-muted-foreground">
                                                                {itemsToList.map(item => (
                                                                    <li key={item.id}>{item.name} (Qty: {item.quantity})</li>
                                                                ))}
                                                                </ul>
                                                            </div>
                                                        )}
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
}
