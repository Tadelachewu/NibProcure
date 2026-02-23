
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';

// PATCH to respond to a ticket (admin only)
export async function PATCH(request: Request, context: { params: any }) {
    try {
        const actor = await getActorFromToken(request);
        if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

        const params = await context.params;
        const ticketId = params?.id;
        const body = await request.json();
        const { response, status } = body;

        if (!response || !status) {
            return NextResponse.json({ error: 'Response and status are required.' }, { status: 400 });
        }

        const validStatuses = ['In_Progress', 'Closed'];
        if (!validStatuses.includes(status)) {
            return NextResponse.json({ error: 'Invalid status provided.' }, { status: 400 });
        }

        const roles = (actor.roles as string[] || []);
        const isAdmin = roles.includes('Admin');
        const isProcurement = roles.includes('Procurement_Officer');

        const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
        if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });

        // Admin can respond to admin tickets
        if (isAdmin && (ticket.recipientType === 'Admin' || ticket.recipientType === null)) {
            const updatedTicket = await prisma.supportTicket.update({
                where: { id: ticketId },
                data: { response, status, adminId: actor.id, updatedAt: new Date() },
            });
            return NextResponse.json(updatedTicket);
        }

        // Procurement officer can respond to tickets assigned to them
        if (isProcurement && ticket.recipientType === 'ProcurementOfficer' && ticket.procurementOfficerId === actor.id) {
            const updatedTicket = await prisma.supportTicket.update({
                where: { id: ticketId },
                data: { response, status, procurementResponderId: actor.id, updatedAt: new Date() },
            });
            return NextResponse.json(updatedTicket);
        }

        return NextResponse.json({ error: 'Unauthorized or ticket not assigned to you' }, { status: 403 });

    } catch (error) {
        console.error('Failed to update ticket:', error);
        return NextResponse.json({ error: 'Failed to update support ticket' }, { status: 500 });
    }
}
