
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

    // --- Start of Enhanced Fetching Logic ---
    const allRequisitions = await prisma.purchaseRequisition.findMany({
        where: {
            status: { 
                in: [
                    'Pending_Committee_A_Recommendation', 'Pending_Committee_B_Review',
                    'Pending_Managerial_Approval', 'Pending_Director_Approval',
                    'Pending_VP_Approval', 'Pending_President_Approval', 'PostApproved',
                    'Award_Declined', 'Partially_Awarded' // Include statuses that might hide pending items
                ]
            }
        },
        include: { items: true, reviews: true }
    });

    const requisitionsForUser = allRequisitions.filter(req => {
        // Direct assignment always grants access
        if (req.currentApproverId === userId) {
            return true;
        }

        // Admins and Procurement Officers can see everything in review
        if (userRoles.includes('Admin') || userRoles.includes('Procurement_Officer')) {
            return true;
        }

        // Check if user has the role required by the current main status
        if (req.status.startsWith('Pending_')) {
            const requiredRole = req.status.replace('Pending_', '');
            if (userRoles.includes(requiredRole as UserRole)) {
                return true;
            }
        }
        
        // NEW: Check for per-item pending awards, even if main status doesn't reflect it
        const isPerItem = (req.rfqSettings as any)?.awardStrategy === 'item';
        if (isPerItem) {
            const hasPendingItem = req.items.some(item => 
                (item.perItemAwardDetails as PerItemAwardDetail[] | undefined)?.some(d => d.status === 'Pending_Award')
            );
            if (hasPendingItem) {
                // If an item is pending, the current reviewer is determined by the approval matrix for THAT item's value,
                // which is complex to re-calculate here. We rely on the `currentApproverId` being set correctly.
                // This logic primarily ensures the requisition shows up on the list for Admins/POs if an item is pending.
                return true;
            }
        }

        return false;
    });
    // --- End of Enhanced Fetching Logic ---

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
