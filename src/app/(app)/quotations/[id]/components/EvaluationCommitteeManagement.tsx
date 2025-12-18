
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import { PurchaseRequisition, User } from '@/lib/types';
import { Edit2, Users, Timer } from 'lucide-react';
import { CommitteeForm } from './CommitteeForm';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/auth-context';

const MemberList = ({ title, description, members }: { title: string, description: string, members: User[] }) => (
    <div>
        <h4 className="font-semibold">{title}</h4>
        <p className="text-sm text-muted-foreground mb-3">{description}</p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
            {members.length > 0 ? (
                members.map(member => (
                    <div key={member.id} className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                            <AvatarImage src={`https://picsum.photos/seed/${member.id}/40/40`} data-ai-hint="profile picture" />
                            <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">{member.name}</span>
                    </div>
                ))
            ) : (
                <p className="text-sm text-muted-foreground">No members assigned.</p>
            )}
        </div>
    </div>
);

export function EvaluationCommitteeManagement({ requisition, onCommitteeUpdated, isAuthorized }: { requisition: PurchaseRequisition; onCommitteeUpdated: () => void; isAuthorized: boolean; }) {
    const [isCommitteeDialogOpen, setCommitteeDialogOpen] = useState(false);
    const { allUsers } = useAuth();
    
    const assignedFinancialMembers = allUsers.filter(u => requisition.financialCommitteeMemberIds?.includes(u.id));
    const assignedTechnicalMembers = allUsers.filter(u => requisition.technicalCommitteeMemberIds?.includes(u.id));
    const allAssignedMemberIds = [...(requisition.financialCommitteeMemberIds || []), ...(requisition.technicalCommitteeMemberIds || [])];

    const triggerButton = (
        <Button variant="outline" className="w-full sm:w-auto" disabled={!isAuthorized}>
            {allAssignedMemberIds.length > 0 ? (
                <><Edit2 className="mr-2 h-4 w-4" /> Edit Committee</>
            ) : (
                <><Users className="mr-2 h-4 w-4" /> Assign Committee</>
            )}
        </Button>
    );

    return (
        <Card className="border-dashed">
            <CardHeader className="flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div>
                    <CardTitle>Evaluation Committee (Scorers)</CardTitle>
                    <CardDescription>
                        {requisition.committeePurpose ? `Purpose: ${requisition.committeePurpose}` : 'Assign scorers to evaluate vendor quotations.'}
                    </CardDescription>
                </div>
                 <Dialog open={isCommitteeDialogOpen} onOpenChange={setCommitteeDialogOpen}>
                    <DialogTrigger asChild>
                         {isAuthorized ? (
                            triggerButton
                        ) : (
                           <span tabIndex={0}>{triggerButton}</span>
                        )}
                    </DialogTrigger>
                    <CommitteeForm 
                        requisition={requisition} 
                        onCommitteeUpdated={onCommitteeUpdated}
                        onOpenChange={setCommitteeDialogOpen}
                    />
                </Dialog>
            </CardHeader>
            <CardContent className="space-y-6">
                 <MemberList title="Financial Committee" description="Responsible for evaluating cost and financial stability." members={assignedFinancialMembers} />
                 <MemberList title="Technical Committee" description="Responsible for assessing technical specs and compliance." members={assignedTechnicalMembers} />
                 {requisition.scoringDeadline && (
                    <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground border-t pt-4">
                        <Timer className="h-4 w-4"/>
                        <span className="font-semibold">Scoring Deadline:</span>
                        <span>{format(new Date(requisition.scoringDeadline), 'PPpp')}</span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
