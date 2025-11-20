
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decodeJwt } from '@/lib/auth';
import { UserRole } from '@/lib/types';
import { addMinutes } from 'date-fns';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userPayload = decodeJwt(token) as any;
    if (!userPayload) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    
    const userRoles = (userPayload.roles as string[]) || [];
    const userId = userPayload.id;

    // Base condition: Items currently pending this user's approval
    const orConditions: any[] = [{ currentApproverId: userId }];

    // Add conditions for any group-based roles the user has
    userRoles.forEach(roleName => {
        orConditions.push({ status: `Pending_${roleName}` });
    });
    
    const url = new URL(request.url);
    if (url.searchParams.get('includeActioned') === 'true') {
        orConditions.push({
            reviews: {
                some: {
                    reviewerId: userId,
                    createdAt: { gte: addMinutes(new Date(), -5) }
                }
            }
        });
    }
    
    // For high-level users, we also show them everything that is pending *any* kind of review for oversight
    if (userRoles.includes('Admin') || userRoles.includes('Procurement_Officer')) {
        const allSystemRoles = await prisma.role.findMany({ select: { name: true } });
        const allPossiblePendingStatuses = allSystemRoles.map(r => `Pending_${r.name}`);
        orConditions.push({ status: { in: allPossiblePendingStatuses } });
        orConditions.push({ status: 'PostApproved' });
    }
    
    const whereClause = { OR: orConditions };
    
    const requisitions = await prisma.purchaseRequisition.findMany({
      where: whereClause,
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

    // Manually fetch and attach audit trails
    const transactionIds = requisitions.map(r => r.transactionId).filter(Boolean) as string[];
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
        acc[log.transactionId].push({
          ...log,
          user: { name: log.user?.name || 'System' }
        });
      }
      return acc;
    }, {} as Record<string, any[]>);

    const requisitionsWithAudit = requisitions.map(req => ({
      ...req,
      auditTrail: logsByTransaction[req.transactionId] || []
    }));

    return NextResponse.json(requisitionsWithAudit);
  } catch (error) {
    console.error('Failed to fetch requisitions for review:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to fetch reviews', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
