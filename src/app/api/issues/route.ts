
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const actor = await getActorFromToken(request);
    if (!actor || !(actor.roles as string[]).includes('Admin')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const issues = await prisma.systemIssue.findMany({
      include: {
        submittedBy: {
          select: {
            name: true,
            email: true,
          }
        }
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json(issues);
  } catch (error) {
    console.error("Failed to fetch system issues:", error);
    return NextResponse.json({ error: "Failed to fetch issues" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await getActorFromToken(request);
    if (!actor) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { title, description, priority } = body;

    if (!title || !description || !priority) {
      return NextResponse.json({ error: 'Title, description, and priority are required.' }, { status: 400 });
    }

    const newIssue = await prisma.systemIssue.create({
      data: {
        title,
        description,
        priority,
        status: 'Open',
        submittedById: actor.id,
      },
    });

    return NextResponse.json(newIssue, { status: 201 });
  } catch (error) {
    console.error("Failed to create issue:", error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
```