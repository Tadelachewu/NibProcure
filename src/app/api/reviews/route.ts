
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

    // Base conditions for any reviewable item
    const orConditions: any[] = [
      // The user is the direct current approver for a pending item.
      { currentApproverId: userId, status: { startsWith: 'Pending_' } },
      // The status matches a committee role the user has.
      { status: { in: userRoles.map(r => `Pending_${r}`) } },
      // The requisition is in a state of decline or partial closure, which might still have items needing action.
      { status: { in: ['Award_Declined', 'Partially_Closed'] } },
    ];
    
    // If a user is an Admin or Procurement Officer, they should see ALL pending reviews for oversight.
    if (userRoles.includes('Admin') || userRoles.includes('Procurement_Officer')) {
        const allSystemRoles = await prisma.role.findMany({ select: { name: true } });
        const allPossiblePendingStatuses = allSystemRoles.map(r => `Pending_${r.name}`);
        orConditions.push({ status: { in: allPossiblePendingStatuses } });
        orConditions.push({ status: 'PostApproved' }); // Also show items ready for notification
    }

    // Fetch all requisitions that match the initial broad criteria
    const potentiallyReviewableRequisitions = await prisma.purchaseRequisition.findMany({
        where: {
            OR: orConditions
        },
        include: {
            requester: { select: { name: true } },
            items: {
                select: { id: true, name: true, quantity: true, perItemAwardDetails: true }
            },
            quotations: {
                include: {
                    items: true,
                    scores: { include: { scorer: true, itemScores: { include: { scores: true } } } }
                }
            },
            minutes: {
                include: { author: true, attendees: true, signatures: true }
            }
      },
      orderBy: { createdAt: 'desc' },
    });

    // Client-side filtering to determine what's TRULY actionable for the current user
    const finalRequisitions = potentiallyReviewableRequisitions.filter(req => {
        const userRoles = (actor.roles as any[]);
        // Direct assignment check
        if (req.currentApproverId === userId) {
            return true;
        }
        // Committee check
        if (req.status.startsWith('Pending_')) {
            const requiredRole = req.status.replace('Pending_', '');
            if (userRoles.includes(requiredRole)) {
                return true;
            }
        }
        // If an admin/PO, they see everything that matches the broad query
        if (userRoles.includes('Admin') || userRoles.includes('Procurement_Officer')) {
            return true;
        }

        return false;
    });

    const transactionIds = finalRequisitions.map(r => r.transactionId).filter(Boolean) as string[];
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        transactionId: { in: transactionIds }
      },
      include: {
        user: { select: { name: true, roles: true } }
      },
      orderBy: { timestamp: 'desc' }
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

    const requisitionsWithDetails = finalRequisitions.map(req => ({
      ...req,
      auditTrail: logsByTransaction[req.transactionId!] || []
    }));

    return NextResponse.json(requisitionsWithDetails);
  } catch (error) {
    console.error('Failed to fetch requisitions for review:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to fetch reviews', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
