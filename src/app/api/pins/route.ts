
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';

export async function GET(request: Request) {
    try {
        const actor = await getActorFromToken(request);
        if (!actor) {
            return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
        }

        const pins = await prisma.directorPin.findMany({
            where: {
                userId: actor.id,
                status: 'Active',
            }
        });

        // The 'pin' field is included for display purposes on the dashboard as per the implementation.
        // In a real production system with secure delivery, you would not send the plain pin.
        return NextResponse.json(pins);

    } catch (error) {
        console.error('Failed to fetch director pins:', error);
        if (error instanceof Error && error.message.includes('Unauthorized')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        return NextResponse.json({ error: 'Failed to fetch PINs' }, { status: 500 });
    }
}
