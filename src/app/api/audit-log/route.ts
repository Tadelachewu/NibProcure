
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const logs = await prisma.auditLog.findMany({
      include: {
        user: true, // Include the user who performed the action
      },
      orderBy: {
        timestamp: 'desc',
      },
    });

    const formattedLogs = logs.map(log => ({
        ...log,
        user: log.user?.name || 'System', // Fallback for system actions
        role: log.user?.role?.replace(/_/g, ' ') || 'System',
    }));

    return NextResponse.json(formattedLogs);
  } catch (error) {
    console.error("Failed to fetch audit logs:", error);
    return NextResponse.json({ error: "Failed to fetch audit logs" }, { status: 500 });
  }
}
