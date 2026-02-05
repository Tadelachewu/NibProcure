
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auditLogs } from '@/lib/data-store';
import { users } from '@/lib/auth-store';
import { PurchaseOrderStatus } from '@/lib/types';

export async function GET(request: Request, context: { params: any }) {
    try {
        const params = await context.params;
        const id = params?.id as string | undefined;
        if (!id || typeof id !== 'string') {
            console.error('GET /app/api/purchase-orders/[id] missing or invalid id', { method: request.method, url: (request as any).url, params });
            return NextResponse.json({ error: 'Missing or invalid id' }, { status: 400 });
        }

        const po = await prisma.purchaseOrder.findUnique({
            where: { id },
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
        console.error('Failed to fetch PO:', error);
        return NextResponse.json({ error: 'Failed to fetch purchase order' }, { status: 500 });
    }
}


export async function PATCH(request: Request, context: { params: any }) {
    try {
        const params = await context.params;
        const poId = params?.id as string | undefined;
        if (!poId || typeof poId !== 'string') {
            console.error('PATCH /app/api/purchase-orders/[id] missing or invalid id', { method: request.method, url: (request as any).url, params });
            return NextResponse.json({ error: 'Missing or invalid id' }, { status: 400 });
        }
        const body = await request.json();
        const { status, userId } = body;

        const validStatuses: PurchaseOrderStatus[] = ['On Hold', 'Cancelled'];
        if (!validStatuses.includes(status)) {
            return NextResponse.json({ error: 'Invalid or unsupported status for manual update.' }, { status: 400 });
        }

        const user = users.find(u => u.id === userId);
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const poToUpdate = await prisma.purchaseOrder.findUnique({ where: { id: poId } });
        if (!poToUpdate) {
            return NextResponse.json({ error: 'Purchase Order not found' }, { status: 404 });
        }

        const oldStatus = poToUpdate.status;
        const updatedPO = await prisma.purchaseOrder.update({
            where: { id: poId },
            data: { status: status.replace(/ /g, '_') as any }
        });

        const auditLogEntry = {
            id: `log-${Date.now()}-${Math.random()}`,
            timestamp: new Date(),
            user: user.name,
            role: user.role,
            action: 'UPDATE_PO_STATUS',
            entity: 'PurchaseOrder',
            entityId: poId,
            details: `Updated PO status from "${oldStatus}" to "${status}".`,
        };
        auditLogs.unshift(auditLogEntry);

        return NextResponse.json(updatedPO);
    } catch (error) {
        console.error('Failed to update PO status:', error);
        if (error instanceof Error) {
            return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 400 });
        }
        return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
    }
}

