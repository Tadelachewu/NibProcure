
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
    const userRole = userPayload.role.replace(/ /g, '_') as UserRole;
    const userId = userPayload.user.id;

    if (userRole === 'Committee_A_Member') {
        whereClause.status = 'Pending_Committee_A_Recommendation';
    } else if (userRole === 'Committee_B_Member') {
        whereClause.status = 'Pending_Committee_B_Review';
    } else if (userRole === 'Admin' || userRole === 'Procurement_Officer') {
       const allCommitteeRoles = await prisma.role.findMany({ where: { name: { startsWith: 'Committee_', endsWith: '_Member' } } });
       const allReviewStatuses = allCommitteeRoles.map(r => `Pending_${r.name}`);
        allReviewStatuses.push('Pending_Managerial_Approval', 'Pending_Director_Approval', 'Pending_VP_Approval', 'Pending_President_Approval');

       whereClause = { 
         status: { 
           in: allReviewStatuses
         }
      };
    } else { // This handles hierarchical roles
      whereClause = { 
        currentApproverId: userId,
      };
    }
    
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
