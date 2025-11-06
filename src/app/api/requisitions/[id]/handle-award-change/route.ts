
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleAwardRejection, promoteStandbyVendor } from '@/services/award-service';
import { User } from '@/lib/types';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const requisitionId = params.id;
  try {
    const body = await request.json();
    const { userId } = body as { userId: string };

    const user: User | null = await prisma.user.findUnique({where: {id: userId}});
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    const rfqSenderSetting = await prisma.setting.findUnique({ where: { key: 'rfqSenderSetting' } });
    let isAuthorized = false;
    if (user.role === 'Admin' || (rfqSenderSetting?.value as any)?.type === 'all' && user.role === 'Procurement_Officer') {
        isAuthorized = true;
    } else if ((rfqSenderSetting?.value as any)?.type === 'specific' && (rfqSenderSetting.value as any).userId === userId) {
        isAuthorized = true;
    }

    if (!isAuthorized) {
        return NextResponse.json({ error: 'Unauthorized to perform this action.' }, { status: 403 });
    }

    const transactionResult = await prisma.$transaction(async (tx) => {
        return await promoteStandbyVendor(tx, requisitionId, user);
    });

    return NextResponse.json({ message: 'Award change handled successfully.', details: transactionResult });
  } catch (error) {
    console.error('Failed to handle award change:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
