
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';


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
        quotations: { // Include quotations to show award details
            include: {
                items: true,
            }
        },
        purchaseOrders: { // Include POs to link to them
            select: {
                id: true,
                vendor: { select: { name: true }}
            }
        }
      }
    });

    if (!requisition) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
    }
    
    // Formatting data to match client-side expectations
    const formatted = {
        ...requisition,
        requesterName: requisition.requester.name || 'Unknown',
        financialCommitteeMemberIds: requisition.financialCommitteeMembers.map(m => m.id),
        technicalCommitteeMemberIds: requisition.technicalCommitteeMembers.map(m => m.id),
    };

    return NextResponse.json(formatted);
  } catch (error) {
     console.error('Failed to fetch requisition:', error instanceof Error ? error.message : 'An unknown error occurred');
    return NextResponse.json({ error: 'An internal server error occurred' }, { status: 500 });
  }
}
