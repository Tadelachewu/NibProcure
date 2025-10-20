
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserByToken } from '@/lib/auth';

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
    const userRole = userPayload.role.replace(/ /g, '_');
    const userId = userPayload.user.id;

    if (userRole === 'Committee_A_Member') {
      whereClause = {
        status: 'Pending_Committee_A_Member',
      };
    } else if (userRole === 'Committee_B_Member') {
      whereClause = {
        status: 'Pending_Committee_B_Member',
      };
    } else if (userRole === 'Manager_Procurement_Division' || userRole === 'Director_Supply_Chain_and_Property_Management' || userRole === 'VP_Resources_and_Facilities' || userRole === 'President') {
      whereClause = { currentApproverId: userId };
    } else if (userRole === 'Admin' || userRole === 'Procurement_Officer') {
       whereClause = { 
         status: { 
           in: [
              'Pending_Committee_A_Member',
              'Pending_Committee_B_Member',
              'Pending_Managerial_Review',
              'Pending_Director_Approval',
              'Pending_VP_Approval',
              'Pending_President_Approval'
           ]
         }
      };
    } else {
      // If user doesn't have a specific review role, return empty
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
