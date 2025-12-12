

'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { User, UserRole } from '@/lib/types';


export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { 
        userId, 
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

    const user = await prisma.user.findUnique({where: {id: userId}, include: { roles: true }});
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized: User not found' }, { status: 403 });
    }
    
    // Correct Authorization Logic
    const rfqSenderSetting = await prisma.setting.findUnique({ where: { key: 'rfqSenderSetting' } });
    let isAuthorized = false;
    const userRoles = (user.roles as any[]).map(r => r.name);
    
    if (userRoles.includes('Admin') || userRoles.includes('Committee')) {
        isAuthorized = true;
    } else if (rfqSenderSetting?.value && typeof rfqSenderSetting.value === 'object' && 'type' in rfqSenderSetting.value) {
        const setting = rfqSenderSetting.value as { type: string, userId?: string };
        if (setting.type === 'specific') {
            isAuthorized = setting.userId === userId;
        } else { // 'all' case
            isAuthorized = userRoles.includes('Procurement_Officer');
        }
    }

    if (!isAuthorized) {
        return NextResponse.json({ error: 'Unauthorized to assign committees based on system settings.' }, { status: 403 });
    }
    
    const newAllMemberIds = new Set([...(financialCommitteeMemberIds || []), ...(technicalCommitteeMemberIds || [])]);
    
    // Start a transaction to ensure atomicity
    const transactionResult = await prisma.$transaction(async (tx) => {
        
        // Add "Committee_Member" role to new members
        const committeeRole = await tx.role.findUnique({ where: { name: 'Committee_Member' } });
        if (!committeeRole) {
            throw new Error("Committee_Member role not found. Please seed the database.");
        }

        for (const memberId of newAllMemberIds) {
            await tx.user.update({
                where: { id: memberId },
                data: {
                    roles: {
                        connect: { id: committeeRole.id }
                    }
                }
            });
        }

        const updatedRequisition = await tx.purchaseRequisition.update({
        where: { id },
        data: {
            committeeName,
            committeePurpose,
            scoringDeadline: scoringDeadline ? new Date(scoringDeadline) : undefined,
            rfqSettings: rfqSettings || {},
            financialCommitteeMembers: {
            set: financialCommitteeMemberIds.map((id: string) => ({ id }))
            },
            technicalCommitteeMembers: {
            set: technicalCommitteeMemberIds.map((id: string) => ({ id }))
            }
        }
        });

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
        
        await tx.auditLog.create({
            data: {
                transactionId: requisition.transactionId,
                timestamp: new Date(),
                user: { connect: { id: user.id } },
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
