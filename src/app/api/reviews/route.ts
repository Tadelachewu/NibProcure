
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';
import { UserRole, PerItemAwardDetail, Minute } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const actor = await getActorFromToken(request);
    if (!actor) {
        return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
    }
    
    const userRoles = actor.roles as UserRole[];
    const userId = actor.id;

    // Filter out pre-award approval statuses
    const preAwardStatuses = ['Pending_Approval', 'Pending_Director_Approval', 'Pending_Managerial_Approval'];

    // Build the main query conditions
    const orConditions: any[] = [
      // The user is the direct current approver for a pending item, EXCLUDING pre-award ones.
      { currentApproverId: userId, status: { startsWith: 'Pending_', notIn: preAwardStatuses } },
      // The status matches a committee role the user has.
      { status: { in: userRoles.map(r => `Pending_${r}`).filter(s => !preAwardStatuses.includes(s)) } },
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
            .filter(s => !preAwardStatuses.includes(s)); // Exclude pre-award statuses
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
            },
            // include committee membership so we can decide actionability for per-item award flows
            financialCommitteeMembers: { select: { id: true } },
            technicalCommitteeMembers: { select: { id: true } },
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

    const requisitionsWithDetails: any[] = [];
    for (const req of detailedRequisitions) {
      let isActionable = false;
      const currentDecisionBody = req.status.replace(/_/g, ' ');

      // Check if user has already signed a minute for this specific decision body/status
      const hasAlreadyActed = req.minutes.some((minute: any) => 
      minute.decisionBody === currentDecisionBody &&
      minute.signatures.some((sig: any) => sig.signerId === userId)
      );

      if (!hasAlreadyActed) {
        if (req.currentApproverId === userId) {
        isActionable = true;
        } else if (req.status.startsWith('Pending_') && !preAwardStatuses.includes(req.status)) {
        const requiredRole = req.status.replace('Pending_', '');
        if (userRoles.includes(requiredRole as UserRole)) {
          // This is a committee-level approval, so it's actionable if the user is part of that committee.
          isActionable = true;
        }
        }

        // Allow action when requisition is in Award_Declined but there are still per-item pending awards
        // and the user is part of the financial/technical committee or appears in the approval matrix tier.
        try {
          if (!isActionable && req.status === 'Award_Declined') {
            const awardStrategy = (req as any).rfqSettings?.awardStrategy;
            const hasPendingPerItemAwards = (req.items || []).some((item: any) => {
              const details = (item.perItemAwardDetails as any[]) || [];
              return details.some(d => d.status === 'Pending_AWARD' || d.status === 'Pending_Award');
            });

            if (awardStrategy === 'item' && hasPendingPerItemAwards) {
              const fcIds = (req.financialCommitteeMembers || []).map((m: any) => m.id);
              const tcIds = (req.technicalCommitteeMembers || []).map((m: any) => m.id);
              if (fcIds.includes(userId) || tcIds.includes(userId)) {
                isActionable = true;
              } else {
                // fallback: check approval matrix membership for remaining pending total
                let effectiveTotal = req.totalPrice || 0;
                try {
                  let newTotal = 0;
                  for (const item of req.items) {
                    const details = (item.perItemAwardDetails as any[]) || [];
                    const pending = details.find(d => d.status === 'Pending_Award');
                    if (pending) {
                      newTotal += (pending.unitPrice ?? item.unitPrice) * (item.quantity ?? 1);
                    }
                  }
                  effectiveTotal = newTotal;
                } catch (e) {
                  // ignore and fallback to original total
                }

                const approvalMatrix = await prisma.approvalThreshold.findMany({
                  include: { steps: { include: { role: { select: { name: true } } }, orderBy: { order: 'asc' } } },
                  orderBy: { min: 'asc' }
                });

                const relevantTier = approvalMatrix.find((tier: any) =>
                  (effectiveTotal >= tier.min) && (tier.max === null || effectiveTotal <= tier.max)
                );

                if (relevantTier) {
                  const tierRoleNames = (relevantTier.steps || []).map((s: any) => s.role.name);
                  if ((userRoles as string[]).some(rn => tierRoleNames.includes(rn))) {
                    isActionable = true;
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn('Failed to evaluate per-item actionability in reviews API:', e);
        }
      }
      
      // Determine if promote-standby or restart-rfq actions should be exposed
      let canPromoteStandby = false;
      let canRestartRfq = false;
      try {
        // Check per-item award details
        for (const item of (req.items || [])) {
          const details = (item.perItemAwardDetails || []) as any[];
          const hasDeclined = details.some(d => d.status === 'Declined');
          const hasStandby = details.some(d => d.status === 'Standby');
          const hasFailed = details.some(d => d.status === 'Failed_to_Award');

          if ((hasDeclined && hasStandby) || hasStandby) {
            canPromoteStandby = true;
          }
          if (hasFailed || hasDeclined) {
            canRestartRfq = true;
          }
        }

        // Also check quotations for standby/failed/declined statuses
        for (const q of (req.quotations || [])) {
          if (q.status === 'Standby') canPromoteStandby = true;
          if (q.status === 'Failed' || q.status === 'Declined') canRestartRfq = true;
        }
      } catch (e) {
        console.warn('Failed to compute promote/restart flags:', e);
      }

      requisitionsWithDetails.push({
        ...req,
        isActionable,
        canPromoteStandby,
        canRestartRfq,
        auditTrail: logsByTransaction[req.transactionId!] || []
      });
    }

    return NextResponse.json(requisitionsWithDetails);
  } catch (error) {
    console.error('Failed to fetch requisitions for review:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to fetch reviews', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}

    