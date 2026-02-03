import cron from 'node-cron';
import { prisma } from '@/lib/prisma';
import { differenceInHours, isPast } from 'date-fns';
import { sendEmail } from './email-service';
import { handleAwardRejection } from './award-service';

let cronStarted = false;

/*
  Cron rules:
  - Send a reminder to awarded vendors 24 hours before `awardResponseDeadline`.
  - If the award response deadline has passed, auto-decline the award.
  - Support both single-vendor awards and per-item awards.
  - Use a system actor (Admin or first user) for audit log entries.
  - Avoid unsupported Prisma JSON[] filters by reading `perItemAwardDetails` in JS.
*/

export function startDeadlineCronJob() {
  if (cronStarted) return;
  cronStarted = true;
  // Schedule the extracted job
  cron.schedule('5 * * * *', () => {
    void executeAwardDeadlineJob();
  });

  console.log('[CRON] Award-deadline cron job scheduled.');
}

// Extracted job so it can be invoked manually for testing
export async function executeAwardDeadlineJob() {
  console.log(`[CRON ${new Date().toISOString()}] Running award-deadline job...`);

  const now = new Date();
  const in24h = new Date(Date.now() + 24 * 60 * 60 * 1000);

  try {
    // Resolve system actor for audit logs
    const systemActor = await prisma.user.findFirst({ where: { roles: { some: { name: 'Admin' } } } })
      || await prisma.user.findFirst();
    if (!systemActor) {
      console.warn('[CRON] No system user found; auto-decline actions will be skipped to avoid audit failures.');
    }

    // Fetch requisitions with deadlines within 24h or already passed.
    const requisitions = await prisma.purchaseRequisition.findMany({
      where: { awardResponseDeadline: { not: null, lte: in24h } },
      include: { quotations: { include: { items: true, vendor: true } }, items: true },
    });

    for (const req of requisitions) {
      try {
        if (!req.awardResponseDeadline) continue;
        const deadline = new Date(req.awardResponseDeadline);

        // Build per-item award map: vendorId -> [requisitionItemId]
        const perItemVendorMap: Record<string, string[]> = {};
        for (const item of req.items || []) {
          const details = (item.perItemAwardDetails as any) || [];
          for (const d of details) {
            if (!d || !d.vendorId) continue;
            if (d.status === 'Awarded' || d.status === 'Pending_AWARD') {
              perItemVendorMap[d.vendorId] = perItemVendorMap[d.vendorId] || [];
              perItemVendorMap[d.vendorId].push(item.id);
            }
          }
        }

        // Whole-award awarded quotations
        const awardedQuotations = (req.quotations || []).filter(q => q.status === 'Awarded');

        // Vendors to check: union of awarded quotation vendors and per-item vendors
        const vendorIdsToCheck = new Set<string>();
        awardedQuotations.forEach(q => vendorIdsToCheck.add(q.vendorId));
        Object.keys(perItemVendorMap).forEach(v => vendorIdsToCheck.add(v));

        const vendorsNeedingAction: { vendorId: string; quotation?: any; itemIds: string[] }[] = [];
        for (const vendorId of vendorIdsToCheck) {
          const quote = awardedQuotations.find(q => q.vendorId === vendorId);
          const hasResponded = !!(quote && (quote as any).respondedAt);
          const itemIds = perItemVendorMap[vendorId] || [];
          if (!hasResponded) vendorsNeedingAction.push({ vendorId, quotation: quote, itemIds });
        }

        // Auto-decline when deadline passed
        if (isPast(deadline)) {
          if (!systemActor) {
            console.warn(`[CRON] Deadline passed for req ${req.id} but no system actor found; skipping declines.`);
            continue;
          }

          if (vendorsNeedingAction.length === 0) continue;
          console.log(`[CRON] Auto-declining awards for requisition ${req.id} (deadline passed)`);

          for (const v of vendorsNeedingAction) {
            try {
              await prisma.$transaction(async (tx) => {
                // Ensure we have a fresh quotation object inside the transaction when possible
                let quoteForCall = v.quotation;
                if (quoteForCall && quoteForCall.id) {
                  quoteForCall = await tx.quotation.findUnique({ where: { id: quoteForCall.id }, include: { items: true, vendor: true } }) as any;
                } else if ((!v.itemIds || v.itemIds.length === 0) && v.vendorId) {
                  // whole-award expected but no quotation included; try to find awarded quotation for this vendor
                  quoteForCall = await tx.quotation.findFirst({ where: { requisitionId: req.id, vendorId: v.vendorId, status: 'Awarded' }, include: { items: true, vendor: true } }) as any;
                }

                if (v.itemIds && v.itemIds.length > 0) {
                  await handleAwardRejection(tx as any, quoteForCall || { id: null, vendorId: v.vendorId, items: [] }, req, systemActor, v.itemIds, 'System', 'Award automatically declined due to missed response deadline.');
                  console.log(`[CRON] Auto-declined per-item award(s) for vendor ${v.vendorId} on req ${req.id}`);
                } else {
                  const declinedIds = (quoteForCall && quoteForCall.items && quoteForCall.items.map((it: any) => it.requisitionItemId)) || req.items.map(i => i.id);
                  if (!quoteForCall) {
                    console.warn(`[CRON] No awarded quotation found for vendor ${v.vendorId} on req ${req.id}; declining requisition items by id.`);
                  }
                  await handleAwardRejection(tx as any, quoteForCall || { id: null, vendorId: v.vendorId, items: [] }, req, systemActor, declinedIds, 'System', 'Award automatically declined due to missed response deadline.');
                  console.log(`[CRON] Auto-declined whole award for vendor ${v.vendorId} on req ${req.id}`);
                }
              });
            } catch (err) {
              console.error(`[CRON] Failed to auto-decline for vendor ${v.vendorId} on req ${req.id}:`, err);
            }
          }

          continue;
        }

        // Reminders within 24 hours
        const hoursLeft = differenceInHours(deadline, now);
        if (hoursLeft <= 24 && !req.deadlineReminderSentAt) {
          for (const v of vendorsNeedingAction) {
            try {
              const vendorEmail = (v.quotation && v.quotation.vendor && v.quotation.vendor.email) || null;
              if (!vendorEmail) {
                console.warn(`[CRON] No email for vendor ${v.vendorId} on req ${req.id}; skipping reminder.`);
                continue;
              }

              await sendEmail({
                to: vendorEmail,
                subject: `Reminder: Response Deadline for Award (Requisition ${req.title})`,
                html: `<p>The deadline to respond to the award for requisition <strong>${req.title}</strong> is <strong>${deadline.toUTCString()}</strong> (${hoursLeft} hours remaining). Please accept or decline the award on the portal.</p>`,
              });
              console.log(`[CRON] Sent award response reminder to vendor ${v.vendorId} (${vendorEmail}) for req ${req.id}`);
            } catch (err) {
              console.error(`[CRON] Failed sending reminder to vendor ${v.vendorId} for req ${req.id}:`, err);
            }
          }

          try {
            await prisma.purchaseRequisition.update({ where: { id: req.id }, data: { deadlineReminderSentAt: new Date() } });
          } catch (err) {
            console.error(`[CRON] Failed to mark deadlineReminderSentAt for req ${req.id}:`, err);
          }
        }
      } catch (err) {
        console.error(`[CRON] Error processing requisition ${req.id}:`, err);
      }
    }
  } catch (err) {
    console.error('[CRON] Failed to run award-deadline job:', err);
  }
}

// Convenience exported helper to trigger the job from dev routes or scripts
export async function runDeadlineJobNow() {
  await executeAwardDeadlineJob();
}
