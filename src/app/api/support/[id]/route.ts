
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';

// PATCH to respond to a ticket (admin only)
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
    try {
        const actor = await getActorFromToken(request);
        if (!actor || !(actor.roles as string[]).includes('Admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const ticketId = params.id;
        const body = await request.json();
        const { response, status, adminId } = body;

        if (!response || !status) {
            return NextResponse.json({ error: 'Response and status are required.' }, { status: 400 });
        }
        
        const validStatuses = ['In_Progress', 'Closed'];
        if (!validStatuses.includes(status)) {
            return NextResponse.json({ error: 'Invalid status provided.' }, { status: 400 });
        }

        const updatedTicket = await prisma.supportTicket.update({
            where: { id: ticketId },
            data: {
                response,
                status,
                adminId: adminId,
                updatedAt: new Date(),
            }
        });
        
        // Here you would typically trigger an email notification to the user

        return NextResponse.json(updatedTicket);

    } catch (error) {
        console.error("Failed to update ticket:", error);
        return NextResponse.json({ error: 'Failed to update support ticket' }, { status: 500 });
    }
}
