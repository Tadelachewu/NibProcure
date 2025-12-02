
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';
import { UserRole } from '@/lib/types';

export async function GET(request: Request) {
  try {
    const actor = await getActorFromToken(request);
    if (!actor || !(actor.roles as UserRole[]).some(role => ['Admin', 'Procurement_Officer'].includes(role))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const logs = await prisma.auditLog.findMany({
      include: {
        user: {
            include: {
                roles: true
            }
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
    });

    const formattedLogs = logs.map(log => ({
        ...log,
        user: log.user?.name || 'System', // Fallback for system actions
        role: log.user?.roles.map(r => r.name).join(', ').replace(/_/g, ' ') || 'System',
    }));

    return NextResponse.json(formattedLogs);
  } catch (error) {
    console.error("Failed to fetch audit logs:", error);
    return NextResponse.json({ error: "Failed to fetch audit logs" }, { status: 500 });
  }
}
