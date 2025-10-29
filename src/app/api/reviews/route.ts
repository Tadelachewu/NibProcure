
'use server';

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

    const reviewStatuses = [
      'Pending_Committee_A_Recommendation',
      'Pending_Committee_B_Review',
      'Pending_Managerial_Review',
      'Pending_Director_Approval',
      'Pending_VP_Approval',
      'Pending_President_Approval',
      'Pending_Manager_Procurement_Division'
    ];
    
    const committeeMatch = userRole.match(/Committee_(\w+)_Member/);

    if (committeeMatch) {
        const committeeLetter = committeeMatch[1];
        let statusToFind = `Pending_Committee_${committeeLetter}_Recommendation`;
        // Handle the specific case for Committee B from the original logic
        if (committeeLetter === 'B') {
            statusToFind = 'Pending_Committee_B_Review';
        }
        reviewStatuses.push(statusToFind); // Add dynamically to the list of possible statuses
        whereClause = { status: statusToFind };
    } else if (
      userRole === 'Manager_Procurement_Division' || 
      userRole === 'Director_Supply_Chain_and_Property_Management' || 
      userRole === 'VP_Resources_and_Facilities' || 
      userRole === 'President'
    ) {
      whereClause = { 
        currentApproverId: userId,
        status: {
          in: reviewStatuses
        }
      };
    } else if (userRole === 'Admin' || userRole === 'Procurement_Officer') {
       whereClause = { 
         status: { 
           in: reviewStatuses
         }
      };
    } else {
      return NextResponse.json([]);
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

    const formattedRequisitions = requisitions.map(req => ({
        ...req,
        status: req.status.replace(/_/g, ' '),
    }));

    return NextResponse.json(formattedRequisitions);
  } catch (error) {
    console.error('Failed to fetch requisitions for review:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to fetch reviews', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
