
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { User } from '@/lib/types';


export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { requisitionId, userId } = body;

    const user: User | null = await prisma.user.findUnique({where: {id: userId}});
    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const requisition = await prisma.purchaseRequisition.findUnique({ 
        where: { id: requisitionId },
        include: { quotations: { include: { items: true }} }
    });

    if (!requisition) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
    }

    // This logic now assumes the quote has been accepted by the vendor.
    const acceptedQuote = requisition.quotations?.find(q => q.status === 'Accepted');
    if (!acceptedQuote) {
      return NextResponse.json({ error: 'No accepted quote found for this requisition' }, { status: 400 });
    }

    const vendor = await prisma.vendor.findUnique({ where: { id: acceptedQuote.vendorId } });
    if (!vendor) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
    }

    const newPO = await prisma.purchaseOrder.create({
        data: {
            transactionId: requisition.transactionId,
            requisition: { connect: { id: requisition.id } },
            requisitionTitle: requisition.title,
            vendor: { connect: { id: vendor.id } },
            items: {
                create: acceptedQuote.items.map(item => ({
                    requisitionItemId: item.requisitionItemId,
                    name: item.name,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    totalPrice: item.quantity * item.unitPrice,
                    receivedQuantity: 0,
                }))
            },
            totalAmount: acceptedQuote.totalPrice,
            status: 'Issued',
        }
    });
    
    // Check if all awards are accepted to update the main requisition status
    const allAwardedQuotes = await prisma.quotation.findMany({
        where: {
            requisitionId: requisition.id,
            status: { in: ['Awarded', 'Partially_Awarded', 'Pending_Award'] }
        }
    });

    if (allAwardedQuotes.length === 0) {
            await prisma.purchaseRequisition.update({
            where: { id: requisitionId },
            data: {
                // This status update indicates all parts of the req have a PO.
                status: 'PO_Created',
            }
        });
    }

    await prisma.auditLog.create({
        data: {
            transactionId: requisition.transactionId,
            timestamp: new Date(),
            user: { connect: { id: user.id } },
            action: 'CREATE_PO',
            entity: 'PurchaseOrder',
            entityId: newPO.id,
            details: `Created Purchase Order for requisition ${requisitionId} after vendor acceptance.`,
        }
    });

    return NextResponse.json(newPO, { status: 201 });
  } catch (error) {
    console.error('Failed to create purchase order:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}

export async function GET() {
    try {
        const purchaseOrders = await prisma.purchaseOrder.findMany({
            include: {
                vendor: true,
                items: true,
                receipts: { include: { items: true } },
                invoices: { include: { items: true } },
            },
            orderBy: {
                createdAt: 'desc'
            }
        });
        return NextResponse.json(purchaseOrders);
    } catch (error) {
        console.error('Failed to fetch purchase orders:', error);
        if (error instanceof Error) {
            return NextResponse.json({ error: 'Failed to fetch purchase orders', details: error.message }, { status: 500 });
        }
        return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
    }
}
