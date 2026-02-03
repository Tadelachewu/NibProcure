import { NextResponse } from 'next/server';
import { runDeadlineJobNow } from '@/services/cron-service';

export async function GET() {
    if (process.env.NODE_ENV !== 'development') {
        return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    }

    try {
        await runDeadlineJobNow();
        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error('[DEV] run-deadline trigger failed:', err);
        return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
    }
}
