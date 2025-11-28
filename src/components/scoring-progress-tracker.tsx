

'use client';

import React, { useState, useMemo } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './ui/card';
import { Button } from './ui/button';
import { Loader2, GanttChart, Edit2, Users, Timer, Check, AlertTriangle } from 'lucide-react';
import { PurchaseRequisition, Quotation, User } from '@/lib/types';
import { useAuth } from '@/contexts/auth-context';
import { format, isPast, formatDistanceToNow } from 'date-fns';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { ExtendDeadlineDialog } from './extend-deadline-dialog';
import { OverdueReportDialog } from './overdue-report-dialog';
import { AwardCenterDialog } from './award-center-dialog';
import { BestItemAwardDialog } from './best-item-award-dialog';
import { AwardStandbyButton } from './award-standby-button';
import { RestartRfqDialog } from './restart-rfq-dialog';


const ScoringProgressTracker = ({
  requisition,
  quotations,
  vendors,
  allUsers,
  onFinalize,
  onCommitteeUpdate,
  isFinalizing,
  isAuthorized,
  onSuccess,
}: {
  requisition: PurchaseRequisition;
  quotations: Quotation[];
  vendors: any[];
  allUsers: User[];
  onFinalize: (awardStrategy: 'all' | 'item', awards: any, awardResponseDeadline?: Date) => void;
  onCommitteeUpdate: (open: boolean) => void;
  isFinalizing: boolean;
  isAuthorized: boolean;
  onSuccess: () => void;
}) => {
    const [isExtendDialogOpen, setExtendDialogOpen] = useState(false);
    const [isReportDialogOpen, setReportDialogOpen] = useState(false);
    const [selectedMember, setSelectedMember] = useState<User | null>(null);
    const [isSingleAwardCenterOpen, setSingleAwardCenterOpen] = useState(false);
    const [isBestItemAwardCenterOpen, setBestItemAwardCenterOpen] = useState(false);

    const { toast } = useToast();
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
            const assignment = member.committeeAssignments?.find(a => a.requisitionId === requisition.id);
            const hasSubmittedFinalScores = !!assignment?.scoresSubmitted;

            let submissionDate: Date | null = null;
            if (hasSubmittedFinalScores) {
                const latestScore = quotations
                    .flatMap(q => q.scores || [])
                    .filter(s => s.scorerId === member.id)
                    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())[0];

                if (latestScore) {
                    submissionDate = new Date(latestScore.submittedAt);
                }
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
    }, [assignedCommitteeMembers, quotations, isScoringDeadlinePassed, requisition.id]);
    
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
                                     <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" />Overdue</Badge>
                                     <Button size="sm" variant="secondary" onClick={()=>{ setSelectedMember(member); setExtendDialogOpen(true); }}>Extend</Button>
                                     <Button size="sm" variant="secondary" onClick={() => onCommitteeUpdate(true)}>Replace</Button>
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
             {(requisition.status === 'Scoring_Complete' || requisition.status === 'Award_Declined') && isAuthorized && (
                <CardFooter className="gap-4">
                    {requisition.status === 'Award_Declined' ? (
                        <AwardStandbyButton
                            requisition={requisition}
                            onSuccess={onSuccess}
                            isChangingAward={isFinalizing}
                        />
                    ) : (
                    <>
                        <Dialog open={isSingleAwardCenterOpen} onOpenChange={setSingleAwardCenterOpen}>
                        <DialogTrigger asChild>
                            <Button disabled={isFinalizing}>Award All to Single Vendor</Button>
                        </DialogTrigger>
                        <AwardCenterDialog
                            requisition={requisition}
                            quotations={quotations}
                            onFinalize={onFinalize}
                            onClose={() => setSingleAwardCenterOpen(false)}
                        />
                        </Dialog>

                        <Dialog open={isBestItemAwardCenterOpen} onOpenChange={setBestItemAwardCenterOpen}>
                        <DialogTrigger asChild>
                            <Button variant="secondary" disabled={isFinalizing}>
                            Award by Best Offer (Per Item)
                            </Button>
                        </DialogTrigger>
                        <BestItemAwardDialog
                            requisition={requisition}
                            quotations={quotations}
                            onFinalize={onFinalize}
                            isOpen={isBestItemAwardCenterOpen}
                            onClose={() => setBestItemAwardCenterOpen(false)}
                        />
                        </Dialog>
                    </>
                    )}
                    <RestartRfqDialog 
                        requisition={requisition} 
                        vendors={vendors} 
                        onRfqRestarted={onSuccess}
                    />
                </CardFooter>
            )}
            {selectedMember && (
                <>
                    <ExtendDeadlineDialog
                        isOpen={isExtendDialogOpen}
                        onClose={() => { setExtendDialogOpen(false); setSelectedMember(null); }}
                        member={selectedMember}
                        requisition={requisition}
                        onSuccess={() => onCommitteeUpdate(false)}
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

export default ScoringProgressTracker;
