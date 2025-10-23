
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { User } from '@/lib/types';


export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const requisition = await prisma.purchaseRequisition.findUnique({
      where: { id },
      include: {
        items: true,
        customQuestions: true,
        evaluationCriteria: {
          include: {
            financialCriteria: true,
            technicalCriteria: true,
          }
        },
        financialCommitteeMembers: { select: { id: true, name: true, email: true } },
        technicalCommitteeMembers: { select: { id: true, name: true, email: true } },
        requester: true,
      }
    });

    if (!requisition) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
    }
    
    // Formatting data to match client-side expectations
    const formatted = {
        ...requisition,
        // DO NOT format status here. Let the client handle it.
        // status: requisition.status.replace(/_/g, ' '),
        requesterName: requisition.requester.name || 'Unknown',
        financialCommitteeMemberIds: requisition.financialCommitteeMembers.map(m => m.id),
        technicalCommitteeMemberIds: requisition.technicalCommitteeMembers.map(m => m.id),
    };

    return NextResponse.json(formatted);
  } catch (error) {
     console.error('Failed to fetch requisition:', error);
     if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { userId } = body;

    const user: User | null = await prisma.user.findUnique({where: {id: userId}});
    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const requisition = await prisma.purchaseRequisition.findUnique({ where: { id } });

    if (!requisition) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
    }

    if (requisition.requesterId !== userId) {
      return NextResponse.json({ error: 'You are not authorized to delete this requisition.' }, { status: 403 });
    }

    if (requisition.status !== 'Draft' && requisition.status !== 'Pending_Approval') {
      return NextResponse.json({ error: `Cannot delete a requisition with status "${requisition.status}".` }, { status: 403 });
    }
    
    // Need to perform cascading deletes manually if not handled by the database schema
    await prisma.requisitionItem.deleteMany({ where: { requisitionId: id } });
    await prisma.customQuestion.deleteMany({ where: { requisitionId: id } });
    await prisma.evaluationCriteria.deleteMany({ where: { requisitionId: id }});
    // Add other related data deletions if necessary

    await prisma.purchaseRequisition.delete({ where: { id } });

    await prisma.auditLog.create({
        data: {
            user: { connect: { id: user.id } },
            timestamp: new Date(),
            action: 'DELETE_REQUISITION',
            entity: 'Requisition',
            entityId: id,
            details: `Deleted requisition: ${requisition.title}`
        }
    });

    return NextResponse.json({ message: 'Requisition deleted successfully.' });
  } catch (error) {
     console.error('Failed to delete requisition:', error);
     if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
