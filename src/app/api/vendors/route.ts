
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const vendors = await prisma.vendor.findMany({
        include: {
            kycDocuments: true
        }
    });
    return NextResponse.json(vendors);
  } catch (error) {
    console.error("Failed to fetch vendors", error);
    return NextResponse.json({ error: 'Failed to fetch vendors' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, contactPerson, email, phone, address } = body;
    
    const tempUserId = `TEMP-USER-${Date.now()}`;

    const newVendor = await prisma.vendor.create({
        data: {
          name,
          contactPerson,
          email,
          phone,
          address,
          userId: tempUserId,
          kycStatus: 'Pending',
          kycDocuments: {
              create: [
                 { name: 'Business License', url: '#', submittedAt: new Date() },
                 { name: 'Tax ID Document', url: '#', submittedAt: new Date() },
              ]
          }
        }
    });

    await prisma.auditLog.create({
        data: {
            timestamp: new Date(),
            action: 'CREATE_VENDOR',
            entity: 'Vendor',
            entityId: newVendor.id,
            details: `Added new vendor "${newVendor.name}" (pending verification).`,
        }
    });

    return NextResponse.json(newVendor, { status: 201 });
  } catch (error) {
    console.error('Failed to create vendor:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process vendor', details: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
