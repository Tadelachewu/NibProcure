
import { NextResponse } from 'next/server';

export async function POST() {
    return NextResponse.json({ message: "This endpoint is deprecated. Please use `npm run db:reset`." }, { status: 410 });
}
