
'use server';

import { NextResponse } from 'next/server';
import type { PurchaseRequisition, User, UserRole, Vendor } from '@/lib/types';
import { prisma } from '@/lib/prisma';
import { getUserByToken } from '@/lib/auth';
import { headers } from 'next/headers';
import { sendEmail } from '@/services/email-service';
import { differenceInMinutes, format } from 'date-fns';

export const dynamic = 'force-dynamic';

async function findApproverId(role: UserRole): Promise<string | null> {
    const user = await prisma.user.findFirst({
        where: { role: role.replace(/ /g, '_') }
    });
    return user?.id || null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get('status');
  const forVendor = searchParams.get('forVendor');
  const approverId = searchParams.get('approverId');
  const forReview = searchParams.get('forReview');
  const forQuoting = searchParams.get('forQuoting');


  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.split(' ')[1];
  let userPayload: { user: User, role: UserRole } | null = null;
  if(token) {
    userPayload = await getUserByToken(token);
  }

  try {
    let whereClause: any = {};
    
    if (forReview === 'true' && userPayload) {
        const userRole = userPayload.role.replace(/ /g, '_') as UserRole;
        
        const isHierarchicalApprover = [
            'Manager_Procurement_Division',
            'Director_Supply_Chain_and_Property_Management',
            'VP_Resources_and_Facilities',
            'President'
        ].includes(userRole);

        if (userRole === 'Committee_A_Member') {
             whereClause.status = 'Pending_Committee_A_Member';
        } else if (userRole === 'Committee_B_Member') {
            whereClause.status = 'Pending_Committee_B_Member';
        } else if (isHierarchicalApprover) {
            whereClause.currentApproverId = userPayload.user.id;
        } else if (userRole === 'Admin' || userRole === 'Procurement_Officer') {
             whereClause.status = { in: [
                'Pending_Committee_A_Member',
                'Pending_Committee_B_Member',
                'Pending_Managerial_Review',
                'Pending_Director_Approval',
                'Pending_VP_Approval',
                'Pending_President_Approval',
                'Pending_Managerial_Approval'
             ]};
        } else {
             return NextResponse.json([]);
        }

    } else if (statusParam) {
        const statuses = statusParam.split(',').map(s => s.trim().replace(/ /g, '_'));
        whereClause.status = { in: statuses };
    }
    
     if (forQuoting === 'true' && userPayload) {
        const isProcurementStaff = userPayload.role === 'Procurement_Officer' || userPayload.role === 'Admin';
        
        if (userPayload.role === 'Committee_Member') {
            const assignedReqs = await prisma.committeeAssignment.findMany({
                where: { userId: userPayload.user.id },
                select: { requisitionId: true }
            });
            whereClause.id = { in: assignedReqs.map(a => a.requisitionId) };
             whereClause.status = 'RFQ_In_Progress'
        } else if (isProcurementStaff) {
             whereClause.OR = [
                // Requisitions approved and waiting for vendor notification
                { status: 'Approved', quotations: { some: { status: { in: ['Awarded', 'Partially_Awarded'] } } } },
                // Requisitions approved and waiting for RFQ to be sent
                { status: 'Approved', currentApproverId: null, NOT: { quotations: { some: { status: { in: ['Awarded', 'Partially_Awarded'] } } } } },
                // Requisitions currently accepting quotes
                { status: 'RFQ_In_Progress' },
                // Requisitions in any review/approval state
                { status: { startsWith: 'Pending_' } }
            ]
        } else {
            return NextResponse.json([]); // Other roles don't see this queue
        }
    }


    if (forVendor === 'true') {
        if (!userPayload || !userPayload.user.vendorId) {
             return NextResponse.json({ error: 'Unauthorized: No valid vendor found for this user.' }, { status: 403 });
        }
        
        whereClause.status = 'RFQ_In_Progress';
        whereClause.OR = [
          { allowedVendorIds: { isEmpty: true } }, // 'all' vendors
          { allowedVendorIds: { has: userPayload.user.vendorId } },
        ];
    }
    
    if (approverId) {
        whereClause.currentApproverId = approverId;
    }


    const requisitions = await prisma.purchaseRequisition.findMany({
      where: whereClause,
      include: {
        items: true,
        customQuestions: true,
        department: true,
        requester: true,
        evaluationCriteria: {
            include: {
                financialCriteria: true,
                technicalCriteria: true,
            }
        },
        financialCommitteeMembers: { select: { id: true } },
        technicalCommitteeMembers: { select: { id: true } },
        committeeAssignments: true,
        quotations: {
            include: {
                vendor: true
            }
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const formattedRequisitions = requisitions.map(req => ({
        ...req,
        status: req.status.replace(/_/g, ' '),
        department: req.department?.name || 'N/A',
        requesterName: req.requester.name,
        financialCommitteeMemberIds: req.financialCommitteeMembers.map(m => m.id),
        technicalCommitteeMemberIds: req.technicalCommitteeMembers.map(m => m.id),
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
    const body = await request.json();
    
    const user = await prisma.user.findFirst({where: {name: body.requesterName}});
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


export async function PATCH(
  request: Request,
) {
  try {
    const body = await request.json();
    const { id, status, userId, comment, rfqSenderId } = body;
    const updateData = body;


    const user = await prisma.user.findUnique({where: {id: userId}});
    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const requisition = await prisma.purchaseRequisition.findUnique({ 
        where: { id },
        include: { department: true }
    });
    if (!requisition) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
    }

    let dataToUpdate: any = {};
    let auditAction = 'UPDATE_REQUISITION';
    let auditDetails = `Updated requisition ${id}.`;
    
    if ((requisition.status === 'Draft' || requisition.status === 'Rejected') && updateData.title) {
        const totalPrice = updateData.items.reduce((acc: number, item: any) => {
            const price = item.unitPrice || 0;
            const quantity = item.quantity || 0;
            return acc + (price * quantity);
        }, 0);

        dataToUpdate = {
            title: updateData.title,
            justification: updateData.justification,
            urgency: updateData.urgency,
            department: { connect: { name: updateData.department } },
            totalPrice: totalPrice,
            status: status ? status.replace(/ /g, '_') : requisition.status,
            approver: { disconnect: true },
            approverComment: null,
            items: {
                deleteMany: {},
                create: updateData.items.map((item: any) => ({
                    name: item.name,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice || 0,
                    description: item.description || ''
                })),
            },
            customQuestions: {
                deleteMany: {},
                create: updateData.customQuestions?.map((q: any) => ({
                    questionText: q.questionText,
                    questionType: q.questionType.replace(/-/g, '_'),
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
                financialWeight: updateData.evaluationCriteria.financialWeight,
                technicalWeight: updateData.evaluationCriteria.technicalWeight,
                financialCriteria: { create: updateData.evaluationCriteria.financialCriteria.map((c:any) => ({ name: c.name, weight: c.weight })) },
                technicalCriteria: { create: updateData.evaluationCriteria.technicalCriteria.map((c:any) => ({ name: c.name, weight: c.weight })) }
            }
        };
        
        if (status === 'Pending Approval') {
            const department = await prisma.department.findUnique({ where: { id: requisition.departmentId! } });
            if (department?.headId) { dataToUpdate.currentApprover = { connect: { id: department.headId } }; }
            auditAction = 'SUBMIT_FOR_APPROVAL';
            auditDetails = `Requisition ${id} ("${updateData.title}") was edited and submitted for approval.`;
        }

    } else if (status) { // This handles normal status changes (approve, reject, submit)
        dataToUpdate.status = status.replace(/ /g, '_');
        dataToUpdate.approver = { connect: { id: userId } };
        dataToUpdate.approverComment = comment;

        if (status === 'Approved') {
            auditAction = 'APPROVE_REQUISITION';
            auditDetails = `Requisition ${id} was approved by ${user.role.replace(/_/g, ' ')}.`;
            if (comment) auditDetails += ` Comment: "${comment}".`;

            let nextApproverId: string | null = null;
            let nextStatus: string = 'Approved'; // Default to final approved state
            
            // This is a Pre-Award, initial departmental approval
            if (requisition.status === 'Pending_Approval') {
                nextStatus = 'Approved';
                nextApproverId = null; // No next approver, it now waits for RFQ
                auditDetails += ' Initial departmental approval complete. Ready for RFQ.'
            } 
            // This is a Post-Award approval
            else {
                const approvalMatrix = await prisma.approvalThreshold.findMany({ include: { steps: { orderBy: { order: 'asc' } } }, orderBy: { min: 'asc' }});
                const totalValue = requisition.totalPrice;
                
                const relevantTier = approvalMatrix.find(tier => totalValue >= tier.min && (tier.max === null || totalValue <= tier.max));

                if (relevantTier) {
                    const currentStepIndex = relevantTier.steps.findIndex(step => requisition.status === `Pending_${step.role}`);
                    
                    if (currentStepIndex !== -1 && currentStepIndex < relevantTier.steps.length - 1) {
                        const nextStep = relevantTier.steps[currentStepIndex + 1];
                        nextStatus = `Pending_${nextStep.role}`;
                        if (!nextStep.role.includes('Committee')) {
                            nextApproverId = await findApproverId(nextStep.role as UserRole);
                        }
                        auditDetails += ` Advanced to next step in "${relevantTier.name}" tier: ${nextStatus.replace(/_/g, ' ')}.`;
                    } else {
                        nextStatus = 'Approved';
                        nextApproverId = null;
                        auditDetails += ` Final approval in "${relevantTier.name}" tier complete. Ready for vendor notification.`
                    }
                } else {
                    // Fallback if no tier is found (shouldn't happen with proper config)
                     nextStatus = 'Approved';
                     nextApproverId = null;
                     auditDetails += ' No specific award tier found. Approved for notification.'
                }
            }


            dataToUpdate.status = nextStatus.replace(/ /g, '_');
            if(nextApproverId) {
                 dataToUpdate.currentApprover = { connect: { id: nextApproverId } };
            } else {
                dataToUpdate.currentApprover = { disconnect: true };
            }

        } else if (status === 'Rejected') {
            dataToUpdate.currentApprover = { disconnect: true };
            auditAction = 'REJECT_REQUISITION';
            auditDetails = `Requisition ${id} was rejected with comment: "${comment}".`;
        } else if (status === 'Pending Approval') {
            auditAction = 'SUBMIT_FOR_APPROVAL';
            auditDetails = `Draft requisition ${id} was submitted for approval.`;
            const department = await prisma.department.findUnique({ where: { id: requisition.departmentId! } });
            if (department?.headId) { 
                dataToUpdate.currentApprover = { connect: { id: department.headId } };
            } else {
                dataToUpdate.currentApprover = { disconnect: true };
            }
        }

    } else {
        return NextResponse.json({ error: 'No valid update action specified.' }, { status: 400 });
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
    console.error('Failed to update requisition:', error);
    if (error instanceof Error) {
        const prismaError = error as any;
        if (prismaError.code === 'P2025' && prismaError.meta?.cause?.includes('connect')) {
             return NextResponse.json({ error: 'Failed to process request: A user or department to connect could not be found.', details: error.message }, { status: 400 });
        }
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 400 });
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

    if (requisition.requesterId !== userId) {
      return NextResponse.json({ error: 'You are not authorized to delete this requisition.' }, { status: 403 });
    }

    if (requisition.status !== 'Draft' && requisition.status !== 'Pending_Approval') {
      return NextResponse.json({ error: `Cannot delete a requisition with status "${requisition.status}".` }, { status: 403 });
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
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
