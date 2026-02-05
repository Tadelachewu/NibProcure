
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { User } from '@/lib/types';
import { getActorFromToken } from '@/lib/auth';
import { headers } from 'next/headers';


export async function GET(request: Request, context: { params: any }) {
  try {
    const params = await context.params;
    const id = params?.id as string | undefined;
    if (!id || typeof id !== 'string') {
      console.error('GET /api/requisitions/[id] missing or invalid id', { method: request.method, url: (request as any).url, params });
      return NextResponse.json({ error: 'Missing or invalid id' }, { status: 400 });
    }

    // Detect caller (may be a vendor) to determine visibility rules
    let caller: (User & { roles: any[] }) | null = null;
    try {
      const actor = await getActorFromToken(request as any);
      if (actor) caller = actor as any;
    } catch (e) {
      // ignore - caller may be unauthenticated
    }

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
        quotations: {
          include: {
            items: true,
            // include document urls so awarded vendor can view official bid docs
            scores: true,
          }
        },
        purchaseOrders: {
          include: {
            invoices: true,
            receipts: true,
          }
        },
      }
    });

    if (!requisition) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
    }

    // Determine whether caller is the awarded vendor (for single- or per-item awards)
    let isAwardedVendor = false;
    const vendorId = caller?.vendorId;
    try {
      if (vendorId && requisition) {
        const awardStrategy = (requisition as any).rfqSettings?.awardStrategy;
        if (awardStrategy === 'item') {
          isAwardedVendor = (requisition.items || []).some((it: any) => {
            const details = (it.perItemAwardDetails as any[]) || [];
            return details.some(d => d.vendorId === vendorId && ['Accepted', 'Awarded', 'Pending_Award'].includes(d.status));
          });
        } else {
          isAwardedVendor = (requisition.quotations || []).some((q: any) => q.vendorId === vendorId && ['Pending_Award', 'Awarded', 'Accepted'].includes(q.status));
        }
      }
    } catch (e) {
      console.warn('Failed to determine awarded vendor status:', e);
    }

    // If caller is a vendor but not the awarded vendor, hide invoices and other vendors' official docs.
    if (caller?.vendorId && !isAwardedVendor && requisition) {
      // hide invoices on purchase orders
      if (Array.isArray(requisition.purchaseOrders)) {
        requisition.purchaseOrders = requisition.purchaseOrders.map((po: any) => ({ ...po, invoices: [] }));
      }
      // hide other vendors' bid docs
      if (Array.isArray(requisition.quotations)) {
        requisition.quotations = requisition.quotations.map((q: any) => {
          if (q.vendorId !== caller.vendorId) {
            return { ...q, bidDocumentUrl: null, cpoDocumentUrl: null, experienceDocumentUrl: null };
          }
          return q;
        });
      }
    }

    // Formatting data to match client-side expectations
    const formatted = {
      ...requisition,
      status: requisition.status.replace(/_/g, ' '),
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

export async function DELETE(request: Request, context: { params: any }) {
  try {
    const params = await context.params;
    const id = params?.id as string | undefined;
    if (!id || typeof id !== 'string') {
      console.error('DELETE /api/requisitions/[id] missing or invalid id', { method: request.method, url: (request as any).url, params });
      return NextResponse.json({ error: 'Missing or invalid id' }, { status: 400 });
    }
    const body = await request.json();
    const { userId } = body;

    const user: User | null = await prisma.user.findUnique({ where: { id: userId } });
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
    await prisma.evaluationCriteria.deleteMany({ where: { requisitionId: id } });
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
