
"use server";

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

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

    // Ensure there's a User record to satisfy the Vendor.user relation
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Create a lightweight user for the vendor
      const rawPassword = Math.random().toString(36).slice(2, 12);
      const hashedPassword = await bcrypt.hash(rawPassword, 10);

      const vendorRole = await prisma.role.findUnique({ where: { name: 'Vendor' } });
      if (!vendorRole) {
        return NextResponse.json({ error: 'Vendor role not found. Please seed the database.' }, { status: 500 });
      }

      user = await prisma.user.create({
        data: {
          name: name,
          email: email,
          password: hashedPassword,
          roles: { connect: { id: vendorRole.id } }
        }
      });
    }

    const newVendor = await prisma.vendor.create({
        data: {
          name,
          contactPerson,
          email,
          phone,
          address,
          user: { connect: { id: user.id } },
          kycStatus: 'Pending',
          kycDocuments: {
              create: [
                 { name: 'Business License', url: '#', submittedAt: new Date() },
                 { name: 'Tax ID Document', url: '#', submittedAt: new Date() },
              ]
          }
        }
    });

    // link back vendorId on user
    await prisma.user.update({ where: { id: user.id }, data: { vendorId: newVendor.id } });

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
