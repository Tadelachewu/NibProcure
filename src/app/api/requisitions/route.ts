'use server';

import { NextResponse } from 'next/server';
import type { PurchaseRequisition, User, UserRole, Vendor, RequisitionStatus } from '@/lib/types';
import { prisma } from '@/lib/prisma';
import { decodeJwt, getActorFromToken } from '@/lib/auth';
import { headers } from 'next/headers';
import { sendEmail } from '@/services/email-service';
import { isPast } from 'date-fns';
import { getNextApprovalStep, getPreviousApprovalStep } from '@/services/award-service';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { promises as fs } from 'fs';
import path from 'path';


export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get('status');
  const forVendor = searchParams.get('forVendor');
  const approverId = searchParams.get('approverId');
  const forQuoting = searchParams.get('forQuoting');
  const forAwardReview = searchParams.get('forReview');

  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.split(' ')[1];
  let userPayload: (User & { roles: { name: UserRole }[] }) | null = null;
  if(token) {
    const decodedUser = await getActorFromToken(request);
    if(decodedUser) {
        userPayload = decodedUser as any;
    }
  }

  try {
    let whereClause: any = {};
    
    if (forAwardReview === 'true' && userPayload) {
        const userRoles = userPayload.roles as any[];
        const userId = userPayload.id;
        
        const orConditions: any[] = [
          // The user is the direct current approver for a pending item.
          { currentApproverId: userId, status: { startsWith: 'Pending_' } },
          // The status matches a committee role the user has.
          { status: { in: userRoles.map(r => `Pending_${r.name}`) } },
        ];
        
        const reviewableStatuses: RequisitionStatus[] = ['Award_Declined', 'Partially_Closed'];

        // If user is approver, they can also see declined/partially closed items
        if(userRoles.some(r => r.name !== 'Requester' && r.name !== 'Vendor')) {
            orConditions.push({ status: { in: reviewableStatuses } });
        }


        // If a user is an Admin or Procurement Officer, they should see all pending reviews
        if (userRoles.some(r => r.name === 'Admin' || r.name === 'Procurement_Officer')) {
            const allSystemRoles = await prisma.role.findMany({ select: { name: true } });
            const allPossiblePendingStatuses = allSystemRoles.map(r => `Pending_${r.name}`);
            orConditions.push({ status: { in: allPossiblePendingStatuses } });
            // Also show items ready for notification and those declined/partially closed
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

        const baseRfqLifecycleStatuses: RequisitionStatus[] = [
            'PreApproved', 'Accepting_Quotes', 'Scoring_In_Progress', 
            'Scoring_Complete', 'Award_Declined', 'Awarded', 'PostApproved',
            'PO_Created', 'Fulfilled', 'Closed', 'Partially_Closed'
        ];
        
        const rfqLifecycleStatuses = [...baseRfqLifecycleStatuses, ...allPendingStatuses];

        const userRoles = userPayload?.roles.map(r => (r as any).name) || [];

        const whereConditions: any = {
            status: { in: rfqLifecycleStatuses },
        };

        if (userRoles.includes('Committee_Member')) {
            whereConditions.OR = [
                { status: 'PreApproved' }, // Always show PreApproved to committee members
                { financialCommitteeMembers: { some: { id: userPayload?.id } } },
                { technicalCommitteeMembers: { some: { id: userPayload?.id } } },
            ];
        }

        whereClause = whereConditions;
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
      
      if (userPayload && userPayload.roles.some(r => (r as any).name === 'Requester') && !statusParam && !approverId) {
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
            attendees: true,
            signatures: true,
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

export async function PATCH(
  request: Request,
) {
  try {
    const body = await request.json();
    const { id, status, userId, comment } = body;
    
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
            quotations: { include: { items: true, scores: { include: { itemScores: true } } } },
            minutes: {
              orderBy: { createdAt: 'desc' },
              take: 1
            }
        }
    });
    if (!requisition) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
    }
    
    let dataToUpdate: any = {};
    let auditAction = 'UPDATE_REQUISITION';
    let auditDetails = `Updated requisition ${id}.`;
    let updatedRequisition;
    
    // This is the logic path for updating a DRAFT or REJECTED requisition
    if ((requisition.status === 'Draft' || requisition.status === 'Rejected') && body.title) {
        const totalPrice = body.items.reduce((acc: number, item: any) => {
            const price = item.unitPrice || 0;
            const quantity = item.quantity || 0;
            return acc + (price * quantity);
        }, 0);

        dataToUpdate = {
            title: body.title,
            justification: body.justification,
            urgency: body.urgency,
            department: { connect: { name: body.department } },
            totalPrice: totalPrice,
            status: status ? status.replace(/ /g, '_') : requisition.status,
            approver: { disconnect: true },
            approverComment: null,
            items: {
                deleteMany: {},
                create: body.items.map((item: any) => ({
                    name: item.name,
                    quantity: Number(item.quantity) || 0,
                    unitPrice: Number(item.unitPrice) || 0,
                    description: item.description || ''
                })),
            },
            customQuestions: {
                deleteMany: {},
                create: body.customQuestions?.map((q: any) => ({
                    questionText: q.questionText,
                    questionType: q.questionType.replace(/-/g, '_'),
                    isRequired: q.isRequired,
                    options: q.options || [],
                })),
            },
        };
        if (body.evaluationCriteria) {
             const oldCriteria = await prisma.evaluationCriteria.findUnique({ where: { requisitionId: id } });
             if (oldCriteria) {
                 await prisma.financialCriterion.deleteMany({ where: { evaluationCriteriaId: oldCriteria.id } });
                 await prisma.technicalCriterion.deleteMany({ where: { evaluationCriteriaId: oldCriteria.id } });
                 await prisma.evaluationCriteria.delete({ where: { id: oldCriteria.id } });
             }

             dataToUpdate.evaluationCriteria = {
                create: {
                    financialWeight: body.evaluationCriteria.financialWeight,
                    technicalWeight: body.evaluationCriteria.technicalWeight,
                    financialCriteria: { create: body.evaluationCriteria.financialCriteria.map((c:any) => ({ name: c.name, weight: Number(c.weight) })) },
                    technicalCriteria: { create: body.evaluationCriteria.technicalCriteria.map((c:any) => ({ name: c.name, weight: Number(c.weight) })) }
                }
            };
        }
        
        if (newStatus === 'Pending_Approval') {
            const department = await prisma.department.findUnique({ where: { id: requisition.departmentId! } });
            if (department?.headId) { 
                dataToUpdate.currentApprover = { connect: { id: department.headId } };
                dataToUpdate.status = 'Pending_Approval';
            } else {
                dataToUpdate.status = 'PreApproved';
                dataToUpdate.currentApprover = { disconnect: true };
            }
            auditAction = 'SUBMIT_FOR_APPROVAL';
            auditDetails = `Requisition ${id} ("${body.title}") was edited and submitted for approval.`;
        }

    } 
    // This is the logic path for initial DEPARTMENTAL approval
    else if (newStatus === 'PreApproved' && requisition.status === 'Pending_Approval') {
        dataToUpdate.status = 'PreApproved';
        dataToUpdate.approver = { connect: { id: userId } };
        dataToUpdate.approverComment = comment;
        dataToUpdate.currentApproverId = null;
        auditAction = 'APPROVE_REQUISITION';
        auditDetails = `Departmental approval for requisition ${id} granted by ${user.name}. Ready for RFQ.`;
    }
    // This is the logic path for initial DEPARTMENTAL rejection
    else if (newStatus === 'Rejected' && requisition.status === 'Pending_Approval') {
        dataToUpdate.status = 'Rejected';
        dataToUpdate.approver = { connect: { id: userId } };
        dataToUpdate.approverComment = comment;
        dataToUpdate.currentApprover = { disconnect: true };
        auditAction = 'REJECT_REQUISITION';
        auditDetails = `Requisition ${id} was rejected with comment: "${comment}".`;
    }
    // This is the logic path for AWARD reviews (committee, managerial, etc.)
    else if (requisition.status.startsWith('Pending_') || requisition.status === 'Award_Declined' || requisition.status === 'Partially_Closed') {
        
        const isAuthorizedToAct = (requisition.currentApproverId === userId) || 
                                  (user.roles as any[]).some(r => requisition.status === `Pending_${r.name}`) ||
                                  (user.roles as any[]).some(r => r.name === 'Admin' || r.name === 'Procurement_Officer');

        if (!isAuthorizedToAct) {
            return NextResponse.json({ error: 'You are not authorized to act on this item at its current step.' }, { status: 403 });
        }
        
        if (newStatus === 'Rejected') {
            const { previousStatus, previousApproverId, auditDetails: serviceAuditDetails } = await getPreviousApprovalStep(prisma, requisition, user, comment);
            dataToUpdate.status = previousStatus;
            dataToUpdate.currentApproverId = previousApproverId;
            dataToUpdate.approverComment = comment; 
            auditDetails = serviceAuditDetails;
            auditAction = 'REJECT_AWARD_STEP';
        } else { // Approved
            const { nextStatus, nextApproverId, auditDetails: serviceAuditDetails } = await getNextApprovalStep(prisma, requisition, user);
            dataToUpdate.status = nextStatus;
            dataToUpdate.currentApproverId = nextApproverId;
            dataToUpdate.approverComment = comment;
            auditDetails = serviceAuditDetails;
            auditAction = 'APPROVE_AWARD_STEP';
        }

    } else {
        return NextResponse.json({ error: 'Invalid operation for current status.' }, { status: 400 });
    }
    
    updatedRequisition = await prisma.purchaseRequisition.update({
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
    const actor = await prisma.user.findUnique({
      where: { id: body.requesterId },
      include: { roles: true },
    });
    if (!actor) {
      return NextResponse.json({ error: 'Requester user not found' }, { status: 404 });
    }
    const creatorSetting = await prisma.setting.findUnique({ where: { key: 'requisitionCreatorSetting' } });
    if (creatorSetting && typeof creatorSetting.value === 'object' && creatorSetting.value && 'type' in creatorSetting.value) {
      const setting = creatorSetting.value as { type: string, allowedRoles?: string[] };
      if (setting.type === 'specific_roles') {
        const userRoles = actor.roles.map(r => r.name);
        const canCreate = userRoles.some(role => setting.allowedRoles?.includes(role));
        if (!canCreate) {
          return NextResponse.json({ error: 'Unauthorized: You do not have permission to create requisitions.' }, { status: 403 });
        }
      }
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
    const transactionResult = await prisma.$transaction(async (tx) => {
      const newRequisition = await tx.purchaseRequisition.create({
        data: {
          requester: { connect: { id: actor.id } },
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
          evaluationCriteria: body.evaluationCriteria ? {
            create: {
              financialWeight: body.evaluationCriteria.financialWeight,
              technicalWeight: body.evaluationCriteria.technicalWeight,
              financialCriteria: {
                create: body.evaluationCriteria.financialCriteria.map((c: any) => ({ name: c.name, weight: Number(c.weight) }))
              },
              technicalCriteria: {
                create: body.evaluationCriteria.technicalCriteria.map((c: any) => ({ name: c.name, weight: Number(c.weight) }))
              }
            }
          } : undefined,
        },
      });
      const finalRequisition = await tx.purchaseRequisition.update({
        where: { id: newRequisition.id },
        data: { transactionId: newRequisition.id },
        include: { items: true, customQuestions: true, evaluationCriteria: true }
      });
      await tx.auditLog.create({
        data: {
          transactionId: finalRequisition.id,
          user: { connect: { id: actor.id } },
          timestamp: new Date(),
          action: 'CREATE_REQUISITION',
          entity: 'Requisition',
          entityId: finalRequisition.id,
          details: `Created new requisition: "${finalRequisition.title}".`,
        }
      });
      return finalRequisition;
    });
    return NextResponse.json(transactionResult, { status: 201 });
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
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
