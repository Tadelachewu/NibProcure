

'use server';

import { NextResponse } from 'next/server';
import type { PurchaseRequisition, User, UserRole, Vendor } from '@/lib/types';
import { prisma } from '@/lib/prisma';
import { decodeJwt } from '@/lib/auth';
import { headers } from 'next/headers';
import { sendEmail } from '@/services/email-service';
import { isPast } from 'date-fns';
import { getNextApprovalStep } from '@/services/award-service';
import { Prisma } from '@prisma/client';


export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get('status');
  const forVendor = searchParams.get('forVendor');
  const approverId = searchParams.get('approverId');
  const forQuoting = searchParams.get('forQuoting');
  const forAwardReview = searchParams.get('forAwardReview');

  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.split(' ')[1];
  let userPayload: (User & { roles: { name: UserRole }[] }) | null = null;
  if(token) {
    const decodedUser = decodeJwt<User & { roles: { name: UserRole }[] }>(token);
    if(decodedUser) {
        userPayload = decodedUser;
    }
  }

  try {
    let whereClause: any = {};
    
    if (forAwardReview === 'true' && userPayload) {
        const userRoles = userPayload.roles.map(r => r.name);
        const userId = userPayload.id;
        
        const orConditions = [];

        // Can see if they are the direct current approver
        orConditions.push({ currentApproverId: userId });

        // Can see if they are part of a committee whose turn it is
        userRoles.forEach(roleName => {
            orConditions.push({ status: `Pending_${roleName}` });
        });

        // Admins and Procurement Officers can see all reviews for better oversight
        if (userRoles.includes('Admin') || userRoles.includes('Procurement_Officer')) {
             const allRequisitionStatuses = Object.values(Prisma.RequisitionStatus);
             const allPossiblePendingStatuses = allRequisitionStatuses.filter(s => s.startsWith('Pending_'));
             orConditions.push({ status: { in: allPossiblePendingStatuses } });
             orConditions.push({ status: 'PostApproved' });
        }
        
        whereClause.OR = orConditions;

    } else if (forVendor === 'true') {
        if (!userPayload || !userPayload.vendorId) {
             return NextResponse.json({ error: 'Unauthorized: No valid vendor found for this user.' }, { status: 403 });
        }
        
        whereClause.OR = [
            {
                AND: [
                    { status: 'Accepting_Quotes' }, 
                    { deadline: { not: null } },
                    { deadline: { gt: new Date() } },
                    {
                        OR: [
                        { allowedVendorIds: { isEmpty: true } },
                        { allowedVendorIds: { has: userPayload.vendorId } },
                        ],
                    },
                    {
                        NOT: {
                        quotations: {
                            some: {
                            vendorId: userPayload.vendorId,
                            },
                        },
                        },
                    },
                ]
            },
            {
                quotations: {
                    some: {
                        vendorId: userPayload.vendorId,
                    }
                }
            },
            {
                items: {
                  some: {
                    perItemAwardDetails: {
                      array_contains: [{vendorId: userPayload.vendorId}],
                    },
                  },
                },
            }
        ];

    } else if (forQuoting) {
        const allRequisitionStatuses = Object.values(Prisma.RequisitionStatus);
        const allPossiblePendingStatuses = allRequisitionStatuses.filter(s => s.startsWith('Pending_'));
        
        if (userPayload?.roles.some(r => r.name === 'Committee_Member')) {
            whereClause.OR = [
                { financialCommitteeMembers: { some: { id: userPayload.id } } },
                { technicalCommitteeMembers: { some: { id: userPayload.id } } },
            ];
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
                            'PO_Created',
                            'Closed',
                            'Fulfilled',
                            ...allPossiblePendingStatuses
                        ],
                    },
                },
            ];
        } else {
             whereClause.status = {
                in: [
                    'PreApproved',
                    'PostApproved',
                    'Accepting_Quotes',
                    'Scoring_In_Progress',
                    'Scoring_Complete',
                    'Award_Declined',
                    'Awarded',
                    'PO_Created',
                    'Fulfilled',
                    'Closed',
                    ...allPossiblePendingStatuses,
                ]
            };
        }
    } else {
      if (statusParam) whereClause.status = { in: statusParam.split(',').map(s => s.trim().replace(/ /g, '_')) };
      if (approverId) {
        whereClause.OR = [
            { currentApproverId: approverId },
            { reviews: { some: { reviewerId: approverId } } }
        ];
      }
      
      if (userPayload && userPayload.roles.some(r => r.name === 'Requester') && !statusParam && !approverId) {
        whereClause.requesterId = userPayload.id;
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
            perItemAwardDetails: true,
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
        user: { select: { name: true, roles: true } }
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
        const userRoles = log.user?.roles.map(r => (r as any).name).join(', ') || 'System';
        logsByTransaction.get(log.transactionId)!.push({
          ...log,
          user: log.user?.name || 'System',
          role: userRoles.replace(/_/g, ' '),
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
    console.log(`[PATCH /api/requisitions] Received request for ID ${id} with status ${status} by user ${userId}`);
    
    const newStatus = status ? status.replace(/ /g, '_') : null;

    const user = await prisma.user.findUnique({where: {id: userId}, include: {roles: true}});
    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const requisition = await prisma.purchaseRequisition.findUnique({ 
        where: { id },
        include: { 
            department: true, 
            requester: true, 
            items: true, 
            quotations: { include: { items: true, scores: { include: { itemScores: true } } } } 
        }
    });
    if (!requisition) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
    }
    
    console.log(`[PATCH /api/requisitions] Current req status: ${requisition.status}. Requested new status: ${newStatus}`);

    let dataToUpdate: any = {};
    let auditAction = 'UPDATE_REQUISITION';
    let auditDetails = `Updated requisition ${id}.`;
    
    // This is a high-level award approval (e.g., by a committee or manager)
    if (requisition.status.startsWith('Pending_') && newStatus === 'Approved') {
        const userRoles = (user.roles as any[]).map(r => r.name);
        console.log(`[PATCH /api/requisitions] Handling award approval by user with roles: ${userRoles.join(', ')}`);
        
        let isAuthorizedToApprove = false;
        if (requisition.currentApproverId === userId) {
            isAuthorizedToApprove = true;
        } else {
             const requiredRoleForStatus = requisition.status.replace('Pending_', '');
             if (userRoles.includes(requiredRoleForStatus) || userRoles.includes('Admin') || userRoles.includes('Procurement_Officer')) {
                isAuthorizedToApprove = true;
             }
        }

        if (!isAuthorizedToApprove) {
            console.error(`[PATCH /api/requisitions] User ${userId} not authorized for status ${requisition.status}.`);
            return NextResponse.json({ error: 'You are not authorized to approve this item at its current step.' }, { status: 403 });
        }
        
        console.log(`[PATCH /api/requisitions] Award approval transaction started for Req ID: ${id}`);
        const transactionResult = await prisma.$transaction(async (tx) => {
            const { nextStatus, nextApproverId, auditDetails: serviceAuditDetails } = await getNextApprovalStep(tx, requisition, user);
            console.log(`[PATCH /api/requisitions] Next step from service: Status=${nextStatus}, Approver=${nextApproverId}`);
            
            dataToUpdate.status = nextStatus;
            dataToUpdate.currentApproverId = nextApproverId;
            auditDetails = serviceAuditDetails;
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
                        decisionBody: requisition.status.replace(/_/g, ' '),
                        justification: minute.justification,
                        attendees: {
                            connect: minute.attendeeIds.map((id: string) => ({ id }))
                        }
                    }
                });
                auditDetails += ` Minute recorded.`;
                console.log(`[PATCH /api/requisitions] Minute recorded for Req ID: ${id}`);
            }

            // Use upsert to avoid unique constraint errors
            await tx.review.upsert({
                where: {
                    requisitionId_reviewerId: {
                        requisitionId: id,
                        reviewerId: userId,
                    }
                },
                update: {
                    decision: 'APPROVED',
                    comment: comment,
                },
                create: {
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

            return updatedRequisition;
        });
        console.log(`[PATCH /api/requisitions] Award approval transaction complete for Req ID: ${id}`);
        return NextResponse.json(transactionResult);

    // This is the initial departmental approval
    } else if (requisition.status === 'Pending_Approval') {
        console.log(`[PATCH /api/requisitions] Handling departmental approval for Req ID: ${id}`);
        if (requisition.currentApproverId !== userId && !user.roles.some(r => r.name === 'Admin')) {
            return NextResponse.json({ error: 'Unauthorized. You are not the current approver.' }, { status: 403 });
        }
        if (newStatus === 'Rejected') {
            dataToUpdate.status = 'Rejected';
            dataToUpdate.currentApprover = { disconnect: true };
            auditAction = 'REJECT_REQUISITION';
            auditDetails = `Requisition ${id} was rejected by department head with comment: "${comment}".`;
        } else { // Department head approves
             dataToUpdate.status = 'PreApproved'; 
             dataToUpdate.currentApprover = { disconnect: true };
             auditAction = 'PRE_APPROVE_REQUISITION';
             auditDetails = `Requisition ${id} was pre-approved by department head with comment: "${comment}". Ready for RFQ.`;
        }
        dataToUpdate.approver = { connect: { id: userId } };
        
        await prisma.review.create({
            data: {
                requisition: { connect: { id } },
                reviewer: { connect: { id: userId } },
                decision: newStatus === 'Rejected' ? 'REJECTED' : 'APPROVED',
                comment,
            }
        });

    // This handles a requester submitting a draft
    } else if ((requisition.status === 'Draft' || requisition.status === 'Rejected') && newStatus === 'Pending_Approval') {
        console.log(`[PATCH /api/requisitions] Handling draft submission for Req ID: ${id}`);
        const isRequester = requisition.requesterId === userId;
        if (!isRequester) return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
        const department = await prisma.department.findUnique({ where: { id: requisition.departmentId! } });
        if (department?.headId) {
            dataToUpdate.currentApprover = { connect: { id: department.headId } };
            dataToUpdate.status = 'Pending_Approval';
        } else {
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
        if ((error as any).code === 'P2002') {
             return NextResponse.json({ error: 'A unique constraint was violated. This usually means a user cannot review the same item twice.', details: (error as any).meta }, { status: 409 });
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

    const user = await prisma.user.findUnique({where: {id: userId}, include: {roles: true}});
    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const requisition = await prisma.purchaseRequisition.findUnique({ where: { id } });

    if (!requisition) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
    }

    const canDelete = (requisition.requesterId === userId) || ((user.roles as any[]).some(r => r.name === 'Procurement_Officer' || r.name === 'Admin'));

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
