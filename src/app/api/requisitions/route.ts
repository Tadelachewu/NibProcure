
'use server';

import { NextResponse } from 'next/server';
import type { PurchaseRequisition, User, UserRole, Vendor } from '@/lib/types';
import { prisma } from '@/lib/prisma';
import { getUserByToken } from '@/lib/auth';
import { headers } from 'next/headers';
import { sendEmail } from '@/services/email-service';
import { differenceInMinutes, format } from 'date-fns';

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
        const userId = userPayload.user.id;

        // Define the specific post-award review statuses.
        const reviewStatuses = [
          'Pending_Committee_A_Recommendation',
          'Pending_Committee_B_Review',
          'Pending_Managerial_Review',
          'Pending_Director_Approval',
          'Pending_VP_Approval',
          'Pending_President_Approval',
          'Pending_Managerial_Approval'
        ];

        if (userRole === 'Committee_A_Member') {
          whereClause = { status: 'Pending_Committee_A_Recommendation' };
        } else if (userRole === 'Committee_B_Member') {
          whereClause = { status: 'Pending_Committee_B_Review' };
        } else if (
          userRole === 'Manager_Procurement_Division' || 
          userRole === 'Director_Supply_Chain_and_Property_Management' || 
          userRole === 'VP_Resources_and_Facilities' || 
          userRole === 'President'
        ) {
          // Hierarchical reviewers should only see items explicitly assigned to them
          // AND the status must be one of the post-award review statuses.
          whereClause = { 
            currentApproverId: userId,
            status: {
              in: reviewStatuses
            }
          };
        } else if (userRole === 'Admin' || userRole === 'Procurement_Officer') {
           // Admins/Officers can see all items currently in any review stage
           whereClause = { 
             status: { 
               in: reviewStatuses
             }
          };
        } else {
          // If user doesn't have a specific review role, return empty
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
             // If user is a requester, only show their own requisitions in this queue
            if (userPayload.role === 'Requester') {
                whereClause.requesterId = userPayload.user.id;
                whereClause.OR = [
                    { status: 'Approved' },
                    { status: 'RFQ_In_Progress' },
                    { status: { startsWith: 'Pending_' } }
                ]
            } else {
                return NextResponse.json([]); // Other roles don't see this queue by default
            }
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
        // Only get items pending departmental approval for this approver.
        whereClause.status = 'Pending_Approval';
    }
    
    // If a regular user is fetching, only show their own unless other flags are set
    if (userPayload && userPayload.role === 'Requester' && !forQuoting && !statusParam && !approverId && !forReview) {
      whereClause.requesterId = userPayload.user.id;
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
                vendor: true,
            },
        },
        minutes: {
            include: {
                author: true,
                attendees: true,
            }
        }
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


