
'use server';

import 'dotenv/config';
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

        const isAdmin = (actor.roles as string[]).includes('Admin');
        
        const whereClause = isAdmin ? {} : { requesterId: actor.id };

        const tickets = await prisma.supportTicket.findMany({
            where: whereClause,
            include: {
                requester: { select: { name: true, email: true } },
                admin: { select: { name: true } },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        return NextResponse.json(tickets);
    } catch (error) {
        console.error("Failed to fetch tickets:", error);
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
        const { subject, message } = body;

        if (!subject || !message) {
            return NextResponse.json({ error: 'Subject and message are required' }, { status: 400 });
        }

        const newTicket = await prisma.supportTicket.create({
            data: {
                subject,
                message,
                status: 'Open',
                requesterId: actor.id,
            }
        });

        return NextResponse.json(newTicket, { status: 201 });

    } catch (error) {
        console.error("Failed to create ticket:", error);
        return NextResponse.json({ error: 'Failed to create support ticket' }, { status: 500 });
    }
}
