
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
    
    // New Condition: Also include items this user has reviewed in the last 5 minutes.
    // This makes the UI feel persistent after an action.
    orConditions.push({
        reviews: {
            some: {
                reviewerId: userId,
                // Look for reviews in the last 5 minutes to keep the view clean
                createdAt: { gte: addMinutes(new Date(), -5) }
            }
        }
    });
    
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
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json(requisitions);
  } catch (error) {
    console.error('Failed to fetch requisitions for review:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to fetch reviews', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
