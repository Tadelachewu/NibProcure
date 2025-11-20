
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decodeJwt } from '@/lib/auth';
import { User, UserRole } from '@/lib/types';
import { addMinutes } from 'date-fns';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userPayload = decodeJwt<User & { roles: UserRole[] }>(token);
    if (!userPayload) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    
    // Correctly get roles from the decoded token payload
    const userRoles = userPayload.roles || [];
    const userId = userPayload.id;

    const orConditions: any[] = [
        { currentApproverId: userId },
        { reviews: { some: { reviewerId: userId } } }
    ];

    userRoles.forEach(roleName => {
        orConditions.push({ status: `Pending_${roleName}` });
    });
    
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

    const requisitionsWithDetails = requisitions.map(req => {
      let isActionable = false;
      if (req.status.startsWith('Pending_')) {
        if (req.currentApproverId === userId) {
          isActionable = true;
        } else {
          const requiredRole = req.status.replace('Pending_', '');
          if (userRoles.includes(requiredRole as UserRole)) {
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
