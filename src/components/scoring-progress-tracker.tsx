
"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './ui/card';
import { Button } from './ui/button';
import { Loader2, GanttChart, Check, AlertCircle, Timer, Users, Edit2 } from 'lucide-react';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from './ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { PurchaseRequisition, Quotation, User } from '@/lib/types';
import { format, formatDistanceToNow, isPast, isBefore, setHours, setMinutes } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { cn } from '@/lib/utils';
import { CalendarIcon } from 'lucide-react';
import { AwardCenterDialog } from './award-center-dialog';

const ExtendDeadlineDialog = ({ isOpen, onClose, member, requisition, onSuccess }: { isOpen: boolean, onClose: () => void, member: User, requisition: PurchaseRequisition, onSuccess: () => void }) => {
    const { toast } = useToast();
    const { user } = useAuth();
    const [isSubmitting, setSubmitting] = useState(false);
    const [newDeadline, setNewDeadline] = useState<Date|undefined>();
    const [newDeadlineTime, setNewDeadlineTime] = useState('17:00');

    const finalNewDeadline = useMemo(() => {
        if (!newDeadline) return undefined;
        const [hours, minutes] = newDeadlineTime.split(':').map(Number);
        return setMinutes(setHours(newDeadline, hours), minutes);
    }, [newDeadline, newDeadlineTime]);
    
    const handleSubmit = async () => {
        if (!user || !finalNewDeadline) return;
        if (isBefore(finalNewDeadline, new Date())) {
            toast({ variant: 'destructive', title: 'Error', description: 'The new deadline must be in the future.' });
            return;
        }

        setSubmitting(true);
        try {
            const response = await fetch(`/api/requisitions/${requisition.id}/extend-scoring-deadline`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, newDeadline: finalNewDeadline })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to extend deadline.');
            }

            toast({ title: 'Success', description: 'Scoring deadline has been extended for all committee members.' });
            onSuccess();
            onClose();

        } catch (error) {
             toast({ variant: 'destructive', title: 'Error', description: error instanceof Error ? error.message : 'An unknown error occurred.',});
        } finally {
            setSubmitting(false);
        }
    }


    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Extend Scoring Deadline</DialogTitle>
                    <DialogDescription>Set a new scoring deadline for all committee members of this requisition.</DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    <div className="space-y-2">
                        <Label>New Scoring Deadline</Label>
                        <div className="flex gap-2">
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !newDeadline && "text-muted-foreground")}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {newDeadline ? format(newDeadline, "PPP") : <span>Pick a date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={newDeadline} onSelect={setNewDeadline} initialFocus disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))} /></PopoverContent>
                            </Popover>
                             <Input type="time" className="w-32" value={newDeadlineTime} onChange={(e) => setNewDeadlineTime(e.target.value)} />
                        </div>
                    </div>
                </div>
                 <DialogFooter>
                    <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                    <Button onClick={handleSubmit} disabled={isSubmitting || !finalNewDeadline}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Confirm Extension
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

const OverdueReportDialog = ({ isOpen, onClose, member }: { isOpen: boolean, onClose: () => void, member: User }) => {
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Overdue Member Report</DialogTitle>
                    <DialogDescription>
                        This is a placeholder for a detailed report about the overdue committee member for internal follow-up.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                     <p>This is a placeholder for a detailed report about the overdue committee member for internal follow-up.</p>
                     <div className="p-4 border rounded-md bg-muted/50">
                        <p><span className="font-semibold">Member Name:</span> {member.name}</p>
                        <p><span className="font-semibold">Email:</span> {member.email}</p>
                        <p><span className="font-semibold">Assigned Role:</span> {member.role}</p>
                     </div>
                </div>
                <DialogFooter>
                    <Button onClick={onClose}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}


export const ScoringProgressTracker = ({
  requisition,
  quotations,
  allUsers,
  onFinalize,
  onCommitteeUpdate,
  isFinalizing,
}: {
  requisition: PurchaseRequisition;
  quotations: Quotation[];
  allUsers: User[];
  onFinalize: (awardStrategy: 'all' | 'item', awards: any, awardResponseDeadline?: Date) => void;
  onCommitteeUpdate: (open: boolean) => void;
  isFinalizing: boolean;
}) => {
    const [isExtendDialogOpen, setExtendDialogOpen] = useState(false);
    const [isReportDialogOpen, setReportDialogOpen] = useState(false);
    const [selectedMember, setSelectedMember] = useState<User | null>(null);
    const [isAwardCenterOpen, setAwardCenterOpen] = useState(false);
    
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
    
    const allHaveScored = scoringStatus.length > 0 && scoringStatus.every(s => s.hasSubmittedFinalScores);

    const buttonDisabled = !allHaveScored || isFinalizing;
    const buttonText = isFinalizing 
        ? "Finalizing..." 
        : allHaveScored
        ? "Finalize Scores & Award"
        : "Waiting for All Scores...";

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
            <CardFooter>
                 <Dialog open={isAwardCenterOpen} onOpenChange={setAwardCenterOpen}>
                    <DialogTrigger asChild>
                         <Button disabled={buttonDisabled}>
                            {isFinalizing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {buttonText}
                        </Button>
                    </DialogTrigger>
                    <AwardCenterDialog 
                        requisition={requisition}
                        quotations={quotations}
                        onFinalize={onFinalize}
                        onClose={() => setAwardCenterOpen(false)}
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
