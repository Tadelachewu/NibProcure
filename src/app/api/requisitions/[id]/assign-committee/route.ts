
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { User, UserRole } from '@/lib/types';
import { getActorFromToken, isActorAuthorizedForRequisition } from '@/lib/auth';


export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const actor = await getActorFromToken(request);
    if (!actor) {
        return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
    }

    const { id } = params;
    const body = await request.json();
    const { 
        financialCommitteeMemberIds, 
        technicalCommitteeMemberIds,
        committeeName, 
        committeePurpose, 
        scoringDeadline,
        rfqSettings 
    } = body;

        const requisition = await prisma.purchaseRequisition.findUnique({ where: { id } });
    if (!requisition) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
    }

        // Normalize rfqSettings and enforce director verification gate.
        let currentSettings: any = requisition.rfqSettings || {};
        if (typeof currentSettings === 'string') {
            try { currentSettings = JSON.parse(currentSettings); } catch { currentSettings = {}; }
        }

        const directorPresenceVerified = currentSettings?.directorPresenceVerified === true || currentSettings?.masked === false;
        const sealedByDefault = currentSettings?.masked !== false;

        // Enforce director PIN verification gate: cannot assign committee while sealed.
        // Default behavior is sealed unless explicitly unmasked.
        if (sealedByDefault && !directorPresenceVerified) {
            return NextResponse.json({ error: 'Vendor data is sealed. Required directors must verify their PINs before committee assignment.' }, { status: 403 });
        }

        // Note: gate above replaces the older masked===true-only behavior.
    
    // Authorization: Committees can assign themselves; procurement actions use per-requisition rules
    const userRoles = actor.roles as UserRole[];
    let isAuthorized = false;
    if (userRoles.includes('Committee')) {
        isAuthorized = true;
    } else {
        isAuthorized = await isActorAuthorizedForRequisition(actor, id as string);
    }

    if (!isAuthorized) {
        return NextResponse.json({ error: 'Unauthorized to assign committees.' }, { status: 403 });
    }
    
    // Start a transaction to ensure atomicity
    const transactionResult = await prisma.$transaction(async (tx) => {

        let incomingSettings: any = rfqSettings;
        if (typeof incomingSettings === 'string') {
            try { incomingSettings = JSON.parse(incomingSettings); } catch { incomingSettings = undefined; }
        }

        // Preserve existing rfqSettings unless the client explicitly changes them.
        // Also keep director verification permanently unmasked once verified.
        let nextSettings: any = { ...(typeof currentSettings === 'object' ? currentSettings : {}) };
        if (incomingSettings && typeof incomingSettings === 'object') {
            nextSettings = { ...nextSettings, ...incomingSettings };
        }
        if (directorPresenceVerified) {
            nextSettings = { ...nextSettings, masked: false, directorPresenceVerified: true };
        }

        const updatedRequisition = await tx.purchaseRequisition.update({
        where: { id },
        data: {
            committeeName,
            committeePurpose,
            scoringDeadline: scoringDeadline ? new Date(scoringDeadline) : undefined,
            rfqSettings: nextSettings,
            financialCommitteeMembers: {
            set: financialCommitteeMemberIds.map((id: string) => ({ id }))
            },
            technicalCommitteeMembers: {
            set: technicalCommitteeMemberIds.map((id: string) => ({ id }))
            }
        }
        });

        const newAllMemberIds = new Set([...(financialCommitteeMemberIds || []), ...(technicalCommitteeMemberIds || [])]);
        const existingAssignments = await tx.committeeAssignment.findMany({
            where: { requisitionId: id },
        });

        const existingMemberIds = new Set(existingAssignments.map(a => a.userId));
        
        // Members to be removed
        const membersToRemove = existingAssignments.filter(a => !newAllMemberIds.has(a.userId));
        if (membersToRemove.length > 0) {
            await tx.committeeAssignment.deleteMany({
                where: {
                    requisitionId: id,
                    userId: { in: membersToRemove.map(m => m.userId) }
                }
            });
        }
        
        // Members to be added
        const membersToAdd = Array.from(newAllMemberIds).filter(memberId => !existingMemberIds.has(memberId));
        if (membersToAdd.length > 0) {
            await tx.committeeAssignment.createMany({
                data: membersToAdd.map(memberId => ({
                    userId: memberId,
                    requisitionId: id,
                    scoresSubmitted: false,
                })),
            });
        }
        
        // Unchanged members' status is preserved automatically by not touching them.

        await tx.auditLog.create({
            data: {
                transactionId: requisition.transactionId,
                timestamp: new Date(),
                user: { connect: { id: actor.id } },
                action: 'ASSIGN_EVALUATION_COMMITTEE',
                entity: 'Requisition',
                entityId: id,
                details: `Assigned/updated evaluation committee for requisition ${id}. Name: ${committeeName}.`,
            }
        });

        return updatedRequisition;
    });


    return NextResponse.json(transactionResult);

  } catch (error) {
    console.error('Failed to assign committee:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
