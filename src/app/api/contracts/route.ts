
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ContractStatus } from '@/lib/types';
import { getActorFromToken } from '@/lib/auth';


export async function GET() {
    try {
        const contracts = await prisma.contract.findMany({
            include: {
                requisition: {
                    select: {
                        title: true
                    }
                },
                vendor: {
                    select: {
                        name: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc',
            }
        });

        const now = new Date();
        const contractsWithStatus = contracts.map(c => {
            let status: ContractStatus = 'Draft';
            if (c.startDate && c.endDate) {
                const startDate = new Date(c.startDate);
                const endDate = new Date(c.endDate);
                if (now >= startDate && now <= endDate) {
                    status = 'Active';
                } else if (now > endDate) {
                    status = 'Expired';
                }
            }
            return { 
                ...c, 
                status,
                // Safely access related properties
                requisition: { title: c.requisition?.title || 'N/A' },
                vendor: { name: c.vendor?.name || 'N/A' },
            };
        });

        return NextResponse.json(contractsWithStatus);
    } catch (error) {
        console.error("Failed to fetch contracts:", error);
        if (error instanceof Error) {
            return NextResponse.json({ error: 'Failed to fetch contracts', details: error.message }, { status: 500 });
        }
        return NextResponse.json({ error: 'An unknown error occurred while fetching contracts' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const actor = await getActorFromToken(request);
        if (!actor || !(actor.roles as string[]).includes('Procurement_Officer')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const body = await request.json();
        const { requisitionId, vendorId, startDate, endDate } = body;

        const newContract = await prisma.contract.create({
            data: {
                contractNumber: `CN-${Date.now()}`, // Generate contract number here
                requisition: { connect: { id: requisitionId } },
                vendor: { connect: { id: vendorId } },
                sender: { connect: { id: actor.id } },
                startDate: new Date(startDate),
                endDate: new Date(endDate),
                status: 'Draft',
            }
        });

        await prisma.auditLog.create({
            data: {
                user: { connect: { id: actor.id } },
                timestamp: new Date(),
                action: 'CREATE_CONTRACT',
                entity: 'Contract',
                entityId: newContract.id,
                details: `Created new draft contract ${newContract.contractNumber} for requisition ${requisitionId}.`,
            }
        });

        return NextResponse.json(newContract, { status: 201 });
    } catch (error) {
        console.error("Failed to create contract:", error);
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }
        if (error instanceof Error) {
            return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 400 });
        }
        return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
    }
}
