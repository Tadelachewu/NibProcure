
'use server';

import { NextResponse } from 'next/server';
import type { PurchaseRequisition, User, UserRole, Vendor, Minute } from '@/lib/types';
import { prisma } from '@/lib/prisma';
import { getUserByToken } from '@/lib/auth';
import { headers } from 'next/headers';
import { sendEmail } from '@/services/email-service';
import { differenceInMinutes, format } from 'date-fns';

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
  const forReview = searchParams.get('forReview');
  console.log(`--- REQUISITIONS GET Request ---`);
  console.log(`[GET] searchParams:`, searchParams.toString());


  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.split(' ')[1];
  let userPayload: { user: User, role: UserRole } | null = null;
  if(token) {
    userPayload = await getUserByToken(token);
    console.log(`[GET] Authenticated user: ${userPayload?.user.name}, Role: ${userPayload?.role}`);
  }

  try {
    let whereClause: any = {};
    
    if (forReview === 'true' && userPayload) {
        console.log(`[GET] 'forReview' flag is true. Constructing review query.`);
        const userRole = userPayload.role.replace(/ /g, '_') as UserRole;
        const userId = userPayload.user.id;

        const reviewStatuses = [
          'Pending_Committee_A_Recommendation',
          'Pending_Committee_B_Review',
          'Pending_Managerial_Approval',
          'Pending_Director_Approval',
          'Pending_VP_Approval',
          'Pending_President_Approval'
        ];
        console.log(`[GET] Base review statuses being checked:`, reviewStatuses);

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
          // This logic fetches requisitions where the current user is the designated next approver
          whereClause = { 
            currentApproverId: userId,
            status: { in: reviewStatuses }
          };
        } else if (userRole === 'Admin' || userRole === 'Procurement_Officer') {
           // Admin/PO can see all items currently in any review state
           whereClause = { status: { in: reviewStatuses } };
        } else {
          console.log(`[GET] User role ${userRole} has no specific review logic. Returning empty.`);
          return NextResponse.json([]);
        }
        console.log(`[GET] Final whereClause for review:`, JSON.stringify(whereClause, null, 2));

    } else {
        // Fallback to original logic if not for review
        const statusParam = searchParams.get('status');
        const forQuoting = searchParams.get('forQuoting');
        const approverId = searchParams.get('approverId');
        
        if (statusParam) whereClause.status = { in: statusParam.split(',').map(s => s.trim().replace(/ /g, '_')) };
        if (forQuoting) {
            whereClause.OR = [
                { status: 'Review_Complete' },
                { status: 'Approved', currentApproverId: null, NOT: { quotations: { some: { status: { in: ['Awarded', 'Partially_Awarded'] } } } } },
                { status: 'RFQ_In_Progress' },
                { status: { startsWith: 'Pending_' } }
            ]
        }
        if (approverId) whereClause.currentApproverId = approverId;
        if (userPayload && userPayload.role === 'Requester' && !forQuoting && !statusParam && !approverId && !forReview) {
          whereClause.requesterId = userPayload.user.id;
        }
        console.log(`[GET] Final whereClause for non-review query:`, JSON.stringify(whereClause, null, 2));
    }


    const requisitions = await prisma.purchaseRequisition.findMany({
      where: whereClause,
      include: {
        requester: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    console.log(`[GET] Found ${requisitions.length} requisitions from database.`);

    const formattedRequisitions = requisitions.map(req => ({
        ...req,
        status: req.status.replace(/_/g, ' '),
        requesterName: req.requester.name,
    }));
    
    console.log(`--- REQUISITIONS GET Request END ---`);
    return NextResponse.json(formattedRequisitions);
  } catch (error) {
    console.error('[GET] Failed to fetch requisitions:', error);
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

    // --- LOGIC FOR HIERARCHICAL, POST-AWARD APPROVALS ---
    if (requisition.status.startsWith('Pending_')) {
        console.log(`[PATCH] Handling hierarchical approval.`);
        const isCommitteeApproval = requisition.status.includes('Committee');
        
        const isDesignatedApprover = isCommitteeApproval 
            ? user.role.replace(/ /g, '_') === requisition.status.replace('Pending_', '')
            : requisition.currentApproverId === userId;
        
        if (!isDesignatedApprover) {
            console.error(`[PATCH] Unauthorized. User ${userId} is not the designated approver.`);
            return NextResponse.json({ error: 'You are not the designated approver for this item.' }, { status: 403 });
        }
        
        if (newStatus === 'Rejected') {
             dataToUpdate.currentApproverId = null;
             dataToUpdate.status = 'Rejected';
             auditAction = 'REJECT_AWARD';
             auditDetails = `Award for requisition ${id} was rejected by ${user.role.replace(/_/g, ' ')}. Reason: "${comment}".`;
             console.log(`[PATCH] Award rejected. New status: Rejected.`);
        } else if (newStatus === 'Approved') {
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
                dataToUpdate.status = 'Review_Complete';
                dataToUpdate.currentApproverId = null;
                console.log(`[PATCH] Setting status to Review_Complete.`);
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

    // --- LOGIC FOR INITIAL DEPARTMENTAL APPROVAL ---
    } else {
        console.log(`[PATCH] Handling standard status change.`);
         if ((requisition.status === 'Draft' || requisition.status === 'Rejected') && newStatus === 'Pending_Approval') {
            const isRequester = requisition.requesterId === userId;
            if (!isRequester) return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
            const department = await prisma.department.findUnique({ where: { id: requisition.departmentId! } });
            if (department?.headId) {
                dataToUpdate.currentApproverId = department.headId;
                dataToUpdate.status = 'Pending_Approval';
            } else {
                dataToUpdate.status = 'Approved';
                dataToUpdate.currentApproverId = null;
            }
        } else if (requisition.status === 'Pending_Approval') {
            if (requisition.currentApproverId !== userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
            dataToUpdate.status = newStatus;
            dataToUpdate.currentApproverId = null; 
        } else {
            return NextResponse.json({ error: 'Invalid operation for current status.' }, { status: 400 });
        }
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
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}

// Keep other handlers like POST and DELETE as they are
// ... POST and DELETE functions from the original file ...

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
