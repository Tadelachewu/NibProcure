
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';
import { UserRole, PerItemAwardDetail } from '@/lib/types';

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
      // The user is the direct current approver.
      { currentApproverId: userId },
      // The status matches a committee role the user has.
      { status: { in: userRoles.map(r => `Pending_${r}`) } },
    ];
    
    // If a user is an Admin or Procurement Officer, they should see all pending reviews
    if (userRoles.includes('Admin') || userRoles.includes('Procurement_Officer')) {
        const allSystemRoles = await prisma.role.findMany({ select: { name: true } });
        const allPossiblePendingStatuses = allSystemRoles.map(r => `Pending_${r.name}`);
        orConditions.push({
            status: { in: allPossiblePendingStatuses }
        });
        // Also show items ready for notification and those declined/partially closed
        orConditions.push({ status: 'PostApproved' });
        orConditions.push({ status: 'Award_Declined' });
        orConditions.push({ status: 'Partially_Closed' });
    }

    const requisitionsForUser = await prisma.purchaseRequisition.findMany({
        where: {
            OR: orConditions
        },
        include: { items: true, reviews: true }
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
                attendees: true
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
      if (req.currentApproverId === userId) {
        isActionable = true;
      } else if (req.status.startsWith('Pending_')) {
        const requiredRole = req.status.replace('Pending_', '');
        if (userRoles.includes(requiredRole as UserRole)) {
          // This is a committee-level approval, so it's actionable if the user is part of that committee.
          isActionable = true;
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
