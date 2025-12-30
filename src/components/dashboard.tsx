
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  FilePlus,
  FileText,
  GanttChartSquare,
  Loader2,
  Banknote,
  AlertTriangle,
  PackageCheck,
  FileBadge,
  Trophy,
  Users,
  Wallet,
  Edit,
  CheckCircle,
  KeyRound,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { Invoice, PurchaseOrder, PurchaseRequisition, DirectorPin } from '@/lib/types';
import { Table, TableBody, TableCell, TableHeader, TableRow, TableHead } from './ui/table';
import { Badge } from './ui/badge';
import { format, formatDistanceToNow, isPast } from 'date-fns';
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { getActivePinsForUser } from '@/services/pin-generation-service';

const StatCard = ({
  title,
  value,
  description,
  icon,
  onClick,
  cta,
  variant = 'default'
}: {
  title: string;
  value: string;
  description: string;
  icon: React.ReactNode;
  onClick?: () => void;
  cta?: string;
  variant?: 'default' | 'destructive'
}) => (
  <Card className={variant === 'destructive' ? 'bg-destructive/10 border-destructive/50' : ''}>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      {icon}
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </CardContent>
    {onClick && cta && (
      <CardFooter>
        <Button variant="outline" size="sm" onClick={onClick} className="w-full">
          {cta} <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardFooter>
    )}
  </Card>
);

