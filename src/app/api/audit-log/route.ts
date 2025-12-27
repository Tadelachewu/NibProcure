
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
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
