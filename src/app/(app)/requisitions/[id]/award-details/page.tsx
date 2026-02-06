
'use client';

import { AwardCalculationDetails } from '@/components/award-calculation-details';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth } from '@/contexts/auth-context';
import { PurchaseRequisition, Quotation } from '@/lib/types';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { ChangeAwardDialog } from '@/components/change-award-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Menu } from '@/components/ui/menu';

export default function AwardDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [requisition, setRequisition] = useState<PurchaseRequisition | null>(null);
    const [quotations, setQuotations] = useState<Quotation[]>([]);
    const [isChangeOpen, setChangeOpen] = useState(false);
    const [isCancelling, setCancelling] = useState(false);


    const fetchData = useCallback(async () => {
        if (!id || !user) return;
        setLoading(true);
        setError(null);
        try {
            const [reqResponse, quoResponse] = await Promise.all([
                fetch(`/api/requisitions/${id}`),
                fetch(`/api/quotations?requisitionId=${id}`),
            ]);

            if (!reqResponse.ok) throw new Error('Failed to fetch requisition details.');
            if (!quoResponse.ok) throw new Error('Failed to fetch quotations.');

            const reqData = await reqResponse.json();
            const quoData = await quoResponse.json();
            setRequisition(reqData);
            setQuotations(quoData);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred');
        } finally {
            setLoading(false);
        }
    }, [id, user]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);


    if (loading) {
        return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    if (error) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Error</CardTitle>
                    <CardDescription>Could not load award details.</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-destructive">{error}</p>
                </CardContent>
            </Card>
        );
    }

    if (!requisition) {
        return <p>Requisition not found.</p>
    }


    return (
        <div className="space-y-6">
            <Button variant="outline" onClick={() => router.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
            </Button>
            <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setChangeOpen(true)}>Change Award</Button>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="destructive">Cancel Award</Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-3">
                        <div className="space-y-2">
                            <div className="font-medium">Cancel Award To</div>
                            <div className="flex flex-col gap-2">
                                <Button onClick={async () => {
                                    if (!user) return;
                                    setCancelling(true);
                                    try {
                                        const res = await fetch(`/api/requisitions/${id}/reset-award`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ userId: user.id, toStatus: 'ready_for_rfq' })
                                        });
                                        const j = await res.json();
                                        if (!res.ok) throw new Error(j.error || j.details || 'Failed');
                                        // refresh
                                        await fetchData();
                                    } catch (err) {
                                        console.error(err);
                                    } finally {
                                        setCancelling(false);
                                    }
                                }}>Ready for RFQ</Button>
                                <Button onClick={async () => {
                                    if (!user) return;
                                    setCancelling(true);
                                    try {
                                        const res = await fetch(`/api/requisitions/${id}/reset-award`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ userId: user.id, toStatus: 'ready_to_award' })
                                        });
                                        const j = await res.json();
                                        if (!res.ok) throw new Error(j.error || j.details || 'Failed');
                                        await fetchData();
                                    } catch (err) {
                                        console.error(err);
                                    } finally {
                                        setCancelling(false);
                                    }
                                }}>Ready to Award</Button>
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            </div>

            <ChangeAwardDialog isOpen={isChangeOpen} onClose={() => { setChangeOpen(false); fetchData(); }} requisition={requisition} quotations={quotations} />
            <AwardCalculationDetails requisition={requisition} quotations={quotations} />
        </div>
    );
}

