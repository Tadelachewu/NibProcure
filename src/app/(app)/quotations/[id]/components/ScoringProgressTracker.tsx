
'use client';

import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, GanttChart, Check, AlertCircle } from 'lucide-react';
import { PurchaseRequisition, User } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { formatDistanceToNow, isPast } from 'date-fns';
import { AwardCenterDialog } from '@/components/award-center-dialog';
import { BestItemAwardDialog } from '@/components/best-item-award-dialog';
import { ExtendDeadlineDialog } from '@/components/extend-deadline-dialog';
import { OverdueReportDialog } from '@/components/overdue-report-dialog';

export const ScoringProgressTracker = ({
  requisition,
  allUsers,
  onFinalize,
  onCommitteeUpdate,
  onFinalScoresSubmitted,
  isFinalizing,
}: {
  requisition: PurchaseRequisition;
  allUsers: User[];
  onFinalize: (awardStrategy: 'all' | 'item', awards: any, awardResponseDeadline?: Date, minuteDocumentUrl?: string, minuteJustification?: string) => void;
  onCommitteeUpdate: () => void;
  onFinalScoresSubmitted: () => void;
  isFinalizing: boolean;
}) => {
    const [isExtendDialogOpen, setExtendDialogOpen] = useState(false);
    const [isReportDialogOpen, setReportDialogOpen] = useState(false);
    const [selectedMember, setSelectedMember] = useState<User | null>(null);
    const [isAwardCenterOpen, setAwardCenterOpen] = useState(false);
    const [isBestItemAwardOpen, setBestItemAwardOpen] = useState(false);
    
    const isScoringDeadlinePassed = requisition.scoringDeadline && isPast(new Date(requisition.scoringDeadline));

    const assignedCommitteeMembers = useMemo(() => {
        const allIds = [
            ...(requisition.financialCommitteeMemberIds || []),
            ...(requisition.technicalCommitteeMemberIds || [])
        ];
        const uniqueIds = [...new Set(allIds)];
        return allUsers.filter(u => uniqueIds.includes(u.id));
    }, [allUsers, requisition.financialCommitteeMemberIds, requisition.technicalCommitteeMemberIds]);

    const scoringStatus = useMemo(() => {
        return assignedCommitteeMembers.map(member => {
            const assignment = requisition.committeeAssignments?.find(a => a.userId === member.id);
            const hasSubmittedFinalScores = !!assignment?.scoresSubmitted;
            
            let submissionDate: Date | null = null;
            if (hasSubmittedFinalScores && assignment?.updatedAt) {
                submissionDate = new Date(assignment.updatedAt);
            }

            const isOverdue = isScoringDeadlinePassed && !hasSubmittedFinalScores;

            return {
                ...member,
                hasSubmittedFinalScores,
                isOverdue,
                submittedAt: submissionDate,
            };
        }).sort((a, b) => {
             if (a.submittedAt && b.submittedAt) return a.submittedAt.getTime() - b.submittedAt.getTime();
             if (a.submittedAt) return -1;
             if (b.submittedAt) return 1;
             return 0;
        });
    }, [assignedCommitteeMembers, requisition, isScoringDeadlinePassed]);
    
    const allHaveScored = scoringStatus.length > 0 && scoringStatus.every(s => s.hasSubmittedFinalScores);

    const getButtonState = () => {
        if (['Awarded', 'Accepted', 'PO_Created', 'Closed', 'Fulfilled', 'PostApproved'].includes(requisition.status.replace(/ /g, '_'))) {
            return { text: "Award Processed", disabled: true };
        }
        if (requisition.status.startsWith('Pending_')) {
            return { text: "Award Pending Final Approval", disabled: true };
        }
        if (isFinalizing) return { text: "Finalizing...", disabled: true };
        if (!allHaveScored) return { text: "Waiting for All Scores...", disabled: true };
        return { text: "Finalize Scores & Award", disabled: false };
    }
    const buttonState = getButtonState();


    return (
        <Card className="mt-6">
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><GanttChart /> Scoring Progress</CardTitle>
                <CardDescription>Track the committee's scoring progress. The award can be finalized once all members have submitted their scores for all quotations.</CardDescription>
            </CardHeader>
            <CardContent>
                <ul className="space-y-3">
                    {scoringStatus.map(member => (
                        <li key={member.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 rounded-md border">
                           <div className="flex items-center gap-3">
                                <Avatar>
                                    <AvatarImage src={`https://picsum.photos/seed/${member.id}/40/40`} data-ai-hint="profile picture" />
                                    <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <p className="font-semibold">{member.name}</p>
                                    <p className="text-xs text-muted-foreground">{member.email}</p>
                                </div>
                           </div>
                            <div className="flex items-center gap-2 mt-2 sm:mt-0 w-full sm:w-auto">
                                {member.hasSubmittedFinalScores && member.submittedAt ? (
                                    <div className="text-right flex-1">
                                        <Badge variant="default" className="bg-green-600"><Check className="mr-1 h-3 w-3" /> Submitted</Badge>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {formatDistanceToNow(new Date(member.submittedAt), { addSuffix: true })}
                                        </p>
                                    </div>
                                ) : member.isOverdue ? (
                                    <>
                                     <Badge variant="destructive" className="mr-auto"><AlertCircle className="mr-1 h-3 w-3" />Overdue</Badge>
                                     <Button size="sm" variant="secondary" onClick={()=>{ setSelectedMember(member); setExtendDialogOpen(true); }}>Extend</Button>
                                     <Button size="sm" variant="secondary" onClick={onCommitteeUpdate}>Replace</Button>
                                     <Button size="sm" variant="outline" onClick={()=>{ setSelectedMember(member); setReportDialogOpen(true); }}>Report</Button>
                                    </>
                                ) : (
                                     <Badge variant="secondary">Pending</Badge>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            </CardContent>
            <CardFooter className="flex gap-2">
                <Dialog open={isAwardCenterOpen} onOpenChange={setAwardCenterOpen}>
                    <DialogTrigger asChild>
                         <Button disabled={buttonState.disabled}>
                            {isFinalizing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Award to Single Vendor
                        </Button>
                    </DialogTrigger>
                    <AwardCenterDialog 
                        requisition={requisition}
                        quotations={requisition.quotations || []}
                        onFinalize={onFinalize}
                        onClose={() => setAwardCenterOpen(false)}
                    />
                </Dialog>
                 <Dialog open={isBestItemAwardOpen} onOpenChange={setBestItemAwardOpen}>
                    <DialogTrigger asChild>
                         <Button disabled={buttonState.disabled} variant="outline">
                            Award by Best Item
                        </Button>
                    </DialogTrigger>
                    <BestItemAwardDialog 
                        requisition={requisition}
                        quotations={requisition.quotations || []}
                        onFinalize={onFinalize}
                        isOpen={isBestItemAwardOpen}
                        onClose={() => setBestItemAwardOpen(false)}
                    />
                 </Dialog>
            </CardFooter>
            {selectedMember && (
                <>
                    <ExtendDeadlineDialog 
                        isOpen={isExtendDialogOpen}
                        onClose={() => { setExtendDialogOpen(false); setSelectedMember(null); }}
                        member={selectedMember}
                        requisition={requisition}
                        onSuccess={onFinalScoresSubmitted}
                    />
                    <OverdueReportDialog 
                        isOpen={isReportDialogOpen}
                        onClose={() => { setReportDialogOpen(false); setSelectedMember(null); }}
                        member={selectedMember}
                    />
                </>
            )}
        </Card>
    );
};
