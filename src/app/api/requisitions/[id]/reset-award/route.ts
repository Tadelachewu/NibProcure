

import { NextResponse } from 'next/server';
import { auditLogs, quotations, requisitions } from '@/lib/data-store';
import { users } from '@/lib/auth-store';


export async function POST(
  request: Request,
  context: { params: any }
) {
  const params = await context.params;
  console.log(`POST /api/requisitions/${params.id}/reset-award`);
  try {
    const requisitionId = params.id;
    const body = await request.json();
    console.log('Request body:', body);
    const { userId } = body;

    const user = users.find(u => u.id === userId);
    if (!user) {
      console.error('User not found for ID:', userId);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const requisition = requisitions.find(r => r.id === requisitionId);
    if (!requisition) {
      console.error('Requisition not found for ID:', requisitionId);
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
    }
    console.log('Found requisition to reset:', requisition);

    let quotesResetCount = 0;
    quotations.forEach(q => {
      if (q.requisitionId === requisitionId) {
        q.status = 'Submitted';
        quotesResetCount++;
      }
    });
    console.log(`Reset ${quotesResetCount} quotes to 'Submitted' status.`);

    requisition.status = 'Approved';
    requisition.updatedAt = new Date();
    console.log(`Requisition ${requisitionId} status reverted to 'Approved'.`);

    const auditDetails = `changed the award decision for requisition ${requisitionId}, reverting all quotes to Submitted.`;

    const auditLogEntry = {
      id: `log-${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
      user: user.name,
      role: user.role,
      action: 'RESET_AWARD',
      entity: 'Requisition',
      entityId: requisitionId,
      details: auditDetails,
    };
    auditLogs.unshift(auditLogEntry);
    console.log('Added audit log:', auditLogEntry);

    return NextResponse.json({ message: 'Award reset successfully', requisition });
  } catch (error) {
    console.error('Failed to reset award:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
