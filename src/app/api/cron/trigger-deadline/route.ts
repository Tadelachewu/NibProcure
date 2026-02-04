import { NextResponse } from 'next/server';
import { runDeadlineJobNow } from '@/services/cron-service';

// Simple in-memory debounce to avoid repeated runs from many page loads
let lastRunTs: number | null = null;
let running = false;
const MIN_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

export async function POST() {
    const now = Date.now();
    if (running) {
        return NextResponse.json({ ran: false, reason: 'already_running', lastRunTs });
    }
    if (lastRunTs && now - lastRunTs < MIN_INTERVAL_MS) {
        return NextResponse.json({ ran: false, reason: 'debounced', lastRunTs });
    }

    running = true;
    try {
        await runDeadlineJobNow();
        lastRunTs = Date.now();
        return NextResponse.json({ ran: true, lastRunTs });
    } catch (err) {
        console.error('[CRON_TRIGGER] Failed to run deadline job now:', err);
        return NextResponse.json({ ran: false, reason: 'failed', error: String(err) }, { status: 500 });
    } finally {
        running = false;
    }
}
