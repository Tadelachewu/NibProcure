
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const vendorId = params.id;
  try {
    const body = await request.json();
    const { name, contactPerson, phone, address, licensePath, taxIdPath } = body;

    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
    });

    if (!vendor) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
    }

    const updatedVendor = await prisma.vendor.update({
      where: { id: vendorId },
      data: {
        name,
        contactPerson,
        phone,
        address,
        kycStatus: 'Pending',
        rejectionReason: null,
      },
    });

    const updateOrCreateDocument = async (docName: string, docPath: string) => {
        const existingDoc = await prisma.kYC_Document.findFirst({
            where: {
                vendorId: vendorId,
                name: docName,
            }
        });

        if (existingDoc) {
            await prisma.kYC_Document.update({
                where: { id: existingDoc.id },
                data: { url: docPath, submittedAt: new Date() },
            });
        } else {
            await prisma.kYC_Document.create({
                data: {
                    vendorId,
                    name: docName,
                    url: docPath,
                    submittedAt: new Date(),
                },
            });
        }
    };

    if (licensePath) {
        await updateOrCreateDocument('Business License', licensePath);
    }
    if (taxIdPath) {
        await updateOrCreateDocument('Tax ID Document', taxIdPath);
    }

    await prisma.auditLog.create({
      data: {
        user: { connect: { id: vendor.userId } },
        timestamp: new Date(),
        action: 'RESUBMIT_KYC',
        entity: 'Vendor',
        entityId: vendorId,
        details: `Vendor ${name} resubmitted their KYC documents and profile for verification.`,
      },
    });

    return NextResponse.json({ message: 'Profile updated and resubmitted for verification.' });
  } catch (error) {
    console.error('Failed to resubmit KYC:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
