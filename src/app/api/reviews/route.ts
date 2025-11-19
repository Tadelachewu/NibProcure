
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserByToken } from '@/lib/auth';
import { UserRole } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userPayload = await getUserByToken(token);
    if (!userPayload) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    
    let whereClause: any = {};
    const userRoles = (userPayload.user.roles as any[]).map(r => r.name) as UserRole[];
    const userId = userPayload.user.id;

    // Start with a base condition: the user is the direct current approver
    const orConditions = [{ currentApproverId: userId }];

    // Add conditions for any group-based roles the user has (e.g., Committee A)
    userRoles.forEach(roleName => {
        orConditions.push({ status: `Pending_${roleName}` });
    });

    // For high-level users, we also show them everything that is pending *any* kind of review
    // for better visibility.
    if (userRoles.includes('Admin') || userRoles.includes('Procurement_Officer')) {
        // Fetch all possible roles to dynamically create all possible "Pending" statuses
        const allSystemRoles = await prisma.role.findMany({ select: { name: true } });
        const allPossiblePendingStatuses = allSystemRoles.map(r => `Pending_${r.name}`);
        
        // Add all possible pending statuses to the query for admins/officers
        orConditions.push({ status: { in: allPossiblePendingStatuses } });

        // Also include PostApproved for the final notification step
        orConditions.push({ status: 'PostApproved' });
    }
    
    whereClause.OR = orConditions;
    
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
