
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';
import { PurchaseOrderStatus } from '@/lib/types';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
    try {
        const actor = await getActorFromToken(request);
        if (!actor) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const po = await prisma.purchaseOrder.findUnique({
            where: { id: params.id },
            include: {
                vendor: true,
                items: true,
                receipts: { include: { items: true } },
                invoices: { include: { items: true } },
            },
        });
        if (!po) {
            return NextResponse.json({ error: 'Purchase Order not found' }, { status: 404 });
        }
        return NextResponse.json(po);
    } catch (error) {
        console.error('Failed to fetch PO:');
        return NextResponse.json({ error: 'Failed to fetch purchase order' }, { status: 500 });
    }
}
