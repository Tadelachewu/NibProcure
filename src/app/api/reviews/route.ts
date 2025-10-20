

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserByToken } from '@/lib/auth';

export const dynamic = 'force-dynamic'; // Add this line

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userPayload = await getUserByToken(token);
    if (!userPayload || (userPayload.role !== 'Admin' && userPayload.role !== 'Procurement_Officer' && userPayload.role !== 'Committee_A_Member' && userPayload.role !== 'Committee_B_Member')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const reviews = await prisma.review.findMany({
      include: {
        reviewer: {
          select: {
            name: true,
          }
        },
        requisition: {
          select: {
            title: true,
          }
        }
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json(reviews);
  } catch (error) {
    console.error('Failed to fetch reviews:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to fetch reviews', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
