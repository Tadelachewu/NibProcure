
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken, isAdmin } from '@/lib/auth';

export async function GET() {
    try {
        const settings = await prisma.setting.findMany();
        return NextResponse.json(settings);
    } catch (error) {
        console.error("Failed to fetch settings:", error);
        return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
            const actor = await getActorFromToken(request);
            if (!isAdmin(actor)) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
            }
        
        const body = await request.json();
        const { key, value } = body;

        if (!key || value === undefined) {
            return NextResponse.json({ error: 'Key and value are required.' }, { status: 400 });
        }

        const updatedSetting = await prisma.setting.upsert({
            where: { key },
            update: { value },
            create: { key, value },
        });

        return NextResponse.json(updatedSetting, { status: 200 });

    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
             return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }
        console.error('Failed to save setting:', error);
        if (error instanceof Error) {
            return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
        }
        return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
    }
}
