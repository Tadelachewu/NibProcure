
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
    console.error("Failed to fetch vendors:", error instanceof Error ? error.message : 'An unknown error occurred');
    return NextResponse.json({ error: 'An internal server error occurred' }, { status: 500 });
  }
}
