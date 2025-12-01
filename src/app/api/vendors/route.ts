
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  console.log('GET /api/vendors - Fetching all vendors.');
  try {
    const vendors = await prisma.vendor.findMany({
        include: {
            kycDocuments: true
        }
    });
    return NextResponse.json(vendors);
  } catch (error) {
    console.error("Failed to fetch vendors");
    return NextResponse.json({ error: 'Failed to fetch vendors' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  console.log('POST /api/vendors - Creating new vendor.');
  try {
    const body = await request.json();
    console.log('Request body:', body);

    const { name, contactPerson, email, phone, address } = body;
    
    // In a real app, this user would be created via the registration flow first
    const tempUserId = `TEMP-USER-${Date.now()}`;

    const newVendor = await prisma.vendor.create({
        data: {
          name,
          contactPerson,
          email,
          phone,
          address,
          userId: tempUserId, // This is a temporary placeholder
          kycStatus: 'Pending',
          kycDocuments: {
              create: [
                 { name: 'Business License', url: '#', submittedAt: new Date() },
                 { name: 'Tax ID Document', url: '#', submittedAt: new Date() },
              ]
          }
        }
    });
    console.log('Created new vendor:', newVendor);

    await prisma.auditLog.create({
        data: {
            // No user to connect yet, as this is a public action
            timestamp: new Date(),
            action: 'CREATE_VENDOR',
            entity: 'Vendor',
            entityId: newVendor.id,
            details: `Added new vendor "${newVendor.name}" (pending verification).`,
        }
    });
    console.log('Added audit log:');

    return NextResponse.json(newVendor, { status: 201 });
  } catch (error) {
    console.error('Failed to create vendor:');
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
