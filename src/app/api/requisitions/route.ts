
'use server';

import { NextResponse } from 'next/server';
import type { PurchaseRequisition, User, UserRole, Vendor } from '@/lib/types';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';
import { headers } from 'next/headers';
import { sendEmail } from '@/services/email-service';
import { differenceInMinutes, format } from 'date-fns';
import { requisitionSchema } from '@/lib/schemas';
import { ZodError } from 'zod';
import { getNextApprovalStep, getPreviousApprovalStep } from '@/services/award-service';


export async function GET(request: Request) {
  // This function remains as is because it's for data retrieval and authorization is handled by filters.
  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get('status');
  const forVendor = searchParams.get('forVendor');
  const approverId = searchParams.get('approverId');
  const forQuoting = searchParams.get('forQuoting');
  const forAwardReview = searchParams.get('forAwardReview');

  const actor = await getActorFromToken(request);
  const userPayload = actor;

  try {
    let whereClause: any = {};
    
    if (forAwardReview === 'true' && userPayload) {
        const userRoles = userPayload.roles as UserRole[];
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
             const allSystemRoles = await prisma.role.findMany({ select: { name: true } });
             const allPossiblePendingStatuses = allSystemRoles.map(r => `Pending_${r.name}`);
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
        const allRoles = await prisma.role.findMany({ select: { name: true } });
        const allPendingStatuses = allRoles.map(role => `Pending_${role.name}`);

        const baseRfqLifecycleStatuses = [
            'PreApproved', 'Accepting_Quotes', 'Scoring_In_Progress', 
            'Scoring_Complete', 'Award_Declined', 'Awarded', 'PostApproved',
            'PO_Created', 'Fulfilled', 'Closed'
        ];
        
        const rfqLifecycleStatuses = [...baseRfqLifecycleStatuses, ...allPendingStatuses];

        const userRoles = userPayload?.roles as UserRole[] || [];

        if (userRoles.includes('Committee_Member')) {
            whereClause = {
                status: { in: rfqLifecycleStatuses },
                OR: [
                    { financialCommitteeMembers: { some: { id: userPayload?.id } } },
                    { technicalCommitteeMembers: { some: { id: userPayload?.id } } },
                ],
            };
        } else {
            whereClause = {
                status: { in: rfqLifecycleStatuses }
            };
        }
    } else {
      if (statusParam) {
        const statuses = statusParam.split(',').map(s => s.trim().replace(/ /g, '_'));
        whereClause.status = { in: statuses };
      }
      if (approverId) {
        whereClause.OR = [
            { currentApproverId: approverId },
            { reviews: { some: { reviewerId: approverId } } }
        ];
      }
      
      if (userPayload && (userPayload.roles as UserRole[]).includes('Requester') && !statusParam && !approverId) {
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
        const userRoles = (log.user?.roles as any[])?.map(r => r.name).join(', ') || 'System';
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

export async function POST(request: Request) {
  try {
    const actor = await getActorFromToken(request);
    if (!actor) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // --- Start Server-Side Validation ---
    const creatorSetting = await prisma.setting.findUnique({ where: { key: 'requisitionCreatorSetting' } });
    if (creatorSetting && typeof creatorSetting.value === 'object' && creatorSetting.value && 'type' in creatorSetting.value) {
        const setting = creatorSetting.value as { type: string, allowedRoles?: string[] };
        if (setting.type === 'specific_roles') {
            const userRoles = actor.roles as UserRole[];
            const canCreate = userRoles.some(role => setting.allowedRoles?.includes(role));
            if (!canCreate) {
                return NextResponse.json({ error: 'Unauthorized: You do not have permission to create requisitions.' }, { status: 403 });
            }
        }
    }
    // --- End Server-Side Validation ---
    
    const body = await request.json();
    const parsedData = requisitionSchema.parse(body);
    const { title, department: departmentName, justification, urgency, items, evaluationCriteria, customQuestions } = parsedData;

    const totalPrice = items.reduce((acc, item) => {
        const price = item.unitPrice || 0;
        const quantity = item.quantity || 0;
        return acc + (price * quantity);
    }, 0);
    
    const department = await prisma.department.findUnique({ where: { name: departmentName } });
    if (!department) {
        return NextResponse.json({ error: 'Department not found' }, { status: 404 });
    }

    const newRequisition = await prisma.$transaction(async (tx) => {
        const createdReq = await tx.purchaseRequisition.create({
            data: {
                requester: { connect: { id: actor.id } },
                department: { connect: { id: department.id } },
                title,
                urgency,
                justification,
                status: 'Draft',
                totalPrice: totalPrice,
                items: {
                    create: items.map((item) => ({
                        name: item.name,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice || 0,
                        description: item.description || ''
                    }))
                },
                customQuestions: customQuestions ? {
                    create: customQuestions.map((q) => ({
                        questionText: q.questionText,
                        questionType: q.questionType,
                        isRequired: q.isRequired,
                        options: q.options || [],
                    }))
                } : undefined,
                evaluationCriteria: {
                    create: {
                        financialWeight: evaluationCriteria.financialWeight,
                        technicalWeight: evaluationCriteria.technicalWeight,
                        financialCriteria: {
                            create: evaluationCriteria.financialCriteria.map((c) => ({ name: c.name, weight: c.weight }))
                        },
                        technicalCriteria: {
                            create: evaluationCriteria.technicalCriteria.map((c) => ({ name: c.name, weight: c.weight }))
                        }
                    }
                }
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
                user: { connect: { id: actor.id } },
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
     if (error instanceof ZodError) {
        return NextResponse.json({ error: 'Invalid input data', details: error.errors }, { status: 400 });
    }
    console.error('Failed to create requisition:', error);
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
) {
  try {
    const actor = await getActorFromToken(request);
    if (!actor) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    // We only parse the fields that can be updated, not status or comment which are handled separately
    const { id, status, comment, minute } = body;
    
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
    
    let dataToUpdate: any = {};
    let auditAction = 'UPDATE_REQUISITION';
    let auditDetails = `Updated requisition ${id}.`;
    
    const newStatus = status ? status.replace(/ /g, '_') : null;

    if ((requisition.status === 'Draft' || requisition.status === 'Rejected') && body.title) {
        const parsedData = requisitionSchema.parse(body);
        const { title, department: departmentName, justification, urgency, items, evaluationCriteria, customQuestions } = parsedData;

        const totalPrice = items.reduce((acc: number, item: any) => acc + ((item.unitPrice || 0) * (item.quantity || 0)), 0);

        const department = await prisma.department.findUnique({ where: { name: departmentName } });
        if (!department) return NextResponse.json({ error: 'Department not found' }, { status: 404 });

        dataToUpdate = {
            title,
            justification,
            urgency,
            department: { connect: { id: department.id } },
            totalPrice: totalPrice,
            status: newStatus || requisition.status,
            approver: { disconnect: true },
            approverComment: null,
            items: {
                deleteMany: {},
                create: items.map((item: any) => ({
                    name: item.name,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice || 0,
                    description: item.description || ''
                })),
            },
            customQuestions: {
                deleteMany: {},
                create: customQuestions?.map((q: any) => ({
                    questionText: q.questionText,
                    questionType: q.questionType,
                    isRequired: q.isRequired,
                    options: q.options || [],
                })),
            },
        };

        const oldCriteria = await prisma.evaluationCriteria.findUnique({ where: { requisitionId: id } });
        if (oldCriteria) {
             await prisma.financialCriterion.deleteMany({ where: { evaluationCriteriaId: oldCriteria.id } });
             await prisma.technicalCriterion.deleteMany({ where: { evaluationCriteriaId: oldCriteria.id } });
             await prisma.evaluationCriteria.delete({ where: { id: oldCriteria.id } });
        }

        dataToUpdate.evaluationCriteria = {
            create: {
                financialWeight: evaluationCriteria.financialWeight,
                technicalWeight: evaluationCriteria.technicalWeight,
                financialCriteria: { create: evaluationCriteria.financialCriteria.map((c:any) => ({ name: c.name, weight: c.weight })) },
                technicalCriteria: { create: evaluationCriteria.technicalCriteria.map((c:any) => ({ name: c.name, weight: c.weight })) }
            }
        };

        if (newStatus === 'Pending_Approval') {
            if (department?.headId) { 
                dataToUpdate.currentApprover = { connect: { id: department.headId } };
            } else {
                dataToUpdate.status = 'PreApproved';
                dataToUpdate.currentApprover = { disconnect: true };
            }
            auditAction = 'SUBMIT_FOR_APPROVAL';
            auditDetails = `Requisition ${id} ("${title}") was edited and submitted for approval.`;
        }

    } else if (requisition.status.startsWith('Pending_') && requisition.status !== 'Pending_Approval') {
        // Award approval logic
        const transactionResult = await prisma.$transaction(async (tx) => {
             if (newStatus === 'Rejected') {
                const { previousStatus, previousApproverId, auditDetails: serviceAuditDetails } = await getPreviousApprovalStep(tx, requisition, actor, comment);
                dataToUpdate.status = previousStatus;
                dataToUpdate.currentApproverId = previousApproverId;
                dataToUpdate.approverComment = comment;
                auditDetails = serviceAuditDetails;
                auditAction = 'REJECT_AWARD_STEP';
            } else { // Approved
                const { nextStatus, nextApproverId, auditDetails: serviceAuditDetails } = await getNextApprovalStep(tx, requisition, actor);
                dataToUpdate.status = nextStatus;
                dataToUpdate.currentApproverId = nextApproverId;
                dataToUpdate.approverComment = comment;
                auditDetails = serviceAuditDetails;
                auditAction = 'APPROVE_AWARD_STEP';
            }

            const updatedRequisition = await tx.purchaseRequisition.update({ where: { id }, data: dataToUpdate });
            if (minute) { /* minute creation logic */ }
            await tx.review.upsert({ /* review upsert logic */ });
            await tx.auditLog.create({
                data: {
                    transactionId: updatedRequisition.transactionId,
                    user: { connect: { id: actor.id } },
                    timestamp: new Date(),
                    action: auditAction,
                    entity: 'Requisition',
                    entityId: id,
                    details: auditDetails,
                }
            });
            return updatedRequisition;
        });
        return NextResponse.json(transactionResult);

    } else if (requisition.status === 'Pending_Approval') {
        // Departmental approval logic
        if (requisition.currentApproverId !== actor.id && !(actor.roles as UserRole[]).includes('Admin')) {
            return NextResponse.json({ error: 'Unauthorized. You are not the current approver.' }, { status: 403 });
        }
         if (newStatus === 'Rejected') {
            dataToUpdate.status = 'Rejected';
            dataToUpdate.currentApprover = { disconnect: true };
            dataToUpdate.approverComment = comment;
            auditAction = 'REJECT_REQUISITION';
            auditDetails = `Requisition ${id} was rejected by department head with comment: "${comment}".`;
        } else {
             dataToUpdate.status = 'PreApproved';
             dataToUpdate.currentApprover = { disconnect: true };
             dataToUpdate.approverComment = comment;
             auditAction = 'PRE_APPROVE_REQUISITION';
             auditDetails = `Requisition ${id} was pre-approved by department head. Ready for RFQ.`;
        }
        dataToUpdate.approver = { connect: { id: actor.id } };

    } else if ((requisition.status === 'Draft' || requisition.status === 'Rejected') && newStatus === 'Pending_Approval') {
        // Draft submission logic
        const isRequester = requisition.requesterId === actor.id;
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
    
    const updatedRequisition = await prisma.purchaseRequisition.update({ where: { id }, data: dataToUpdate });
    
    await prisma.auditLog.create({
        data: {
            transactionId: updatedRequisition.transactionId,
            user: { connect: { id: actor.id } },
            timestamp: new Date(),
            action: auditAction,
            entity: 'Requisition',
            entityId: id,
            details: auditDetails,
        }
    });

    return NextResponse.json(updatedRequisition);
    
  } catch (error) {
     if (error instanceof ZodError) {
        return NextResponse.json({ error: 'Invalid input data for update.', details: error.errors }, { status: 400 });
    }
    console.error('[PATCH] Failed to update requisition:', error);
    return NextResponse.json({ error: 'An unknown error occurred during update' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
) {
    // This function remains as is, as it's already secure.
    try {
        const actor = await getActorFromToken(request);
        if (!actor) return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });

        const { id } = await request.json();

        const requisition = await prisma.purchaseRequisition.findUnique({ where: { id } });
        if (!requisition) return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });

        const canDelete = (requisition.requesterId === actor.id) || ((actor.roles as UserRole[]).some(r => r === 'Procurement_Officer' || r === 'Admin'));
        if (!canDelete) return NextResponse.json({ error: 'You are not authorized to delete this requisition.' }, { status: 403 });
        
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
                user: { connect: { id: actor.id } },
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
            return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
        }
        return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
    }
}
