
import { NextResponse } from 'next/server';
import { performThreeWayMatch } from '@/services/matching-service';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const invoiceId = searchParams.get('invoiceId');
  
  if (!invoiceId) {
    return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 });
  }

  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const po = await prisma.purchaseOrder.findUnique({
      where: { id: invoice.purchaseOrderId },
      include: {
        items: true,
        receipts: { include: { items: true } },
        invoices: { include: { items: true } },
      }
    });

    if (!po) {
      const pendingResult = {
          poId: invoice.purchaseOrderId,
          status: 'Pending' as const,
          quantityMatch: false,
          priceMatch: false,
          details: { }
      };
      return NextResponse.json(pendingResult);
    }
    
    const result = performThreeWayMatch(po as any);
    return NextResponse.json(result);

  } catch (error) {
    console.error('Failed to perform matching:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}

export async function POST(request: Request) {
    try {
        const actor = await getActorFromToken(request);
        if (!actor || !(actor.roles as string[]).includes('Finance')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const body = await request.json();
        const { poId } = body;

        const po = await prisma.purchaseOrder.update({
            where: { id: poId },
            data: { status: 'Matched' },
            include: {
                items: true,
                receipts: { include: { items: true } },
                invoices: { include: { items: true } },
            }
        });

        if (!po) {
            return NextResponse.json({ error: 'Purchase Order not found' }, { status: 404 });
        }
        
        await prisma.auditLog.create({
            data: {
                timestamp: new Date(),
                user: { connect: { id: actor.id } },
                action: 'MANUAL_MATCH',
                entity: 'PurchaseOrder',
                entityId: po.id,
                details: `Manually resolved and marked PO as Matched.`,
            }
        });

        const result = performThreeWayMatch(po as any);
        return NextResponse.json(result);
    } catch (error) {
        console.error('Failed to resolve mismatch:', error);
        if (error instanceof Error) {
            return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 400 });
        }
        return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
    }
}
