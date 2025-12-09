
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { User, UserRole } from '@/lib/types';
import { getActorFromToken } from '@/lib/auth';
import { sendEmail } from '@/services/email-service';


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

    // Correct Authorization Logic
    const rfqSenderSetting = await prisma.setting.findUnique({ where: { key: 'rfqSenderSetting' } });
    let isAuthorized = false;
    const userRoles = actor.roles as UserRole[];
    
    if (userRoles.includes('Admin') || userRoles.includes('Committee')) {
      isAuthorized = true;
    } else if (rfqSenderSetting?.value && typeof rfqSenderSetting.value === 'object' && 'type' in rfqSenderSetting.value) {
        const setting = rfqSenderSetting.value as { type: string, userId?: string };
        if (setting.type === 'specific') {
            isAuthorized = setting.userId === actor.id;
        } else { // 'all' case
            isAuthorized = userRoles.includes('Procurement_Officer');
        }
    }


    if (!isAuthorized) {
        return NextResponse.json({ error: 'Unauthorized to assign committees based on system settings.' }, { status: 403 });
    }
    
    // Start a transaction to ensure atomicity
    const transactionResult = await prisma.$transaction(async (tx) => {

        const oldFinancialIds = new Set(requisition.financialCommitteeMemberIds || []);
        const oldTechnicalIds = new Set(requisition.technicalCommitteeMemberIds || []);

        const updatedRequisition = await tx.purchaseRequisition.update({
            where: { id },
            data: {
                committeeName,
                committeePurpose,
                scoringDeadline: scoringDeadline ? new Date(scoringDeadline) : undefined,
                rfqSettings: rfqSettings || {},
                financialCommitteeMembers: { set: financialCommitteeMemberIds.map((id: string) => ({ id })) },
                technicalCommitteeMembers: { set: technicalCommitteeMemberIds.map((id: string) => ({ id })) }
            }
        });

        const newAllMemberIds = new Set([...(financialCommitteeMemberIds || []), ...(technicalCommitteeMemberIds || [])]);
        const allPreviouslyAssignedIds = new Set([...oldFinancialIds, ...oldTechnicalIds]);
        const membersToNotify: User[] = [];

        // Add 'Committee_Member' role to new members and prepare notifications
        for (const memberId of Array.from(newAllMemberIds)) {
            if (!allPreviouslyAssignedIds.has(memberId)) { // This is a new member for this req
                const userToUpdate = await tx.user.findUnique({ where: { id: memberId }, include: { roles: true }});
                if (userToUpdate && !userToUpdate.roles.some(r => r.name === 'Committee_Member')) {
                    await tx.user.update({
                        where: { id: memberId },
                        data: {
                            roles: {
                                connect: { name: 'Committee_Member' }
                            }
                        }
                    });
                }
                if(userToUpdate) {
                    membersToNotify.push(userToUpdate as User);
                }
            }
        }
        
        const existingAssignments = await tx.committeeAssignment.findMany({ where: { requisitionId: id } });
        const existingMemberIds = new Set(existingAssignments.map(a => a.userId));
        
        const membersToAdd = Array.from(newAllMemberIds).filter(memberId => !existingMemberIds.has(memberId as string));
        if (membersToAdd.length > 0) {
            await tx.committeeAssignment.createMany({
                data: membersToAdd.map(memberId => ({
                    userId: memberId as string,
                    requisitionId: id,
                    scoresSubmitted: false,
                })),
            });
        }
        
        const membersToRemove = existingAssignments.filter(a => !newAllMemberIds.has(a.userId));
        if (membersToRemove.length > 0) {
            await tx.committeeAssignment.deleteMany({
                where: {
                    requisitionId: id,
                    userId: { in: membersToRemove.map(m => m.userId) }
                }
            });
        }

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

        return { updatedRequisition, membersToNotify };
    });

    // Send emails outside the transaction
    for (const member of transactionResult.membersToNotify) {
        if (member.email) {
            const emailHtml = `
                <h1>Committee Assignment Notification</h1>
                <p>Hello ${member.name},</p>
                <p>You have been assigned to an evaluation committee for a procurement request.</p>
                <ul>
                    <li><strong>Requisition Title:</strong> ${requisition.title}</li>
                    <li><strong>Requisition ID:</strong> ${requisition.id}</li>
                    <li><strong>Committee Name:</strong> ${committeeName}</li>
                    <li><strong>Scoring Deadline:</strong> ${scoringDeadline ? new Date(scoringDeadline).toLocaleString() : 'N/A'}</li>
                </ul>
                <p>Your role has been updated to include "Committee Member" permissions, allowing you to access and score quotations.</p>
                <p>Please log in to the portal to view the details.</p>
                <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002'}/quotations/${requisition.id}">Go to Quotation Page</a>
            `;
            await sendEmail({
                to: member.email,
                subject: `You have been assigned to an evaluation committee for: ${requisition.title}`,
                html: emailHtml,
            }).catch(console.error); // Log email errors but don't fail the request
        }
    }


    return NextResponse.json(transactionResult.updatedRequisition);

  } catch (error) {
    console.error('Failed to assign committee:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
