
'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './ui/card';
import { Button } from './ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog';
import { useAuth } from '@/contexts/auth-context';
import { PurchaseRequisition, UserRole } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle } from 'lucide-react';

export function CommitteeActions({
    user,
    requisition,
    onFinalScoresSubmitted,
}: {
    user: ReturnType<typeof useAuth>['user'],
    requisition: PurchaseRequisition,
    onFinalScoresSubmitted: () => void,
}) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();
    const { token } = useAuth();
    
    if (!user) {
        return null;
    }
    
    const isCommitteeUser = useMemo(() => (user.roles as UserRole[]).some(r => r.includes('Committee')), [user.roles]);

    const assignment = useMemo(() => user.committeeAssignments?.find(a => a.requisitionId === requisition.id), [user.committeeAssignments, requisition.id]);
    const scoresAlreadyFinalized = assignment?.scoresSubmitted || false;

    if (!isCommitteeUser) {
        return null;
    }
    
    const userScoredQuotesCount = requisition.quotations?.filter(q => q.scores?.some(s => s.scorerId === user.id)).length || 0;
    const allQuotesScored = (requisition.quotations?.length || 0) > 0 && userScoredQuotesCount === requisition.quotations?.length;

    const handleSubmitScores = async () => {
        if (!token) return;
        setIsSubmitting(true);
        try {
            const response = await fetch(`/api/requisitions/${requisition.id}/submit-scores`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ userId: user.id })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to submit scores');
            }
            toast({ title: 'Scores Submitted', description: 'Your final scores have been recorded.'});
            onFinalScoresSubmitted();
        } catch (error) {
             toast({
                variant: 'destructive',
                title: 'Error',
                description: error instanceof Error ? error.message : 'An unknown error occurred.',
            });
        } finally {
            // Keep isSubmitting true on success to disable button until re-render
            const shouldKeepDisabled = await (await fetch(`/api/requisitions/${requisition.id}/submit-scores`, { method: 'HEAD' })).ok;
            if(!shouldKeepDisabled) {
              setIsSubmitting(false);
            }
        }
    };

    if (scoresAlreadyFinalized) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Committee Actions</CardTitle>
                    <CardDescription>Finalize your evaluation for this requisition.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button variant="outline" disabled>
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Scores Submitted
                    </Button>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Committee Actions</CardTitle>
                <CardDescription>Finalize your evaluation for this requisition.</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground">You have scored {userScoredQuotesCount} of {requisition.quotations?.length || 0} quotes.</p>
            </CardContent>
            <CardFooter>
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button disabled={!allQuotesScored || isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Submit Final Scores
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure you want to submit?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This will finalize your scores for this requisition. You will not be able to make further changes.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleSubmitScores}>Confirm and Submit</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </CardFooter>
        </Card>
    );
};
