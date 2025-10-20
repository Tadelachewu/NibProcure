
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserByToken } from '@/lib/auth';

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
    
    const reviewStatuses = [
      'Pending_Committee_A_Recommendation',
      'Pending_Committee_B_Review',
      'Pending_Managerial_Review',
      'Pending_Director_Approval',
      'Pending_VP_Approval',
      'Pending_President_Approval'
    ];

    let whereClause: any = {
      status: { in: reviewStatuses }
    };

    if (userPayload.role === 'Committee_A_Member') {
      whereClause = {
        status: 'Pending_Committee_A_Recommendation',
        OR: [
            { financialCommitteeMembers: { some: { id: userPayload.user.id } } },
            { technicalCommitteeMembers: { some: { id: userPayload.user.id } } },
        ],
      };
    } else if (userPayload.role === 'Committee_B_Member') {
      whereClause = {
        status: 'Pending_Committee_B_Review',
        OR: [
          { financialCommitteeMembers: { some: { id: userPayload.user.id } } },
          { technicalCommitteeMembers: { some: { id: userPayload.user.id } } },
        ],
      };
    } else if (userPayload && ['Manager_Procurement_Division', 'Director_Supply_Chain_and_Property_Management', 'VP_Resources_and_Facilities', 'President'].includes(userPayload.role)) {
      whereClause.currentApproverId = userPayload.user.id;
    } else if (userPayload?.role !== 'Admin' && userPayload?.role !== 'Procurement_Officer') {
      // If user doesn't have a specific review role, return empty
      return NextResponse.json([]);
    }
    // For Admin/Procurement Officer, the default `whereClause` shows all reviews.

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