export async function PATCH(
  request: Request,
) {
  try {
    const body = await request.json();
    const { id, status, userId, comment, minute } = body;
    
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

    // WORKFLOW 1: SUBMITTING A DRAFT OR RE-SUBMITTING A REJECTED REQ
    if ((requisition.status === 'Draft' || requisition.status === 'Rejected') && status === 'Pending_Approval') {
        const isRequester = requisition.requesterId === userId;
        const isProcurementStaff = user.role === 'Procurement_Officer' || user.role === 'Admin';
        
        if (!isRequester && !isProcurementStaff) {
            return NextResponse.json({ error: 'You are not authorized to submit this requisition for approval.' }, { status: 403 });
        }

        const department = await prisma.department.findUnique({ where: { id: requisition.departmentId } });
        if (department?.headId) {
            dataToUpdate.currentApproverId = department.headId;
            dataToUpdate.status = 'Pending_Approval';
            auditAction = 'SUBMIT_FOR_APPROVAL';
            auditDetails = `Requisition ${id} submitted for departmental approval.`;
        } else {
            // Auto-approve if no department head is set
            dataToUpdate.status = 'Approved';
            dataToUpdate.currentApproverId = null;
            auditAction = 'SUBMIT_FOR_APPROVAL';
            auditDetails = `Requisition ${id} submitted and auto-approved as no department head is set.`;
        }
        
    // WORKFLOW 2: DEPARTMENTAL HEAD APPROVAL/REJECTION
    } else if (requisition.status === 'Pending_Approval') {
        if (requisition.currentApproverId !== userId) {
            return NextResponse.json({ error: 'You are not the designated approver for this requisition.' }, { status: 403 });
        }
        if (status === 'Approved') {
            dataToUpdate.status = 'Approved';
            dataToUpdate.currentApproverId = null; // Clean hand-off to procurement
            auditAction = 'APPROVE_REQUISITION';
            auditDetails = `Requisition ${id} was approved by department head. Comment: "${comment}".`;
        } else if (status === 'Rejected') {
            dataToUpdate.status = 'Rejected';
            dataToUpdate.currentApproverId = null;
            auditAction = 'REJECT_REQUISITION';
            auditDetails = `Requisition ${id} was rejected by department head. Comment: "${comment}".`;
        } else {
            return NextResponse.json({ error: 'Invalid action for this requisition state.' }, { status: 400 });
        }
    
    // WORKFLOW 3: POST-AWARD HIERARCHICAL APPROVAL
    } else if (requisition.status.startsWith('Pending_')) {
        const isCommitteeMember = user.role === 'Committee_A_Member' || user.role === 'Committee_B_Member';
        const isCorrectCommittee = (requisition.status === 'Pending_Committee_A_Member' && user.role === 'Committee_A_Member') || (requisition.status === 'Pending_Committee_B_Member' && user.role === 'Committee_B_Member');
        const isDesignatedApprover = requisition.currentApproverId === userId;
        
        if (!isDesignatedApprover && !(isCommitteeMember && isCorrectCommittee)) {
            return NextResponse.json({ error: 'You are not the designated reviewer for this award.' }, { status: 403 });
        }
        
        if (status === 'Rejected') {
             dataToUpdate.currentApproverId = null;
             dataToUpdate.status = 'Rejected';
             auditAction = 'REJECT_AWARD';
             auditDetails = `Award for requisition ${id} was rejected by ${user.role.replace(/_/g, ' ')}. Reason: "${comment}".`;
        } else if (status === 'Approved') {
            const approvalMatrix = await prisma.approvalThreshold.findMany({ include: { steps: { orderBy: { order: 'asc' } } }, orderBy: { min: 'asc' }});
            const totalValue = requisition.totalPrice;
            const relevantTier = approvalMatrix.find(tier => totalValue >= tier.min && (tier.max === null || totalValue <= tier.max));

            if (!relevantTier) {
                 return NextResponse.json({ error: 'No approval tier configured for this award value.' }, { status: 400 });
            }
            
            const currentStepIndex = relevantTier.steps.findIndex(step => requisition.status === `Pending_${step.role}`);
            
            if (currentStepIndex !== -1 && currentStepIndex < relevantTier.steps.length - 1) {
                const nextStep = relevantTier.steps[currentStepIndex + 1];
                dataToUpdate.status = `Pending_${nextStep.role}`;
                if (!nextStep.role.includes('Committee')) {
                    dataToUpdate.currentApproverId = await findApproverId(nextStep.role as UserRole);
                } else {
                     dataToUpdate.currentApproverId = null;
                }
                auditDetails = `Award approved by ${user.role.replace(/_/g, ' ')}. Advanced to ${nextStep.role.replace(/_/g, ' ')}.`;
            } else {
                dataToUpdate.status = 'Approved';
                dataToUpdate.currentApproverId = null;
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
                    decisionBody: minute.decisionBody,
                    justification: minute.justification,
                    attendees: {
                        connect: minute.attendeeIds.map((id: string) => ({ id }))
                    }
                }
            });
            auditDetails += ` Minute recorded.`;
        }

    } else {
        return NextResponse.json({ error: 'Invalid operation. The requisition is not in a state that can be updated this way.' }, { status: 400 });
    }
    
    // EXECUTE THE UPDATE
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

    // Allow deletion by requester OR procurement officer/admin if it's a draft
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

    
