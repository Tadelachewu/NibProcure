

'use client';

import { AwardCalculationDetails, ScoreBreakdownDialog } from '@/components/award-calculation-details';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth } from '@/contexts/auth-context';
import { PurchaseRequisition, Quotation } from '@/lib/types';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';

export default function AwardDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [requisition, setRequisition] = useState<PurchaseRequisition | null>(null);
    const [quotations, setQuotations] = useState<Quotation[]>([]);
    const [selectedCalculation, setSelectedCalculation] = useState<any | null>(null);


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
            <AwardCalculationDetails 
                requisition={requisition} 
                quotations={quotations}
                onSelectCalculation={setSelectedCalculation}
            />
            {selectedCalculation && requisition.evaluationCriteria && (
                <ScoreBreakdownDialog 
                    calculation={selectedCalculation} 
                    evaluationCriteria={requisition.evaluationCriteria}
                    isOpen={!!selectedCalculation}
                    onClose={() => setSelectedCalculation(null)}
                />
            )}
        </div>
    );
}
