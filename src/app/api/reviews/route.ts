
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

    const managerialRoles = [
      'Manager_Procurement_Division', 
      'Director_Supply_Chain_and_Property_Management', 
      'VP_Resources_and_Facilities', 
      'President'
    ];
    
    const managerialStatuses = [
      'Pending_Managerial_Approval',
      'Pending_Director_Approval',
      'Pending_VP_Approval',
      'Pending_President_Approval'
    ];
    
    // Check if the user has a committee role (e.g., Committee_A_Member, Committee_C_Member)
    const isCommitteeRole = userRole.startsWith('Committee_') && userRole.endsWith('_Member');

    if (isCommitteeRole) {
        // Dynamically construct the status based on the role.
        // e.g., 'Committee_C_Member' -> 'Pending_Committee_C_Member'
        const statusToFind = `Pending_${userRole}`;
        console.log(`[Reviews API] Matched committee role: ${userRole}. Searching for status: ${statusToFind}`);
        whereClause = { status: statusToFind };
    } else if (managerialRoles.includes(userRole)) {
      console.log(`[Reviews API] Matched managerial role: ${userRole}. Searching for currentApproverId: ${userId}`);
      whereClause = { 
        currentApproverId: userId,
        status: { in: managerialStatuses }
      };
    } else if (userRole === 'Admin' || userRole === 'Procurement_Officer') {
       console.log(`[Reviews API] Matched admin/procurement role. Searching for all review statuses.`);
       const allCommitteeRoles = await prisma.role.findMany({ where: { name: { startsWith: 'Committee_' } } });
       const allCommitteeStatuses = allCommitteeRoles.map(r => `Pending_${r.name}`);

       whereClause = { 
         status: { 
           in: [
            ...allCommitteeStatuses,
            ...managerialStatuses
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
