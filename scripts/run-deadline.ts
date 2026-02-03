import 'dotenv/config';
import { runDeadlineJobNow } from '../src/services/cron-service';

(async () => {
    try {
        console.log('[SCRIPT] Triggering deadline job now...');
        await runDeadlineJobNow();
        console.log('[SCRIPT] Deadline job completed.');
        process.exit(0);
    } catch (err) {
        console.error('[SCRIPT] Deadline job failed:', err);
        process.exit(1);
    }
})();
