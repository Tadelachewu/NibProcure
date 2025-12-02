
'use server';

import { NextResponse } from 'next/server';
import { resetData } from '@/lib/data-store';

export async function POST() {
  try {
    // This is a development-only endpoint and should be protected.
    // In a real app, this would be behind an admin guard and have environment checks.
    console.log('POST /api/reset-data - Resetting all application data.');
    resetData();
    return NextResponse.json({ message: 'Demo data has been reset successfully.' }, { status: 200 });
  } catch (error) {
    console.error('Failed to reset data:', error instanceof Error ? error.message : 'An unknown error occurred');
    return NextResponse.json({ error: 'An internal server error occurred' }, { status: 500 });
  }
}
