
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ContractStatus, User } from '@/lib/types';
import { getActorFromToken } from '@/lib/auth';


export async function GET(request: Request) {
    try {
        const actor = await getActorFromToken(request);
        if (!actor || !(actor.roles as string[]).some(role => ['Admin', 'Procurement_Officer'].includes(role))) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }
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
        console.error("Failed to fetch contracts:", error instanceof Error ? error.message : 'An unknown error occurred');
        return NextResponse.json({ error: 'An internal server error occurred' }, { status: 500 });
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
        console.error("Failed to create contract:", error instanceof Error ? error.message : 'An unknown error occurred');
        return NextResponse.json({ error: 'An internal server error occurred' }, { status: 500 });
    }
}
