
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';

// GET all tickets (for admin) or user-specific tickets
export async function GET(request: Request) {
    try {
        const actor = await getActorFromToken(request);
        if (!actor) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // allow optional scope query param: 'mine' to return tickets requested by the actor
        const reqUrl = new URL(request.url);
        const scope = reqUrl.searchParams.get('scope');

        const roles = (actor.roles as string[] || []);
        const isAdmin = roles.includes('Admin');
        const isProcurement = roles.includes('Procurement_Officer');
        let whereClause: any = {};
        if (scope === 'mine') {
            whereClause = { requesterId: actor.id };
        } else if (isAdmin) {
            // Admin: see tickets addressed to Admin (or legacy where recipientType is null)
            whereClause = { OR: [{ recipientType: 'Admin' }, { recipientType: null }] };
        } else if (isProcurement) {
            // Procurement officer: see tickets assigned to them
            whereClause = { recipientType: 'ProcurementOfficer', procurementOfficerId: actor.id };
        } else {
            // Regular user (including vendors): see tickets they requested
            whereClause = { requesterId: actor.id };
        }

        const tickets = await prisma.supportTicket.findMany({
            where: whereClause,
            include: {
                requester: { select: { name: true, email: true } },
                admin: { select: { name: true } },
                procurementOfficer: { select: { name: true } },
                procurementResponder: { select: { name: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json(tickets);
    } catch (error) {
        console.error("Failed to fetch tickets:", error);
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }
        return NextResponse.json({ error: "Failed to fetch tickets" }, { status: 500 });
    }
}


// POST a new ticket
export async function POST(request: Request) {
    try {
        const actor = await getActorFromToken(request);
        if (!actor) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { subject, message, recipientType, procurementOfficerId } = body;

        if (!subject || !message) {
            return NextResponse.json({ error: 'Subject and message are required' }, { status: 400 });
        }

        // Default recipient is Admin for backward compatibility
        const rt = recipientType === 'ProcurementOfficer' ? 'ProcurementOfficer' : 'Admin';

        const data: any = {
            subject,
            message,
            status: 'Open',
            requesterId: actor.id,
            recipientType: rt,
        };

        if (rt === 'ProcurementOfficer') {
            if (!procurementOfficerId) return NextResponse.json({ error: 'procurementOfficerId is required for ProcurementOfficer recipient' }, { status: 400 });
            data.procurementOfficerId = procurementOfficerId;
        }

        const newTicket = await prisma.supportTicket.create({ data });
        return NextResponse.json(newTicket, { status: 201 });

    } catch (error) {
        console.error("Failed to create ticket:", error);
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }
        return NextResponse.json({ error: 'Failed to create support ticket' }, { status: 500 });
    }
}
