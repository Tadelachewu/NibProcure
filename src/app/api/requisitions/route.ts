
'use server';

import { NextResponse } from 'next/server';
import type { PurchaseRequisition, User, UserRole, Vendor } from '@/lib/types';
import { prisma } from '@/lib/prisma';
import { getUserByToken } from '@/lib/auth';
import { headers } from 'next/headers';
import { sendEmail } from '@/services/email-service';
import { differenceInMinutes, format, isPast } from 'date-fns';


function getNextStatusFromRole(role: string): string {
    switch (role) {
        case 'Manager_Procurement_Division':
            return 'Pending_Managerial_Approval';
        case 'Director_Supply_Chain_and_Property_Management':
            return 'Pending_Director_Approval';
        case 'VP_Resources_and_Facilities':
            return 'Pending_VP_Approval';
        case 'President':
            return 'Pending_President_Approval';
        case 'Committee_A_Member':
            return 'Pending_Committee_A_Recommendation';
        case 'Committee_B_Member':
            return 'Pending_Committee_B_Review';
        default:
            return `Pending_${role}`;
    }
}


export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get('status');
  const forVendor = searchParams.get('forVendor');
  const approverId = searchParams.get('approverId');
  const forQuoting = searchParams.get('forQuoting');
  const forReview = searchParams.get('forReview');

  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.split(' ')[1];
  let userPayload: { user: User, role: UserRole } | null = null;
  if(token) {
    userPayload = await getUserByToken(token);
  }

  try {
    let whereClause: any = {};
    
    if (forReview === 'true' && userPayload) {
        const userRole = userPayload.role;
        const reviewStatuses = [
            'Pending_Committee_A_Recommendation',
            'Pending_Committee_B_Review',
            'Pending_Managerial_Approval',
            'Pending_Director_Approval',
            'Pending_VP_Approval',
            'Pending_President_Approval'
        ];

        if (userRole === 'Committee_A_Member') {
             whereClause.status = 'Pending_Committee_A_Recommendation';
        } else if (userRole === 'Committee_B_Member') {
            whereClause.status = 'Pending_Committee_B_Review';
        } else if (userRole === 'Admin' || userRole === 'Procurement_Officer') {
             whereClause.status = { in: reviewStatuses };
        } else {
            // For hierarchical approvers
            whereClause.currentApproverId = userPayload.user.id;
        }

    } else if (forVendor === 'true') {
        if (!userPayload || !userPayload.user.vendorId) {
             return NextResponse.json({ error: 'Unauthorized: No valid vendor found for this user.' }, { status: 403 });
        }
        
        whereClause.OR = [
            // Condition A: Open for bidding
            {
                AND: [
                    { status: 'Accepting_Quotes' }, 
                    { deadline: { not: null } },
                    { deadline: { gt: new Date() } },
                    {
                        OR: [
                        { allowedVendorIds: { isEmpty: true } },
                        { allowedVendorIds: { has: userPayload.user.vendorId } },
                        ],
                    },
                    {
                        NOT: {
                        quotations: {
                            some: {
                            vendorId: userPayload.user.vendorId,
                            },
                        },
                        },
                    },
                ]
            },
            // Condition B: Awarded to this vendor
            {
                quotations: {
                    some: {
                        vendorId: userPayload.user.vendorId,
                        status: { in: ['Awarded', 'Partially_Awarded', 'Accepted', 'Invoice_Submitted'] }
                    }
                }
            }
        ];

    } else if (forQuoting) {
         whereClause.OR = [
            { status: 'PreApproved' },
            { status: 'PostApproved' },
            { status: { startsWith: 'Pending_' } },
            { status: 'Accepting_Quotes' },
            { status: 'Scoring_In_Progress' },
            { status: 'Scoring_Complete' },
            { status: 'Awarded' },
        ];
    } else {
      if (statusParam) whereClause.status = { in: statusParam.split(',').map(s => s.trim().replace(/ /g, '_')) };
      if (approverId) {
        whereClause.OR = [
            { currentApproverId: approverId }, // Items currently pending this user's approval
            { approverId: approverId }       // Items this user has already actioned
        ];
      }
      
      if (userPayload && userPayload.role === 'Requester' && !statusParam && !approverId) {
        whereClause.requesterId = userPayload.user.id;
      }
    }


    const requisitions = await prisma.purchaseRequisition.findMany({
      where: whereClause,
      include: {
        requester: true,
        department: true,
        quotations: {
          select: {
            vendorId: true,
            status: true
          }
        },
        financialCommitteeMembers: { select: { id: true } },
        technicalCommitteeMembers: { select: { id: true } },
        committeeAssignments: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const formattedRequisitions = requisitions.map(req => ({
        ...req,
        requesterName: req.requester.name,
        department: req.department?.name || 'N/A'
    }));
    
    return NextResponse.json(formattedRequisitions);
  } catch (error) {
    console.error('Failed to fetch requisitions:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to fetch requisitions', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
) {
  try {
    const body = await request.json();
    const { id, status, userId, comment, minute } = body;
    console.log(`--- REQUISITIONS PATCH Request for REQ: ${id} ---`);
    console.log(`[PATCH] Received action: status=${status}, userId=${userId}`);
    
    const newStatus = status ? status.replace(/ /g, '_') : null;

    const user = await prisma.user.findUnique({where: {id: userId}});
    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const requisition = await prisma.purchaseRequisition.findUnique({ 
        where: { id },
        include: { department: true, requester: true }
    });
    if (!requisition) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
    }
    console.log(`[PATCH] Current requisition status: ${requisition.status}`);

    let dataToUpdate: any = {};
    let auditAction = 'UPDATE_REQUISITION';
    let auditDetails = `Updated requisition ${id}.`;

    if (requisition.status === 'Pending_Approval') {
        console.log(`[PATCH] Handling standard departmental approval.`);
        if (requisition.currentApproverId !== userId) {
            return NextResponse.json({ error: 'Unauthorized. You are not the current approver.' }, { status: 403 });
        }
        if (newStatus === 'Rejected') {
            dataToUpdate.status = 'Rejected';
            dataToUpdate.currentApproverId = null;
            auditAction = 'REJECT_REQUISITION';
            auditDetails = `Requisition ${id} was rejected by ${user.role.replace(/_/g, ' ')} with comment: "${comment}".`;
        } else { // Department head approves
             dataToUpdate.status = 'PreApproved'; // This is the fix. The status is now distinct.
             dataToUpdate.currentApproverId = null; 
             auditAction = 'PRE_APPROVE_REQUISITION';
             auditDetails = `Requisition ${id} was pre-approved by ${user.role.replace(/_/g, ' ')} with comment: "${comment}". Ready for RFQ.`;
        }
        // Set the approver who took the action
        dataToUpdate.approver = { connect: { id: userId } };
        dataToUpdate.approverComment = comment;

    } else if (requisition.status.startsWith('Pending_')) {
        console.log(`[PATCH] Handling hierarchical approval.`);
        
        let isDesignatedApprover = false;
        
        if (requisition.status === 'Pending_Committee_A_Recommendation') {
            isDesignatedApprover = user.role === 'Committee_A_Member';
        } else if (requisition.status === 'Pending_Committee_B_Review') {
            isDesignatedApprover = user.role === 'Committee_B_Member';
        } else {
            isDesignatedApprover = requisition.currentApproverId === userId;
        }

        if (!isDesignatedApprover) {
            console.error(`[PATCH] Unauthorized. User ${userId} (${user.role}) is not the designated approver for status ${requisition.status}.`);
            return NextResponse.json({ error: 'You are not the designated approver for this item.' }, { status: 403 });
        }
        
        if (newStatus === 'Rejected') {
             dataToUpdate.currentApproverId = null;
             dataToUpdate.status = 'Rejected';
             auditAction = 'REJECT_AWARD';
             auditDetails = `Award for requisition ${id} was rejected by ${user.role.replace(/_/g, ' ')}. Reason: "${comment}".`;
             console.log(`[PATCH] Award rejected. New status: Rejected.`);
        } else if (newStatus === 'Approved') { // Using "Approved" as the action from the frontend
            const approvalMatrix = await prisma.approvalThreshold.findMany({ include: { steps: { orderBy: { order: 'asc' } } }, orderBy: { min: 'asc' }});
            const totalValue = requisition.totalPrice;
            const relevantTier = approvalMatrix.find(tier => totalValue >= tier.min && (tier.max === null || totalValue <= tier.max));

            if (!relevantTier) {
                 return NextResponse.json({ error: 'No approval tier configured for this award value.' }, { status: 400 });
            }
            console.log(`[PATCH] Found relevant tier: ${relevantTier.name}`);
            
            const currentStepIndex = relevantTier.steps.findIndex(step => requisition.status === getNextStatusFromRole(step.role));
            console.log(`[PATCH] Current step index in tier: ${currentStepIndex}`);
            
            if (currentStepIndex !== -1 && currentStepIndex < relevantTier.steps.length - 1) {
                const nextStep = relevantTier.steps[currentStepIndex + 1];
                console.log(`[PATCH] Found next step: ${nextStep.role}`);
                dataToUpdate.status = getNextStatusFromRole(nextStep.role);

                if (!nextStep.role.includes('Committee')) {
                    const nextApprover = await prisma.user.findFirst({ where: { role: nextStep.role }});
                    dataToUpdate.currentApproverId = nextApprover?.id || null;
                } else {
                     dataToUpdate.currentApproverId = null;
                }
                console.log(`[PATCH] Advancing to next step. New Status: ${dataToUpdate.status}, Next Approver: ${dataToUpdate.currentApproverId}`);
                auditDetails = `Award approved by ${user.role.replace(/_/g, ' ')}. Advanced to ${nextStep.role.replace(/_/g, ' ')}.`;
            } else {
                console.log(`[PATCH] This is the final approval step.`);
                dataToUpdate.status = 'PostApproved'; // This is the fix. The final status is distinct.
                dataToUpdate.currentApproverId = null;
                console.log(`[PATCH] Setting status to PostApproved.`);
                auditDetails = `Final award approval for requisition ${id} granted by ${user.role.replace(/_/g, ' ')}. Ready for vendor notification.`;
            }
            auditAction = 'APPROVE_AWARD_STEP';
        } else {
            return NextResponse.json({ error: 'Invalid action for this requisition state.' }, { status: 400 });
        }
        
        if (minute) {
            await prisma.minute.create({
                data: {
                    requisition: { connect: { id: id } },
                    author: { connect: { id: userId } },
                    decision: status === 'Approved' ? 'APPROVED' : 'REJECTED',
                    decisionBody: user.role.replace(/_/g, ' '),
                    justification: minute.justification,
                    attendees: {
                        connect: minute.attendeeIds.map((id: string) => ({ id }))
                    }
                }
            });
            auditDetails += ` Minute recorded.`;
        }

    } else if ((requisition.status === 'Draft' || requisition.status === 'Rejected') && newStatus === 'Pending_Approval') {
        const isRequester = requisition.requesterId === userId;
        if (!isRequester) return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
        const department = await prisma.department.findUnique({ where: { id: requisition.departmentId! } });
        if (department?.headId) {
            dataToUpdate.currentApproverId = department.headId;
            dataToUpdate.status = 'Pending_Approval';
        } else { // No department head, auto-approve
            dataToUpdate.status = 'PreApproved';
            dataToUpdate.currentApproverId = null;
        }
         auditDetails = `Requisition ${id} submitted for approval.`;
         auditAction = 'SUBMIT_FOR_APPROVAL';
    } else {
        return NextResponse.json({ error: 'Invalid operation for current status.' }, { status: 400 });
    }
    
    const updatedRequisition = await prisma.purchaseRequisition.update({
      where: { id },
      data: dataToUpdate,
    });
    
    await prisma.auditLog.create({
        data: {
            transactionId: updatedRequisition.transactionId,
            user: { connect: { id: user.id } },
            timestamp: new Date(),
            action: auditAction,
            entity: 'Requisition',
            entityId: id,
            details: auditDetails,
        }
    });

    console.log(`--- REQUISITIONS PATCH Request END for REQ: ${id} ---`);
    return NextResponse.json(updatedRequisition);
  } catch (error) {
    console.error('[PATCH] Failed to update requisition:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const user = await prisma.user.findFirst({where: {id: body.requesterId}});
    if (!user) {
        return NextResponse.json({ error: 'Requester user not found' }, { status: 404 });
    }

    const totalPrice = body.items.reduce((acc: number, item: any) => {
        const price = item.unitPrice || 0;
        const quantity = item.quantity || 0;
        return acc + (price * quantity);
    }, 0);
    
    const department = await prisma.department.findUnique({ where: { name: body.department } });
    if (!department) {
        return NextResponse.json({ error: 'Department not found' }, { status: 404 });
    }

    const newRequisition = await prisma.purchaseRequisition.create({
        data: {
            requester: { connect: { id: user.id } },
            department: { connect: { id: department.id } },
            title: body.title,
            urgency: body.urgency,
            justification: body.justification,
            status: 'Draft',
            totalPrice: totalPrice,
            items: {
                create: body.items.map((item: any) => ({
                    name: item.name,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice || 0,
                    description: item.description || ''
                }))
            },
            customQuestions: {
                create: body.customQuestions?.map((q: any) => ({
                    questionText: q.questionText,
                    questionType: q.questionType.replace(/-/g, '_'),
                    isRequired: q.isRequired,
                    options: q.options || [],
                }))
            },
            evaluationCriteria: {
                create: {
                    financialWeight: body.evaluationCriteria.financialWeight,
                    technicalWeight: body.evaluationCriteria.technicalWeight,
                    financialCriteria: {
                        create: body.evaluationCriteria.financialCriteria.map((c:any) => ({ name: c.name, weight: c.weight }))
                    },
                    technicalCriteria: {
                        create: body.evaluationCriteria.technicalCriteria.map((c:any) => ({ name: c.name, weight: c.weight }))
                    }
                }
            },
        },
        include: { items: true, customQuestions: true, evaluationCriteria: true }
    });

    const finalRequisition = await prisma.purchaseRequisition.update({
        where: { id: newRequisition.id },
        data: { transactionId: newRequisition.id }
    });

    await prisma.auditLog.create({
        data: {
            transactionId: finalRequisition.id,
            user: { connect: { id: user.id } },
            timestamp: new Date(),
            action: 'CREATE_REQUISITION',
            entity: 'Requisition',
            entityId: finalRequisition.id,
            details: `Created new requisition: "${finalRequisition.title}".`,
        }
    });

    return NextResponse.json(finalRequisition, { status: 201 });
  } catch (error) {
    console.error('Failed to create requisition:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process requisition', details: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}


export async function DELETE(
  request: Request,
) {
  try {
    const body = await request.json();
    const { id, userId } = body;

    const user = await prisma.user.findUnique({where: {id: userId}});
    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const requisition = await prisma.purchaseRequisition.findUnique({ where: { id } });

    if (!requisition) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
    }

    const canDelete = (requisition.requesterId === userId) || (user.role === 'Procurement_Officer' || user.role === 'Admin');

    if (!canDelete) {
      return NextResponse.json({ error: 'You are not authorized to delete this requisition.' }, { status: 403 });
    }
    
    if (requisition.status !== 'Draft' && requisition.status !== 'Rejected') {
        return NextResponse.json({ error: `Cannot delete a requisition with status "${requisition.status}".` }, { status: 400 });
    }
    
    await prisma.requisitionItem.deleteMany({ where: { requisitionId: id } });
    await prisma.customQuestion.deleteMany({ where: { requisitionId: id } });
    
    const oldCriteria = await prisma.evaluationCriteria.findUnique({ where: { requisitionId: id }});
    if (oldCriteria) {
        await prisma.financialCriterion.deleteMany({ where: { evaluationCriteriaId: oldCriteria.id }});
        await prisma.technicalCriterion.deleteMany({ where: { evaluationCriteriaId: oldCriteria.id }});
        await prisma.evaluationCriteria.delete({ where: { id: oldCriteria.id }});
    }

    await prisma.purchaseRequisition.delete({ where: { id } });

    await prisma.auditLog.create({
        data: {
            transactionId: requisition.transactionId,
            user: { connect: { id: user.id } },
            timestamp: new Date(),
            action: 'DELETE_REQUISITION',
            entity: 'Requisition',
            entityId: id,
            details: `Deleted requisition: "${requisition.title}".`,
        }
    });

    return NextResponse.json({ message: 'Requisition deleted successfully.' });
  } catch (error) {
     console.error('Failed to delete requisition:', error);
     if (error instanceof Error) {
        const prismaError = error as any;
        if(prismaError.code === 'P2025') {
            return NextResponse.json({ error: 'Failed to delete related data. The requisition may have already been deleted.' }, { status: 404 });
        }
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
