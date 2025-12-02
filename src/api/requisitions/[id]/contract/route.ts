

'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';


export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const actor = await getActorFromToken(request);
    if (!actor) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { id } = params;
    const body = await request.json();
    const { notes, fileName } = body;

    const requisition = await prisma.purchaseRequisition.findUnique({ where: { id } });
    if (!requisition) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
    }

    // This endpoint is now deprecated in favor of the new /api/contracts endpoint.
    // The logic has been moved to POST /api/contracts
    
    // await prisma.auditLog.create({ ... });

    return NextResponse.json({ message: "This endpoint is deprecated" }, { status: 410 });

  } catch (error) {
    console.error('Failed to update contract details:', error);
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
