import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BadgeHelp } from 'lucide-react';
import { Crown, Trophy, Medal, TimerOff } from 'lucide-react';
import { formatDistanceToNow, differenceInCalendarDays, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { PurchaseRequisition, Quotation, User, QuotationStatus } from '@/lib/types';

export default function QuoteComparison({ quotes, requisition, onScore, user, isDeadlinePassed, isScoringDeadlinePassed, isAwarded, scoresSubmittedOverride }: { quotes: Quotation[], requisition: PurchaseRequisition, onScore: (quote: Quotation, hidePrices: boolean) => void, user: User, isDeadlinePassed: boolean, isScoringDeadlinePassed: boolean, isAwarded: boolean, scoresSubmittedOverride?: boolean }) {

    if (quotes.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed rounded-lg bg-muted/30">
                <BadgeHelp className="h-16 w-16 text-muted-foreground/50" />
                <h3 className="mt-6 text-xl font-semibold">No Quotes Yet</h3>
                <p className="mt-2 text-sm text-muted-foreground">No vendors have submitted a quotation for this requisition.</p>
            </div>
        );
    }

    const getStatusVariant = (status: QuotationStatus) => {
        switch (status) {
            case 'Awarded': return 'default';
            case 'Accepted': return 'default';
            case 'Standby': return 'secondary';
            case 'Submitted': return 'outline';
            case 'Rejected': return 'destructive';
            case 'Declined': return 'destructive';
            case 'Failed': return 'destructive';
            case 'Invoice_Submitted': return 'outline';
            case 'Partially_Awarded': return 'default';
        }
    }

    const getRankIcon = (rank?: number) => {
        switch (rank) {
            case 1: return <Crown className="h-5 w-5 text-amber-400" />;
            case 2: return <Trophy className="h-5 w-5 text-slate-400" />;
            case 3: return <Medal className="h-5 w-5 text-amber-600" />;
            default: return null;
        }
    }

    const isAssignedComplianceCommittee = (requisition.complianceCommitteeMemberIds || []).includes(user.id) || (user.committeeAssignments || []).some((a: any) => a.requisitionId === requisition.id && a.type === 'compliance');
    const assignment = (user.committeeAssignments || []).find((a: any) => a.requisitionId === requisition.id);
    const scoresSubmitted = assignment?.scoresSubmitted || (scoresSubmittedOverride ?? false);
    const hidePrices = isAssignedComplianceCommittee && !scoresSubmitted && !(requisition.rfqSettings?.technicalEvaluatorSeesPrices ?? false);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {quotes.sort((a, b) => (a.rank || 4) - (b.rank || 4)).map(quote => {
                const submissionLabel = quote.submissionMethod === 'Manual' ? 'Manual' : 'Electronic';
                const submissionVariant = quote.submissionMethod === 'Manual' ? 'secondary' : 'outline';
                return (
                    <Card key={quote.id} className={cn(
                        "flex flex-col",
                        quote.status === 'Awarded' && 'border-green-600 ring-2 ring-green-600',
                        (quote.status === 'Accepted' || quote.status === 'Partially_Awarded') && 'border-primary ring-2 ring-primary'
                    )}>
                        <CardHeader>
                            <CardTitle className="flex justify-between items-start">
                                <div className="flex items-center gap-2">
                                    {isDeadlinePassed && getRankIcon(quote.rank)}
                                    <span>{quote.vendorName}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Badge variant={submissionVariant as any}>{submissionLabel}</Badge>
                                    <Badge variant={getStatusVariant(quote.status)} className={cn(quote.status === 'Awarded' && 'bg-green-600 text-white hover:bg-green-600')}>{quote.status.replace(/_/g, ' ')}</Badge>
                                </div>
                            </CardTitle>
                            <CardDescription>
                                <span className="text-xs">Submitted {formatDistanceToNow(new Date(quote.createdAt), { addSuffix: true })}</span>
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex-grow space-y-4">
                            {(isDeadlinePassed || quote.cpoDocumentUrl) ? (
                                <>
                                    {hidePrices ? (
                                        <div className="text-center py-4"><p className="font-semibold text-muted-foreground">Pricing information is hidden for compliance evaluation.</p></div>
                                    ) : (
                                        <>
                                            {isDeadlinePassed && <div className="text-3xl font-bold text-center">{hidePrices ? 'Hidden' : quote.totalPrice.toLocaleString() + ' ETB'}</div>}
                                            {isDeadlinePassed && (() => {
                                                const maxLead = Math.max(...(quote.items?.map(i => Number(i.leadTimeDays) || 0) || [0]));
                                                if (quote.status === 'Accepted') {
                                                    const ref = new Date(quote.updatedAt || quote.createdAt || new Date());
                                                    const days = Math.max(0, differenceInCalendarDays(new Date(quote.deliveryDate), ref));
                                                    return <div className="text-center text-muted-foreground">Est. Delivery: {days} days after acceptance</div>;
                                                }
                                                return <div className="text-center text-muted-foreground">Est. Delivery: Delivery time in {maxLead} days after acceptance</div>;
                                            })()}
                                        </>
                                    )}


                                    {quote.cpoDocumentUrl && (
                                        <div className="text-sm space-y-1 pt-2 border-t">
                                            <h4 className="font-semibold">CPO Document</h4>
                                            <a href={quote.cpoDocumentUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">{quote.cpoDocumentUrl.split('/').pop()}</a>
                                        </div>
                                    )}
                                    {quote.experienceDocumentUrl && (
                                        <div className="text-sm space-y-1 pt-2 border-t">
                                            <h4 className="font-semibold">Experience Document</h4>
                                            <a href={quote.experienceDocumentUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">{quote.experienceDocumentUrl.split('/').pop()}</a>
                                        </div>
                                    )}

                                    {isDeadlinePassed && (
                                        <div className="text-sm space-y-2">
                                            <h4 className="font-semibold">Items:</h4>
                                            {quote.items.map(item => (
                                                <div key={item.requisitionItemId} className="flex justify-between items-center text-muted-foreground">
                                                    <span>{item.name} x {item.quantity}</span>
                                                    {!hidePrices && <span className="font-mono">{item.unitPrice.toFixed(2)} ETB ea.</span>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="text-center py-8">
                                    <TimerOff className="h-8 w-8 mx-auto text-muted-foreground" />
                                    <p className="font-semibold mt-2">Details Masked</p>
                                    <p className="text-sm text-muted-foreground">Revealed after {format(new Date(requisition.deadline!), 'PPp')}</p>
                                </div>
                            )}

                            {quote.notes && (
                                <div className="text-sm space-y-1 pt-2 border-t">
                                    <h4 className="font-semibold">Notes:</h4>
                                    <p className="text-muted-foreground text-xs italic">{quote.notes}</p>
                                </div>
                            )}
                            {isAwarded && (
                                <div className="text-center pt-2 border-t">
                                    <h4 className="font-semibold text-sm">Total Price</h4>
                                    <p className="text-2xl font-bold text-primary">{hidePrices ? 'Hidden' : quote.totalPrice.toLocaleString() + ' ETB'}</p>
                                </div>
                            )}
                        </CardContent>
                        <CardFooter className="flex flex-col gap-2" />
                    </Card>
                );
            })}
        </div>
    );
}
