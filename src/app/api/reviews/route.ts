
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

    console.log(`[Reviews API] Fetching reviews for user ${userId} with role: ${userRole}`);

    const reviewStatuses = [
      'Pending_Managerial_Approval',
      'Pending_Director_Approval',
      'Pending_VP_Approval',
      'Pending_President_Approval'
    ];
    
    const committeeMatch = userRole.match(/Committee_([A-Z])_Member/);

    if (committeeMatch) {
        const committeeLetter = committeeMatch[1];
        const statusToFind = `Pending_Committee_${committeeLetter}_Recommendation`;
        console.log(`[Reviews API] Matched committee role: ${userRole}. Searching for status: ${statusToFind}`);
        whereClause = { status: statusToFind };
    } else if (
      userRole === 'Manager_Procurement_Division' || 
      userRole === 'Director_Supply_Chain_and_Property_Management' || 
      userRole === 'VP_Resources_and_Facilities' || 
      userRole === 'President'
    ) {
      console.log(`[Reviews API] Matched managerial role: ${userRole}. Searching for currentApproverId: ${userId}`);
      whereClause = { 
        currentApproverId: userId,
        status: {
          in: reviewStatuses
        }
      };
    } else if (userRole === 'Admin' || userRole === 'Procurement_Officer') {
       console.log(`[Reviews API] Matched admin/procurement role. Searching for all review statuses.`);
       const allCommitteeStatuses = (await prisma.role.findMany({ where: { name: { startsWith: 'Committee_' } } }))
          .map(r => r.name.replace(/_Member$/, ''))
          .map(r => `Pending_${r}_Recommendation`);

       whereClause = { 
         status: { 
           in: [
            ...allCommitteeStatuses,
            ...reviewStatuses
           ]
         }
      };
    } else {
      console.log(`[Reviews API] User role ${userRole} has no review permissions. Returning empty array.`);
      return NextResponse.json([]);
    }
    
    console.log(`[Reviews API] Constructed whereClause:`, JSON.stringify(whereClause, null, 2));

    const requisitions = await prisma.purchaseRequisition.findMany({
      where: whereClause,
      include: {
        requester: { select: { name: true } },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log(`[Reviews API] Found ${requisitions.length} requisitions for user ${userId}.`);


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
