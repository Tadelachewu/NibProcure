
'use server';

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

    // --- START: NEW VISIBILITY LOGIC ---

    // Admins and Procurement Officers can see everything in the review pipeline
    if (userRoles.includes('Admin') || userRoles.includes('Procurement_Officer')) {
         const allSystemRoles = await prisma.role.findMany({ select: { name: true } });
         const allPossiblePendingStatuses = allSystemRoles.map(r => `Pending_${r.name}`);
         orConditions.push({ status: { in: allPossiblePendingStatuses } });
         orConditions.push({ status: 'PostApproved' }); // Also see items ready for notification
    }

    // All users can see items specifically assigned to them.
    orConditions.push({ currentApproverId: userId });

    // Users can see items assigned to their committee roles.
    userRoles.forEach(role => {
        if (role.includes('Committee')) {
             orConditions.push({ status: `Pending_${role}` });
        }
    });

    // If requested, include items the user has already actioned on.
    if (includeActioned) {
        orConditions.push({
            reviews: {
                some: {
                    reviewerId: userId
                }
            }
        });
    }
    // --- END: NEW VISIBILITY LOGIC ---


    const requisitionsForUser = await prisma.purchaseRequisition.findMany({
        where: { OR: orConditions },
        distinct: ['id'], // Ensure we only get each requisition once
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
            },
            approver: true, // Include the approver details
            currentApprover: true, // Include the current approver
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
