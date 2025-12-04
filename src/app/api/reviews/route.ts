
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
    
    const { searchParams } = new URL(request.url);
    const includeActioned = searchParams.has('includeActionedFor');
    
    const userRoles = actor.roles as UserRole[];
    const userId = actor.id;

    // Build the query conditions
    const orConditions: any[] = [];

    // Condition 1: Items currently pending this user's action
    orConditions.push({ currentApproverId: userId });
    userRoles.forEach(role => {
        // This finds items pending a committee the user is part of
        if (role.includes('Committee')) {
             orConditions.push({ status: `Pending_${role}` });
        }
    });

    // Condition 2: (New) Items this user has already actioned on.
    if (includeActioned) {
        orConditions.push({
            reviews: {
                some: {
                    reviewerId: userId
                }
            }
        });
    }

    const requisitionsForUser = await prisma.purchaseRequisition.findMany({
        where: { OR: orConditions },
        include: { 
            items: true, 
            reviews: {
                where: {
                    reviewerId: userId
                },
                select: {
                    decision: true
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
                attendees: true
            }
            },
            reviews: {
                where: {
                    reviewerId: userId,
                },
                select: {
                    decision: true
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
      const hasBeenActioned = req.reviews.length > 0;

      if (!hasBeenActioned) {
          if (req.currentApproverId === userId) {
            isActionable = true;
          } else if (req.status.startsWith('Pending_')) {
            const requiredRole = req.status.replace('Pending_', '');
            if (userRoles.includes(requiredRole as UserRole)) {
              isActionable = true;
            }
          }
      }
      
      return {
        ...req,
        isActionable,
        actionTaken: hasBeenActioned ? req.reviews[0].decision : null,
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