const RecentRequisitionsTable = ({ requisitions }: { requisitions: PurchaseRequisition[] }) => {
    const router = useRouter();
    return (
        <Card className="col-span-1 lg:col-span-2">
            <CardHeader>
                <CardTitle>Your Recent Requisitions</CardTitle>
                <CardDescription>The last 5 requisitions you created.</CardDescription>
            </CardHeader>
            <CardContent>
                 <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Title</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Created</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {requisitions.map(req => (
                            <TableRow key={req.id} className="cursor-pointer" onClick={() => router.push(`/requisitions/${req.id}/edit`)}>
                                <TableCell className="font-medium">{req.title}</TableCell>
                                <TableCell><Badge>{req.status.replace(/_/g, ' ')}</Badge></TableCell>
                                <TableCell>{format(new Date(req.createdAt), 'PP')}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    )
}

function DirectorPinCard({ pins, isLoading }: { pins: DirectorPin[], isLoading: boolean }) {
    if (isLoading) {
        return <Card><CardContent className="p-4 flex justify-center items-center h-24"><Loader2 className="h-6 w-6 animate-spin" /></CardContent></Card>;
    }
    if (pins.length === 0) return null;

    return (
        <Card className="col-span-1 md:col-span-2 lg:col-span-4 border-primary/50">
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><KeyRound /> Director PINs for Award Review</CardTitle>
                <CardDescription>Use these one-time PINs when providing your final approval on an award recommendation.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Requisition ID</TableHead>
                            <TableHead>Requisition Title</TableHead>
                            <TableHead className="text-right">Your Unique PIN</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {pins.map(pin => (
                            <TableRow key={pin.id}>
                                <TableCell className="font-mono">{pin.requisition.id}</TableCell>
                                <TableCell>{pin.requisition.title}</TableCell>
                                <TableCell className="text-right">
                                    <Badge variant="default" className="text-lg font-mono tracking-widest">{pin.pin}</Badge>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    )
}

function RequesterDashboard() {
    const { user, token } = useAuth();
    const [requisitions, setRequisitions] = useState<PurchaseRequisition[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        if (!user || !token) return;
        setLoading(true);
        fetch(`/api/requisitions?requesterId=${user.id}`, { headers: { 'Authorization': `Bearer ${token}` } })
            .then(res => res.json())
            .then(data => setRequisitions(data.requisitions || []))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [user, token]);

    const stats = useMemo(() => {
        const drafts = requisitions.filter(r => r.status === 'Draft').length;
        const pending = requisitions.filter(r => r.status === 'Pending_Approval').length;
        const rejected = requisitions.filter(r => r.status === 'Rejected').length;
        return { drafts, pending, rejected };
    }, [requisitions]);

    const recentRequisitions = useMemo(() => {
        return [...requisitions]
            .sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 5);
    }, [requisitions]);

    if (loading) return <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>;

    return (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
             <Card className="col-span-full md:col-span-2 lg:col-span-4">
                <CardHeader>
                    <CardTitle>Start a New Procurement Request</CardTitle>
                    <CardDescription>Need something for your team? Start by creating a purchase requisition.</CardDescription>
                </CardHeader>
                <CardFooter>
                    <Button onClick={() => router.push('/new-requisition')} size="lg">
                    <FilePlus className="mr-2 h-4 w-4" /> Create New Requisition
                    </Button>
                </CardFooter>
            </Card>
            <StatCard title="Drafts" value={stats.drafts.toString()} description="Requisitions you are working on" icon={<FileText className="h-4 w-4 text-muted-foreground" />} onClick={() => router.push('/requisitions')} cta="View Drafts"/>
            <StatCard title="Pending Approval" value={stats.pending.toString()} description="Requisitions awaiting sign-off" icon={<GanttChartSquare className="h-4 w-4 text-muted-foreground" />} onClick={() => router.push('/requisitions')} cta="Track Progress"/>
            <StatCard title="Rejected" value={stats.rejected.toString()} description="Requisitions that need revision" icon={<AlertTriangle className="h-4 w-4 text-muted-foreground" />} onClick={() => router.push('/requisitions')} cta="View & Edit" variant="destructive" />

            {recentRequisitions.length > 0 && <RecentRequisitionsTable requisitions={recentRequisitions} />}
        </div>
    );
}

function ApproverDashboard({ forAwardReviews = false }: { forAwardReviews?: boolean }) {
    const { user, token } = useAuth();
    const [pendingCount, setPendingCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [pins, setPins] = useState<DirectorPin[]>([]);
    const [pinsLoading, setPinsLoading] = useState(true);
    const router = useRouter();

    const pageTitle = forAwardReviews ? "Award Reviews" : "Departmental Approvals";
    const apiEndpoint = forAwardReviews ? '/api/reviews' : `/api/requisitions?approverId=${user?.id}`;
    const targetPage = forAwardReviews ? '/award-reviews' : '/approvals';

    useEffect(() => {
        if (!user || !token) return;
        setLoading(true);
        fetch(apiEndpoint, { headers: { 'Authorization': `Bearer ${token}` } })
            .then(res => res.json())
            .then(data => setPendingCount(Array.isArray(data) ? data.filter((req: any) => req.isActionable !== false).length : 0))
            .catch(console.error)
            .finally(() => setLoading(false));

        if (forAwardReviews) {
            setPinsLoading(true);
            getActivePinsForUser(user.id)
                .then(setPins)
                .catch(console.error)
                .finally(() => setPinsLoading(false));
        }

    }, [user, token, apiEndpoint, forAwardReviews]);

    if (loading) return <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>;

    return (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
             <StatCard
                title={`Pending ${pageTitle}`}
                value={pendingCount.toString()}
                description={`Items awaiting your review and decision.`}
                icon={<GanttChartSquare className="h-4 w-4 text-muted-foreground" />}
                onClick={() => router.push(targetPage)}
                cta="Review Now"
                variant={pendingCount > 0 ? "default" : "default"}
            />
            {forAwardReviews && <DirectorPinCard pins={pins} isLoading={pinsLoading} />}
        </div>
    )
}

function ProcurementOfficerDashboard() {
    const [data, setData] = useState<{ requisitions: PurchaseRequisition[], invoices: Invoice[] }>({ requisitions: [], invoices: [] });
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        setLoading(true);
        Promise.all([
            fetch('/api/requisitions').then(res => res.json()),
            fetch('/api/invoices').then(res => res.json()),
        ]).then(([requisitionsData, invoices]) => {
            setData({ 
                requisitions: Array.isArray(requisitionsData.requisitions) ? requisitionsData.requisitions : [],
                invoices: Array.isArray(invoices) ? invoices : []
            });
        }).catch(error => {
            console.error("Failed to fetch dashboard data:", error);
            setData({ requisitions: [], invoices: [] }); // Set default empty state on error
        }).finally(() => setLoading(false));
    }, []);

    const stats = useMemo(() => {
        const readyForRfq = data.requisitions.filter(r => r.status === 'PreApproved').length;
        const acceptingQuotes = data.requisitions.filter(r => r.status === 'Accepting_Quotes').length;
        const inCommitteeScoring = data.requisitions.filter(r => r.status === 'Scoring_In_Progress').length;
        const readyToAward = data.requisitions.filter(r => r.status === 'Scoring_Complete').length;
        const pendingFinalReview = data.requisitions.filter(r => r.status.startsWith('Pending_') && r.status !== 'Pending_Approval').length;
        const awardDeclined = data.requisitions.filter(r => r.status === 'Award_Declined').length;
        
        const paidInvoicesValue = data.invoices
            .filter(i => i.status === 'Paid')
            .reduce((sum, i) => sum + i.totalAmount, 0);

        const unpaidInvoicesValue = data.invoices
            .filter(i => i.status !== 'Paid' && !(i.po?.receipts?.some((r: any) => r.status === 'Disputed')))
            .reduce((sum, i) => sum + i.totalAmount, 0);

        return { readyForRfq, acceptingQuotes, inCommitteeScoring, readyToAward, pendingFinalReview, awardDeclined, paidInvoicesValue, unpaidInvoicesValue };
    }, [data]);

    if (loading) return <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>;

    return (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Ready for RFQ" value={stats.readyForRfq.toString()} description="Approved and waiting for RFQ" icon={<FileText className="h-4 w-4 text-muted-foreground" />} onClick={() => router.push('/quotations')} cta="Manage Quotations"/>
            <StatCard title="Accepting Quotes" value={stats.acceptingQuotes.toString()} description="RFQs currently active with vendors" icon={<FileBadge className="h-4 w-4 text-muted-foreground" />} onClick={() => router.push('/quotations')} cta="View Active RFQs"/>
            <StatCard title="In Committee Scoring" value={stats.inCommitteeScoring.toString()} description="Quotes being evaluated by committee" icon={<Users className="h-4 w-4 text-muted-foreground" />} onClick={() => router.push('/quotations')} cta="Monitor Progress"/>
            <StatCard title="Ready to Award" value={stats.readyToAward.toString()} description="Scoring is complete" icon={<Trophy className="h-4 w-4 text-muted-foreground" />} onClick={() => router.push('/quotations')} cta="Finalize Awards"/>
            <StatCard title="Pending Award Review" value={stats.pendingFinalReview.toString()} description="Awards in hierarchical approval" icon={<GanttChartSquare className="h-4 w-4 text-muted-foreground" />} onClick={() => router.push('/award-reviews')} cta="Track Reviews"/>
            <StatCard title="Award Declined" value={stats.awardDeclined.toString()} description="Vendor declined, action needed" icon={<AlertTriangle className="h-4 w-4 text-muted-foreground" />} onClick={() => router.push('/quotations')} cta="Promote Standby" variant="destructive"/>
            <StatCard title="Total Unpaid" value={`${stats.unpaidInvoicesValue.toLocaleString()} ETB`} description="Invoices pending or approved" icon={<Wallet className="h-4 w-4 text-muted-foreground" />} onClick={() => router.push('/invoices')} cta="View Invoices"/>
            <StatCard title="Total Paid" value={`${stats.paidInvoicesValue.toLocaleString()} ETB`} description="Successfully paid and closed" icon={<Banknote className="h-4 w-4 text-muted-foreground" />} onClick={() => router.push('/invoices')} cta="View History"/>
        </div>
    );
}

function FinanceDashboard() {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

     useEffect(() => {
        setLoading(true);
        fetch('/api/invoices').then(res => res.json())
            .then(data => {
                const activeInvoices = Array.isArray(data) ? data : [];
                setInvoices(activeInvoices);
            })
            .catch(error => {
                console.error("Failed to fetch invoices:", error);
                setInvoices([]);
            })
            .finally(() => setLoading(false));
    }, []);

    const stats = useMemo(() => {
        const pending = invoices.filter(i =>
            i.status === 'Pending' &&
            !(i.po?.receipts?.some(r => r.status === 'Disputed'))
        ).length;
        const approved = invoices.filter(i => i.status === 'Approved_for_Payment').length;
        const paidValue = invoices.filter(i => i.status === 'Paid').reduce((sum, i) => sum + i.totalAmount, 0);
        
        const unpaidValue = invoices
            .filter(i =>
                (i.status === 'Pending' || i.status === 'Approved_for_Payment') &&
                !(i.po?.receipts?.some((r: any) => r.status === 'Disputed'))
            )
            .reduce((sum, i) => sum + i.totalAmount, 0);

        return { pending, approved, paidValue, unpaidValue };
    }, [invoices]);

    if (loading) return <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>;

    return (
         <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Pending Invoices" value={stats.pending.toString()} description="Awaiting 3-way match and approval" icon={<FileText className="h-4 w-4 text-muted-foreground" />} onClick={() => router.push('/invoices')} cta="Review Invoices"/>
            <StatCard title="Ready for Payment" value={stats.approved.toString()} description="Approved invoices to be paid" icon={<Banknote className="h-4 w-4 text-muted-foreground" />} onClick={() => router.push('/invoices')} cta="Process Payments"/>
            <StatCard title="Total Unpaid" value={`${stats.unpaidValue.toLocaleString()} ETB`} description="Value of pending/approved invoices" icon={<Wallet className="h-4 w-4 text-muted-foreground" />} onClick={() => router.push('/invoices')} cta="View Invoices" />
            <StatCard title="Total Paid" value={`${stats.paidValue.toLocaleString()} ETB`} description="Value of all successfully paid invoices" icon={<Banknote className="h-4 w-4 text-muted-foreground" />} onClick={() => router.push('/invoices')} cta="View History" />
        </div>
    )
}

function ReceivingDashboard() {
    const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

     useEffect(() => {
        setLoading(true);
        fetch('/api/purchase-orders').then(res => res.json())
            .then(data => setPurchaseOrders(data))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const stats = useMemo(() => {
        const disputedPOs = purchaseOrders.filter(po => po.receipts?.some(r => r.status === 'Disputed'));
        const disputedIds = new Set(disputedPOs.map(p => p.id));
        
        const readyToReceiveCount = purchaseOrders.filter(po => 
            ['Issued', 'Acknowledged', 'Shipped', 'Partially_Delivered'].includes(po.status.replace(/ /g, '_')) &&
            !disputedIds.has(po.id)
        ).length;

        const completedCount = purchaseOrders.filter(po => po.status === 'Delivered' && !disputedIds.has(po.id)).length;
        
        return { readyToReceiveCount, disputedCount: disputedPOs.length, completedCount };
    }, [purchaseOrders]);

    if (loading) return <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    
    return (
         <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <StatCard title="Orders to Receive" value={stats.readyToReceiveCount.toString()} description="Purchase orders awaiting goods receipt" icon={<PackageCheck className="h-4 w-4 text-muted-foreground" />} onClick={() => router.push('/receive-goods?view=form')} cta="Log Incoming Goods"/>
            <StatCard title="Disputed Receipts" value={stats.disputedCount.toString()} description="GRNs with incorrect or damaged items" icon={<AlertTriangle className="h-4 w-4 text-muted-foreground" />} onClick={() => router.push('/receive-goods?view=disputed')} cta="View Disputed Items" variant="destructive" />
            <StatCard title="Completed Receipts" value={stats.completedCount.toString()} description="Orders successfully received and in good condition" icon={<CheckCircle className="h-4 w-4 text-muted-foreground" />} onClick={() => router.push('/receive-goods?view=completed')} cta="View History"/>
        </div>
    )
}

function CommitteeDashboard() {
    const { user, token } = useAuth();
    const [requisitions, setRequisitions] = useState<PurchaseRequisition[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        if (!user || !token) return;
        setLoading(true);
        // Fetch all requisitions in the quoting lifecycle
        fetch(`/api/requisitions?forQuoting=true`, { headers: { 'Authorization': `Bearer ${token}` } })
            .then(res => res.json())
            .then((data) => {
                const reqs = data.requisitions || [];
                // Filter client-side to find only requisitions assigned to this committee member
                const assignedReqs = reqs.filter((req: PurchaseRequisition) => {
                    const finIds = req.financialCommitteeMemberIds ?? (req as any).financialCommitteeMembers?.map((m: any) => m.id) ?? [];
                    const techIds = req.technicalCommitteeMemberIds ?? (req as any).technicalCommitteeMembers?.map((m: any) => m.id) ?? [];
                    return finIds.includes(user.id) || techIds.includes(user.id);
                });
                setRequisitions(assignedReqs);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [user, token]);

    const stats = useMemo(() => {
        // Pending: assigned to this user, scoring currently active, and user hasn't submitted scores yet
        const pendingScore = requisitions.filter(r => {
            const hasScored = r.committeeAssignments?.some((a: any) => a.userId === user?.id && a.scoresSubmitted);
            
            // Corrected Logic: Scoring is active if the deadline has passed and the process is not yet finished.
            const deadlinePassed = r.deadline ? isPast(new Date(r.deadline)) : false;
            const isRelevantStatus = ['Accepting_Quotes', 'Scoring_In_Progress', 'Scoring_Complete'].includes(r.status);
            const inScoring = deadlinePassed && isRelevantStatus;

            return !hasScored && inScoring;
        }).length;

        const scored = requisitions.filter(r => 
            r.committeeAssignments?.some((a: any) => a.userId === user?.id && a.scoresSubmitted)
        ).length;

        return { pendingScore, scored };
    }, [requisitions, user]);

    if (loading) return <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>;

    return (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <StatCard 
                title="Pending Your Score" 
                value={stats.pendingScore.toString()} 
                description="Requisitions awaiting your evaluation." 
                icon={<Edit className="h-4 w-4 text-muted-foreground" />} 
                onClick={() => router.push('/quotations?tab=pending')}
                cta="Go to Scoring"
                variant={stats.pendingScore > 0 ? "default" : "default"}
            />
            <StatCard 
                title="Scored by You" 
                value={stats.scored.toString()} 
                description="Requisitions you have already evaluated." 
                icon={<CheckCircle className="h-4 w-4 text-muted-foreground" />} 
                onClick={() => router.push('/quotations?tab=scored')}
                cta="View Scored"
            />
        </div>
    );
}

export function Dashboard() {
  const { role, user } = useAuth();

  const renderDashboard = () => {
    switch (role) {
      case 'Requester': return <RequesterDashboard />;
      case 'Approver': return <ApproverDashboard />;
      case 'Committee_Member': return <CommitteeDashboard />;
      case 'Committee_A_Member':
      case 'Committee_B_Member':
      case 'Manager_Procurement_Division':
      case 'Director_Supply_Chain_and_Property_Management':
      case 'VP_Resources_and_Facilities':
      case 'President':
      case 'Finance_Director':
      case 'Facility_Director':
        return <ApproverDashboard forAwardReviews={true} />;
      case 'Procurement_Officer': return <ProcurementOfficerDashboard />;
      case 'Admin': return <ProcurementOfficerDashboard />; // Admin gets the same overview
      case 'Finance': return <FinanceDashboard />;
      case 'Receiving': return <ReceivingDashboard />;
      default:
        return <p>No dashboard available for this role.</p>;
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex justify-between items-start">
        <div>
            <h1 className="text-3xl font-bold">Welcome back, {user?.name}!</h1>
            <p className="text-muted-foreground">
              Here's a summary of procurement activities for your role as a{' '}
              <strong>{role?.replace(/_/g, ' ')}</strong>.
            </p>
        </div>
      </div>
      {renderDashboard()}
    </div>
  );
}
