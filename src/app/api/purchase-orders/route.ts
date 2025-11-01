
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { User } from '@/lib/types';


export async function POST(request: Request) {
  try {
    const body = await request.json();
    // New special property to trigger only the status check
    const { requisitionId, userId, triggerStatusCheck } = body;

    // --- LOGIC TO CHECK AND FINALIZE REQUISITION STATUS ---
    if (triggerStatusCheck && requisitionId) {
        const req = await prisma.purchaseRequisition.findUnique({
            where: { id: requisitionId },
            include: { items: true }
        });
        
        if (req && req.status !== 'PO_Created' && req.status !== 'Closed') {
            const allReqItemIds = new Set(req.items.map(i => i.id));
            
            // Find all PO items across all POs linked to this requisition
            const poItems = await prisma.pOItem.findMany({
                where: { purchaseOrder: { requisitionId: requisitionId } }
            });
            const allPOItemReqIds = new Set(poItems.map(item => item.requisitionItemId));

            const allItemsAccountedFor = [...allReqItemIds].every(id => allPOItemReqIds.has(id));

            if (allItemsAccountedFor) {
                await prisma.purchaseRequisition.update({
                    where: { id: requisitionId },
                    data: { status: 'PO_Created' }
                });
            }
        }
        return NextResponse.json({ status: 'check_complete' });
    }
    
    // --- ORIGINAL LOGIC FOR CREATING A PO (NOW DEPRECATED and moved to respond route) ---
    // This part of the code is kept to avoid breaking changes if it was called from elsewhere,
    // but the primary logic is now handled in the /api/quotations/[id]/respond route.
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
            requisitionId: requisition.id,
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

    await prisma.auditLog.create({
        data: {
            transactionId: requisition.transactionId,
            timestamp: new Date(),
            user: { connect: { id: user.id } },
            action: 'CREATE_PO',
            entity: 'PurchaseOrder',
            entityId: newPO.id,
            details: `Created Purchase Order for requisition ${requisitionId}.`,
        }
    });

    // Trigger the status check after creation
     await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/purchase-orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ triggerStatusCheck: true, requisitionId: newPO.requisitionId })
        });


    return NextResponse.json(newPO, { status: 201 });
  } catch (error) {
    console.error('Failed to create/check purchase order:', error);
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
