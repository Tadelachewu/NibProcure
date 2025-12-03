

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';
import { UserRole } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const actor = await getActorFromToken(request);
    if (!actor) {
        return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
    }
    
    const userRoles = actor.roles as UserRole[];
    const userId = actor.id;

    // --- Start of Corrected Where Clause ---
    const orConditions: any[] = [
        { currentApproverId: userId },
    ];
    
    const validPendingStatuses = [
        'Pending_Approval',
        'Pending_Committee_A_Recommendation', 
        'Pending_Committee_B_Review',
        'Pending_Managerial_Approval', 
        'Pending_Director_Approval',
        'Pending_VP_Approval', 
        'Pending_President_Approval'
    ];

    // If the user has a specific approval role, find requisitions with that status.
    userRoles.forEach(roleName => {
        const pendingStatus = `Pending_${roleName}`;
        if (validPendingStatuses.includes(pendingStatus)) {
            orConditions.push({ status: pendingStatus });
        }
    });
    
    // Admins and Procurement Officers can see a broader range for oversight.
    if (userRoles.includes('Admin') || userRoles.includes('Procurement_Officer')) {
         orConditions.push({ status: { in: validPendingStatuses } });
         orConditions.push({ status: 'PostApproved' });
    }
    
    const whereClause = { OR: orConditions };
    // --- End of Corrected Where Clause ---
    
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

    