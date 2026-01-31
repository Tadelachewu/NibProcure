
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

    // Attach blacklist status from Setting entries
    const vendorIds = vendors.map(v => v.id);
    const blacklistKeys = vendorIds.map(id => `vendor:blacklist:${id}`);
    const blacklistSettings = await prisma.setting.findMany({ where: { key: { in: blacklistKeys } } });
    const blacklistMap: Record<string, any> = {};
    for (const s of blacklistSettings) {
      try {
        const parts = s.key.split(':');
        const vendorId = parts.slice(2).join(':');
        blacklistMap[vendorId] = s.value;
      } catch (e) {
        // ignore
      }
    }

    const enriched = vendors.map(v => ({ ...v, blacklist: blacklistMap[v.id] || null }));
    return NextResponse.json(enriched);
  } catch (error) {
    console.error("Failed to fetch vendors", error);
    return NextResponse.json({ error: 'Failed to fetch vendors' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    let { name, contactPerson, email, phone, address } = body;

    // allow email to be optional from the add-vendor form; generate a unique placeholder when missing
    const cleanedEmail = (typeof email === 'string' ? email.trim() : '') || '';
    const userEmail = cleanedEmail !== '' ? cleanedEmail.toLowerCase() : `vendor+${Date.now()}${Math.random().toString(36).slice(2, 6)}@example.local`;

    // Ensure there's a User record to satisfy the Vendor.user relation
    let user = await prisma.user.findUnique({ where: { email: userEmail } });
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
          email: userEmail,
          password: hashedPassword,
          roles: { connect: { id: vendorRole.id } }
        }
      });
    }

    const newVendor = await prisma.vendor.create({
      data: {
        name,
        contactPerson,
        email: userEmail,
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
