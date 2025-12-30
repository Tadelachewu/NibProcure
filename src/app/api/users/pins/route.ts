
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';

export async function GET(request: Request) {
    try {
        const actor = await getActorFromToken(request);
        if (!actor) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const pins = await prisma.directorPin.findMany({
            where: {
                userId: actor.id,
                expiresAt: {
                    gt: new Date(), // Only fetch non-expired pins
                },
            },
            orderBy: {
                createdAt: 'desc',
            }
        });

        return NextResponse.json(pins);

    } catch (error) {
        console.error('Failed to fetch director pins:', error);
        if (error instanceof Error && error.message.includes('Unauthorized')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        return NextResponse.json({ error: 'An internal server error occurred' }, { status: 500 });
    }
}
