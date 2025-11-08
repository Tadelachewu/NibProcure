
'use server';

import { NextResponse } from 'next/server';
import type { PurchaseRequisition, User, UserRole, Vendor } from '@/lib/types';
import { prisma } from '@/lib/prisma';
import { getUserByToken } from '@/lib/auth';
import { headers } from 'next/headers';
import { sendEmail } from '@/services/email-service';
import { differenceInMinutes, format, isPast } from 'date-fns';


function getNextStatusFromRole(role: string): string {
    // This function now standardly creates a 'Pending' status from a role name.
    return `Pending_${role.replace(/ /g, '_')}`;
}


export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get('status');
  const forVendor = searchParams.get('forVendor');
  const approverId = searchParams.get('approverId');
  const forQuoting = searchParams.get('forQuoting');
  const forAwardReview = searchParams.get('forAwardReview');

  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.split(' ')[1];
  let userPayload: { user: User, role: UserRole } | null = null;
  if(token) {
    userPayload = await getUserByToken(token);
  }

  try {
    let whereClause: any = {};
    
    const allPendingStatuses = [
      'Pending_Approval',
      'Pending_Committee_B_Review',
      'Pending_Committee_A_Recommendation',
      'Pending_Managerial_Approval',
      'Pending_Director_Approval',
      'Pending_VP_Approval',
      'Pending_President_Approval'
    ];

    if (forAwardReview === 'true' && userPayload) {
        const userRole = userPayload.role.replace(/ /g, '_') as UserRole;
        const userId = userPayload.user.id;
        
        const isCommitteeRole = userRole.startsWith('Committee_') && userRole.endsWith('_Member');
        
        const orConditions = [];

        // Condition 1: The user is the specific `currentApproverId` (for hierarchical roles)
        orConditions.push({ currentApproverId: userId });

        // Condition 2: The status matches a committee role this user has
        if (isCommitteeRole) {
            orConditions.push({ status: `Pending_${userRole}` });
        }
        
        // For Admins and Procurement Officers, show all items pending any form of award review
        if (userRole === 'Admin' || userRole === 'Procurement_Officer') {
             orConditions.push({ status: { in: [
                'Pending_Committee_A_Recommendation',
                'Pending_Committee_B_Review',
                'Pending_Managerial_Approval',
                'Pending_Director_Approval',
                'Pending_VP_Approval',
                'Pending_President_Approval',
                'PostApproved',
             ] } });
        }
        
        // Condition 3: Show items the user has already reviewed for historical context
        orConditions.push({ reviews: { some: { reviewerId: userId } } });

        whereClause.OR = orConditions;

    } else if (forVendor === 'true') {
        if (!userPayload || !userPayload.user.vendorId) {
             return NextResponse.json({ error: 'Unauthorized: No valid vendor found for this user.' }, { status: 403 });
        }
        
        whereClause.OR = [
            // Condition A: Open for bidding (not yet quoted by this vendor)
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
            // Condition B: Vendor has submitted a quote, so they should always see it.
            {
                quotations: {
                    some: {
                        vendorId: userPayload.user.vendorId
                    }
                }
            }
        ];

    } else if (forQuoting) {
        if (userPayload?.role === 'Committee_Member') {
            // **SECURITY FIX**: Committee members ONLY see requisitions they are assigned to.
            whereClause.OR = [
                { financialCommitteeMembers: { some: { id: userPayload.user.id } } },
                { technicalCommitteeMembers: { some: { id: userPayload.user.id } } },
            ];
            // And they should only see items that are actually in a scoring state
            whereClause.AND = [
                ...(whereClause.AND || []),
                {
                    status: {
                        in: [
                            'Accepting_Quotes',
                            'Scoring_In_Progress',
                            'Scoring_Complete',
                            'Award_Declined',
                            'Awarded',
                            'PostApproved',
                            'PO_Created'
                        ],
                    },
                },
            ];
        } else {
            // Procurement/Admin see all items in the quoting lifecycle
             whereClause.OR = [
                { status: 'PreApproved' },
                { status: 'PostApproved' },
                ...allPendingStatuses.map(s => ({ status: s })),
                { status: 'Accepting_Quotes' },
                { status: 'Scoring_In_Progress' },
                { status: 'Scoring_Complete' },
                { status: 'Award_Declined' },
                { status: 'Awarded' },
            ];
        }
    } else {
      if (statusParam) whereClause.status = { in: statusParam.split(',').map(s => s.trim().replace(/ /g, '_')) };
      if (approverId) {
        whereClause.OR = [
            { currentApproverId: approverId }, // Items currently pending this user's approval
            { approverId: approverId }       // Items this user has actioned
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
        approver: true,
        quotations: {
          select: {
            id: true,
            vendorId: true,
            status: true,
            vendorName: true,
            totalPrice: true,
            finalAverageScore: true,
            items: {
              select: {
                id: true,
                requisitionItemId: true,
                name: true,
                quantity: true,
                unitPrice: true,
              }
            }
          }
        },
        financialCommitteeMembers: { select: { id: true } },
        technicalCommitteeMembers: { select: { id: true } },
        committeeAssignments: true,
        items: {
          select: {
            id: true,
            name: true,
            description: true,
            quantity: true,
            unitPrice: true,
          }
        },
        minutes: {
          include: {
            author: true,
            attendees: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    
    const transactionIds = requisitions.map(r => r.transactionId).filter(Boolean) as string[];
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        transactionId: { in: transactionIds }
      },
      include: {
        user: { select: { name: true, role: true } }
      },
      orderBy: {
        timestamp: 'desc'
      }
    });

    const logsByTransaction = new Map<string, any[]>();
    auditLogs.forEach(log => {
      if (log.transactionId) {
        if (!logsByTransaction.has(log.transactionId)) {
          logsByTransaction.set(log.transactionId, []);
        }
        logsByTransaction.get(log.transactionId)!.push({
          ...log,
          user: log.user?.name || 'System',
          role: log.user?.role?.replace(/_/g, ' ') || 'System',
          approverComment: log.details, // Use details for comment
        });
      }
    });

    const formattedRequisitions = requisitions.map(req => ({
        ...req,
        requesterName: req.requester?.name || 'Unknown',
        department: req.department?.name || 'N/A',
        auditTrail: logsByTransaction.get(req.transactionId!) || [],
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

    let dataToUpdate: any = {};
    let auditAction = 'UPDATE_REQUISITION';
    let auditDetails = `Updated requisition ${id}.`;

    if (requisition.status === 'Pending_Approval') {
        if (requisition.currentApproverId !== userId) {
            return NextResponse.json({ error: 'Unauthorized. You are not the current approver.' }, { status: 403 });
        }
        if (newStatus === 'Rejected') {
            dataToUpdate.status = 'Rejected';
            dataToUpdate.currentApprover = { disconnect: true };
            auditAction = 'REJECT_REQUISITION';
            auditDetails = `Requisition ${id} was rejected by ${user.role.replace(/_/g, ' ')} with comment: "${comment}".`;
        } else { // Department head approves
             dataToUpdate.status = 'PreApproved'; 
             dataToUpdate.currentApprover = { disconnect: true };
             auditAction = 'PRE_APPROVE_REQUISITION';
             auditDetails = `Requisition ${id} was pre-approved by ${user.role.replace(/_/g, ' ')} with comment: "${comment}". Ready for RFQ.`;
        }
        // Set the approver who took the action
        dataToUpdate.approver = { connect: { id: userId } };
        dataToUpdate.approverComment = comment;

    } else if (requisition.status.startsWith('Pending_')) {
        const requiredRole = requisition.status.replace('Pending_', '');
        let isDesignatedApprover = false;

        // Check if the user's role matches the required role for the committee step
        if (user.role === requiredRole) {
            isDesignatedApprover = true;
        } 
        // Check if the user is the specific current approver for hierarchical steps
        else if (requisition.currentApproverId === userId) {
            isDesignatedApprover = true;
        }


        if (!isDesignatedApprover) {
            return NextResponse.json({ error: 'You are not the designated approver for this item.' }, { status: 403 });
        }
        
        if (newStatus === 'Rejected') {
             return await prisma.$transaction(async (tx) => {
                const quotationsToDelete = await tx.quotation.findMany({
                    where: { requisitionId: id },
                    include: { scores: { include: { itemScores: { include: { scores: true } } } } }
                });

                const scoreSetIds = quotationsToDelete.flatMap(q => q.scores.map(s => s.id));
                const itemScoreIds = quotationsToDelete.flatMap(q => q.scores.flatMap(s => s.itemScores.map(i => i.id)));

                if (itemScoreIds.length > 0) {
                    await tx.score.deleteMany({ where: { itemScoreId: { in: itemScoreIds } } });
                }
                if (scoreSetIds.length > 0) {
                    await tx.itemScore.deleteMany({ where: { scoreSetId: { in: scoreSetIds } } });
                }
                if (scoreSetIds.length > 0) {
                    await tx.committeeScoreSet.deleteMany({ where: { id: { in: scoreSetIds } } });
                }
                await tx.quotation.deleteMany({ where: { requisitionId: id } });
                
                await tx.committeeAssignment.deleteMany({ where: { requisitionId: id }});

                const updatedReq = await tx.purchaseRequisition.update({
                    where: { id: id },
                    data: {
                        status: 'Rejected',
                        currentApproverId: null,
                        committeeName: null,
                        committeePurpose: null,
                        scoringDeadline: null,
                        awardedQuoteItemIds: [],
                        awardResponseDeadline: null,
                        financialCommitteeMembers: { set: [] },
                        technicalCommitteeMembers: { set: [] },
                    }
                });

                await tx.auditLog.create({
                    data: {
                        transactionId: requisition.transactionId,
                        user: { connect: { id: user.id } },
                        timestamp: new Date(),
                        action: 'REJECT_AWARD',
                        entity: 'Requisition',
                        entityId: id,
                        details: `Award for requisition ${id} was rejected by ${user.role.replace(/_/g, ' ')}. All quotes and scores have been reset. Reason: "${comment}".`,
                    }
                });
                return NextResponse.json(updatedReq);
             });
        } else if (newStatus === 'Approved') { // Using "Approved" as the action from the frontend
             return await prisma.$transaction(async (tx) => {
                const approvalMatrix = await tx.approvalThreshold.findMany({ include: { steps: { orderBy: { order: 'asc' } } }, orderBy: { min: 'asc' }});
                const totalValue = requisition.totalPrice;
                const relevantTier = approvalMatrix.find(tier => totalValue >= tier.min && (tier.max === null || totalValue <= tier.max));

                if (!relevantTier) {
                    throw new Error('No approval tier configured for this award value.');
                }
                
                const currentStepIndex = relevantTier.steps.findIndex(step => requisition.status === getNextStatusFromRole(step.role));
                
                if (currentStepIndex !== -1 && currentStepIndex < relevantTier.steps.length - 1) {
                    const nextStep = relevantTier.steps[currentStepIndex + 1];
                    dataToUpdate.status = getNextStatusFromRole(nextStep.role);

                    if (!nextStep.role.includes('Committee')) {
                        const nextApprover = await tx.user.findFirst({ where: { role: nextStep.role }});
                        if (nextApprover) {
                          dataToUpdate.currentApprover = { connect: { id: nextApprover.id } };
                        } else {
                          dataToUpdate.currentApprover = { disconnect: true };
                        }
                    } else {
                        dataToUpdate.currentApprover = { disconnect: true };
                    }
                    auditDetails = `Award approved by ${user.role.replace(/_/g, ' ')}. Advanced to ${nextStep.role.replace(/_/g, ' ')}.`;
                } else {
                    // This is the final approval. Set to PostApproved to await manual notification.
                    dataToUpdate.status = 'PostApproved';
                    dataToUpdate.currentApprover = { disconnect: true };
                    auditDetails = `Final award approval for requisition ${id} granted by ${user.role.replace(/_/g, ' ')}. Ready for vendor notification.`;
                }
                auditAction = 'APPROVE_AWARD_STEP';

                const updatedRequisition = await tx.purchaseRequisition.update({
                    where: { id },
                    data: dataToUpdate,
                });
                
                if (minute) {
                    await tx.minute.create({
                        data: {
                            requisition: { connect: { id: id } },
                            author: { connect: { id: userId } },
                            decision: 'APPROVED',
                            decisionBody: user.role.replace(/_/g, ' '),
                            justification: minute.justification,
                            attendees: {
                                connect: minute.attendeeIds.map((id: string) => ({ id }))
                            }
                        }
                    });
                    auditDetails += ` Minute recorded.`;
                }

                // Also create a "Review" record to track this specific approval action
                await tx.review.create({
                    data: {
                        requisition: { connect: { id: id } },
                        reviewer: { connect: { id: userId } },
                        decision: 'APPROVED',
                        comment: comment,
                    }
                });

                 await tx.auditLog.create({
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

                return NextResponse.json(updatedRequisition);
             });
        } else {
             return NextResponse.json({ error: 'Invalid action for this requisition state.' }, { status: 400 });
        }
        

    } else if ((requisition.status === 'Draft' || requisition.status === 'Rejected') && newStatus === 'Pending_Approval') {
        const isRequester = requisition.requesterId === userId;
        if (!isRequester) return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
        const department = await prisma.department.findUnique({ where: { id: requisition.departmentId! } });
        if (department?.headId) {
            dataToUpdate.currentApprover = { connect: { id: department.headId } };
            dataToUpdate.status = 'Pending_Approval';
        } else { // No department head, move to PreApproved for RFQ sender
            dataToUpdate.status = 'PreApproved';
            dataToUpdate.currentApprover = { disconnect: true };
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

    return NextResponse.json(updatedRequisition);
    
  } catch (error) {
    console.error('[PATCH] Failed to update requisition:', error);
    if (error instanceof Error) {
        if ((error as any).code === 'P2003') {
            return NextResponse.json({ error: 'A foreign key constraint was violated. This may be due to attempting to delete a record that is still referenced elsewhere.', details: (error as any).meta }, { status: 409 });
        }
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

    const newRequisition = await prisma.$transaction(async (tx) => {
        const createdReq = await tx.purchaseRequisition.create({
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
                        quantity: Number(item.quantity) || 0,
                        unitPrice: Number(item.unitPrice) || 0,
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
                            create: body.evaluationCriteria.financialCriteria.map((c:any) => ({ name: c.name, weight: Number(c.weight) }))
                        },
                        technicalCriteria: {
                            create: body.evaluationCriteria.technicalCriteria.map((c:any) => ({ name: c.name, weight: Number(c.weight) }))
                        }
                    }
                },
            },
            include: { items: true, customQuestions: true, evaluationCriteria: true }
        });
        
        // Now update with the transactionId
        const finalReq = await tx.purchaseRequisition.update({
            where: { id: createdReq.id },
            data: { transactionId: createdReq.id }
        });

        await tx.auditLog.create({
            data: {
                transactionId: finalReq.id,
                user: { connect: { id: user.id } },
                timestamp: new Date(),
                action: 'CREATE_REQUISITION',
                entity: 'Requisition',
                entityId: finalReq.id,
                details: `Created new requisition: "${finalReq.title}".`,
            }
        });
        
        return finalReq;
    });


    return NextResponse.json(newRequisition, { status: 201 });
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

    