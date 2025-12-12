
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';
import { UserRole, PerItemAwardDetail, Minute } from '@/lib/types';
import { getNextApprovalStep, getPreviousApprovalStep } from '@/services/award-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const actor = await getActorFromToken(request);
    if (!actor) {
        return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
    }
    
    const userRoles = actor.roles as UserRole[];
    const userId = actor.id;

    // Build the main query conditions
    const orConditions: any[] = [
      // The user is the direct current approver for a pending item, EXCLUDING the initial pre-approval.
      { currentApproverId: userId, status: { startsWith: 'Pending_', not: 'Pending_Approval' } },
      // The status matches a committee role the user has.
      { status: { in: userRoles.map(r => `Pending_${r}`).filter(s => s !== 'Pending_Approval') } },
      // The user has already signed a minute for this requisition
      { minutes: { some: { signatures: { some: { signerId: userId } } } } },
       // The requisition is in a state of decline or partial closure, which might still have items needing action.
      { status: { in: ['Award_Declined', 'Partially_Closed'] } },
    ];
    
    // If a user is an Admin or Procurement Officer, they should see all pending reviews
    if (userRoles.includes('Admin') || userRoles.includes('Procurement_Officer')) {
        const allSystemRoles = await prisma.role.findMany({ select: { name: true } });
        const allPossiblePendingStatuses = allSystemRoles
            .map(r => `Pending_${r.name}`)
            .filter(s => s !== 'Pending_Approval'); // Exclude initial approval status
        orConditions.push({ status: { in: allPossiblePendingStatuses } });
        // Also show items ready for notification and those declined/partially closed
        orConditions.push({ status: 'PostApproved' });
    }

    const requisitionsForUser = await prisma.purchaseRequisition.findMany({
        where: {
            OR: orConditions
        },
        include: { 
          items: true, 
          reviews: true,
          minutes: {
            include: {
              signatures: true,
            }
          }
        }
    });

    const requisitionIds = requisitionsForUser.map(r => r.id);

    // Fetch full data for the filtered requisitions
    const detailedRequisitions = await prisma.purchaseRequisition.findMany({
        where: { id: { in: requisitionIds } },
        include: {
            requester: { select: { name: true } },
            items: {
            select: {
                id: true,
                name: true,
                quantity: true,
                perItemAwardDetails: true,
            }
            },
            quotations: {
                include: {
                    items: true,
                    scores: {
                        include: {
                            scorer: true,
                            itemScores: {
                                include: {
                                    scores: true,
                                },
                            },
                        },
                    },
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


    const transactionIds = detailedRequisitions.map(r => r.transactionId).filter(Boolean) as string[];
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        transactionId: { in: transactionIds }
      },
      include: {
        user: {
          select: {
            name: true,
            roles: true,
          }
        }
      },
      orderBy: {
        timestamp: 'desc'
      }
    });

    const logsByTransaction = auditLogs.reduce((acc, log) => {
      if (log.transactionId) {
        if (!acc[log.transactionId]) {
          acc[log.transactionId] = [];
        }
        const logUserRoles = (log.user?.roles as any[])?.map(r => r.name).join(', ') || 'System';
        acc[log.transactionId].push({
          ...log,
          user: log.user?.name || 'System',
          role: logUserRoles.replace(/_/g, ' '),
          approverComment: log.details,
        });
      }
      return acc;
    }, {} as Record<string, any[]>);

    const requisitionsWithDetails = detailedRequisitions.map(req => {
      let isActionable = false;
      const currentDecisionBody = req.status.replace(/_/g, ' ');

      // Check if user has already signed a minute for this specific decision body/status
      const hasAlreadyActed = req.minutes.some(minute => 
        minute.decisionBody === currentDecisionBody &&
        minute.signatures.some(sig => sig.signerId === userId)
      );

      if (!hasAlreadyActed) {
          if (req.currentApproverId === userId) {
            isActionable = true;
          } else if (req.status.startsWith('Pending_')) {
            const requiredRole = req.status.replace('Pending_', '');
            if (userRoles.includes(requiredRole as UserRole)) {
              // This is a committee-level approval, so it's actionable if the user is part of that committee.
              isActionable = true;
            }
          }
      }
      
      return {
        ...req,
        isActionable,
        auditTrail: logsByTransaction[req.transactionId!] || []
      };
    });

    return NextResponse.json(requisitionsWithDetails);
  } catch (error) {
    console.error('Failed to fetch requisitions for review:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to fetch reviews', details: error.message }, { status: 500 });
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

        const body = await request.json();
        const { requisitionId, decision, userId, comment, minute } = body;

        const requisition = await prisma.purchaseRequisition.findUnique({ where: { id: requisitionId } });
        if (!requisition) {
            return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
        }

        if (decision !== 'APPROVED' && decision !== 'REJECTED') {
             return NextResponse.json({ error: 'Invalid decision provided.' }, { status: 400 });
        }
        
        const isAuthorizedToAct = (requisition.currentApproverId === userId) || 
                                  ((actor.roles as UserRole[]).some(r => requisition.status === `Pending_${r}`));

        if (!isAuthorizedToAct) {
            return NextResponse.json({ error: 'You are not authorized to act on this item at its current step.' }, { status: 403 });
        }

        const updatedRequisition = await prisma.$transaction(async (tx) => {
            let dataToUpdate: any = {};
            let auditAction = '';
            let auditDetails = '';

            if (decision === 'REJECTED') {
                const { previousStatus, previousApproverId, auditDetails: serviceAuditDetails } = await getPreviousApprovalStep(tx, requisition, actor, comment);
                dataToUpdate.status = previousStatus;
                dataToUpdate.currentApproverId = previousApproverId;
                auditAction = 'REJECT_AWARD_STEP';
                auditDetails = serviceAuditDetails;
            } else { // APPROVED
                const { nextStatus, nextApproverId, auditDetails: serviceAuditDetails } = await getNextApprovalStep(tx, requisition, actor);
                dataToUpdate.status = nextStatus;
                dataToUpdate.currentApproverId = nextApproverId;
                auditAction = 'APPROVE_AWARD_STEP';
                auditDetails = serviceAuditDetails;
            }

            const req = await tx.purchaseRequisition.update({
                where: { id: requisitionId },
                data: {
                    status: dataToUpdate.status,
                    currentApprover: dataToUpdate.currentApproverId ? { connect: { id: dataToUpdate.currentApproverId } } : { disconnect: true },
                    approverComment: comment,
                },
            });

            if (minute && minute.justification) {
                const createdMinute = await tx.minute.create({
                    data: {
                        requisition: { connect: { id: requisition.id } },
                        author: { connect: { id: actor.id } },
                        decision: decision,
                        decisionBody: minute.decisionBody,
                        justification: minute.justification,
                        type: 'system_generated',
                    }
                });
                auditDetails += ` Minute recorded as ${createdMinute.id}.`;
            }

            await tx.auditLog.create({
                data: {
                    transactionId: req.transactionId,
                    user: { connect: { id: actor.id } },
                    timestamp: new Date(),
                    action: auditAction,
                    entity: 'Requisition',
                    entityId: requisitionId,
                    details: auditDetails,
                }
            });

            return req;
        });

        return NextResponse.json(updatedRequisition);
    } catch (error) {
        console.error("Failed to process award review:", error);
        if (error instanceof Error) {
            return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
        }
        return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
    }
}
