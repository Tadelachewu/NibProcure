
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';
import { UserRole } from '@/lib/types';

interface OpenBidsRequest {
    pins: { role: UserRole, pin: string }[];
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const actor = await getActorFromToken(request);
    if (!actor || !(actor.roles as string[]).some(r => r === 'Procurement_Officer' || r === 'Admin')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const requisitionId = params.id;
    const { pins } = await request.json() as OpenBidsRequest;

    if (!pins || pins.length === 0) {
        return NextResponse.json({ error: 'At least one director PIN is required.' }, { status: 400 });
    }
    
    // In a real scenario, you might require a quorum (e.g., 2 out of 3)
    // For now, we'll require all specified roles.
    const requiredRoles: UserRole[] = [
        'Finance_Director',
        'Facility_Director',
        'Director_Supply_Chain_and_Property_Management'
    ];

    if (pins.length < requiredRoles.length) {
        return NextResponse.json({ error: `All ${requiredRoles.length} director PINs are required to open bids.`}, { status: 400 });
    }

    let validPins = 0;
    for (const pinInfo of pins) {
        const director = await prisma.user.findFirst({
            where: { roles: { some: { name: pinInfo.role } } }
        });

        if (!director) {
            console.warn(`No user found for role: ${pinInfo.role}`);
            continue;
        }

        const storedPin = await prisma.directorPin.findUnique({
            where: {
                userId_requisitionId: {
                    userId: director.id,
                    requisitionId,
                }
            }
        });

        if (storedPin && storedPin.pin === pinInfo.pin) {
            validPins++;
        }
    }

    if (validPins < requiredRoles.length) {
        return NextResponse.json({ error: 'Invalid PINs provided. Bid opening denied.' }, { status: 403 });
    }

    // All PINs are valid, update the requisition status
    const updatedRequisition = await prisma.purchaseRequisition.update({
        where: { id: requisitionId },
        data: {
            bidsOpened: true,
            status: 'Scoring_In_Progress'
        }
    });

    await prisma.auditLog.create({
        data: {
            user: { connect: { id: actor.id } },
            timestamp: new Date(),
            action: 'OPEN_BIDS',
            entity: 'Requisition',
            entityId: requisitionId,
            details: `Bids for requisition ${requisitionId} were opened and unsealed after successful PIN verification.`,
            transactionId: requisitionId
        }
    });

    return NextResponse.json({ message: 'Bids successfully opened.', requisition: updatedRequisition });

  } catch (error) {
    console.error('Failed to open bids:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
