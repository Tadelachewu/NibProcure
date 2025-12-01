
'use server';

import { NextResponse } from 'next/server';
import { getActorFromToken } from '@/lib/auth';

export async function GET(request: Request) {
  // Enforce authentication for this endpoint
  const actor = await getActorFromToken(request);
  if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // In a real application, you would fetch this data from a database or other services.
  const mockData = {
    openRequisitions: 12,
    pendingApprovals: 8,
    pendingPayments: 4,
  };

  return NextResponse.json(mockData);
}
