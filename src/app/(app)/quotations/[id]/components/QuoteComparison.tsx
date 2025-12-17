
'use client';

import React, { useState } from 'react';
import { PurchaseRequisition, Quotation, User } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow, isPast } from 'date-fns';
import { Edit2, Check, TimerOff, FileText, BadgeHelp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getRankIcon } from '@/lib/utils';
import { ScoringDialog } from './ScoringDialog';
import { useAuth } from '@/contexts/auth-context';
import { Dialog } from '@/components/ui/dialog';

export const QuoteComparison = ({
  requisition,
  onScoreSubmitted,
}: {
  requisition: PurchaseRequisition;
  onScoreSubmitted: () => void;
}) => {
  const { user } = useAuth();
  const [selectedQuoteForScoring, setSelectedQuoteForScoring] = useState<Quotation | null>(null);
  const [isScoringFormOpen, setScoringFormOpen] = useState(false);

  const quotations = requisition.quotations || [];
  const isDeadlinePassed = requisition.deadline ? isPast(new Date(requisition.deadline)) : false;
  const isScoringDeadlinePassed = requisition.scoringDeadline ? isPast(new Date(requisition.scoringDeadline)) : false;
  
  const isTechnicalOnlyScorer = (user?.roles as string[]).includes('Committee_Member') &&
    requisition.technicalCommitteeMemberIds?.includes(user.id) &&
    !requisition.financialCommitteeMemberIds?.includes(user.id);

  const hidePrices = isTechnicalOnlyScorer && !requisition.rfqSettings?.technicalEvaluatorSeesPrices;

  const handleScoreButtonClick = (quote: Quotation) => {
    setSelectedQuoteForScoring(quote);
    setScoringFormOpen(true);
  };

  const handleScoreSubmitted = () => {
    setScoringFormOpen(false);
    setSelectedQuoteForScoring(null);
    onScoreSubmitted();
  };
  
  const getStatusVariant = (status: Quotation['status']) => {
    switch (status) {
        case 'Awarded':
        case 'Accepted':
        case 'Partially_Awarded':
            return 'default';
        case 'Standby':
            return 'secondary';
        case 'Submitted':
            return 'outline';
        default:
            return 'destructive';
    }
  }

  if (quotations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed rounded-lg bg-muted/30">
        <BadgeHelp className="h-16 w-16 text-muted-foreground/50" />
        <h3 className="mt-6 text-xl font-semibold">No Quotes Yet</h3>
        <p className="mt-2 text-sm text-muted-foreground">No vendors have submitted a quotation for this requisition.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {quotations.sort((a, b) => (a.rank || 99) - (b.rank || 99)).map(quote => {
          const hasUserScored = quote.scores?.some(s => s.scorerId === user?.id);
          const isScoringAllowed = (user?.roles as string[]).includes('Committee_Member') && isDeadlinePassed && (!isScoringDeadlinePassed || hasUserScored);

          return (
            <Card key={quote.id} className={cn("flex flex-col", (quote.status === 'Awarded' || quote.status === 'Accepted' || quote.status === 'Partially_Awarded') && 'border-primary ring-2 ring-primary')}>
              <CardHeader>
                <CardTitle className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    {isDeadlinePassed && getRankIcon(quote.rank)}
                    <span>{quote.vendorName}</span>
                  </div>
                  <Badge variant={getStatusVariant(quote.status)}>{quote.status.replace(/_/g, ' ')}</Badge>
                </CardTitle>
                <CardDescription>
                  <span className="text-xs">Submitted {formatDistanceToNow(new Date(quote.createdAt), { addSuffix: true })}</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-grow space-y-4">
                {(isDeadlinePassed || quote.cpoDocumentUrl) ? (
                  <>
                    {hidePrices ? (
                      <div className="text-center py-4">
                        <p className="font-semibold text-muted-foreground">Pricing information is hidden for technical evaluation.</p>
                      </div>
                    ) : (
                      <>
                        {isDeadlinePassed && <div className="text-3xl font-bold text-center">{quote.totalPrice.toLocaleString()} ETB</div>}
                      </>
                    )}
                    {quote.cpoDocumentUrl && (
                      <div className="text-sm space-y-1 pt-2 border-t">
                        <h4 className="font-semibold">CPO Document</h4>
                        <Button asChild variant="link" className="p-0 h-auto">
                          <a href={quote.cpoDocumentUrl} target="_blank" rel="noopener noreferrer">{quote.cpoDocumentUrl.split('/').pop()}</a>
                        </Button>
                      </div>
                    )}
                     {quote.experienceDocumentUrl && (
                      <div className="text-sm space-y-1 pt-2 border-t">
                          <h4 className="font-semibold">Experience Document</h4>
                          <Button asChild variant="link" className="p-0 h-auto">
                              <a href={quote.experienceDocumentUrl} target="_blank" rel="noopener noreferrer">{quote.experienceDocumentUrl.split('/').pop()}</a>
                          </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8">
                    <TimerOff className="h-8 w-8 mx-auto text-muted-foreground" />
                    <p className="font-semibold mt-2">Details Masked</p>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex flex-col gap-2">
                {isScoringAllowed && (
                  <Button className="w-full" variant={hasUserScored ? "secondary" : "outline"} onClick={() => handleScoreButtonClick(quote)}>
                    {hasUserScored ? <Check className="mr-2 h-4 w-4" /> : <Edit2 className="mr-2 h-4 w-4" />}
                    {hasUserScored ? 'View Your Score' : 'Score this Quote'}
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>
       <Dialog open={isScoringFormOpen} onOpenChange={setScoringFormOpen}>
            {selectedQuoteForScoring && requisition && user && (
                <ScoringDialog 
                    quote={selectedQuoteForScoring} 
                    requisition={requisition} 
                    user={user} 
                    onScoreSubmitted={handleScoreSubmitted}
                    isScoringDeadlinePassed={isScoringDeadlinePassed}
                    hidePrices={hidePrices}
                />
            )}
        </Dialog>
    </>
  );
};
