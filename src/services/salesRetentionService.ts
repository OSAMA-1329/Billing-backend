import { SalesInvoice } from '../models/SalesInvoice.js';

export interface SalesRetentionResult {
  dryRun: boolean;
  cutoff: Date;
  matchedCount: number;
  deletedCount: number;
  candidates?: { _id: unknown; invoiceNumber: string; createdAt: Date }[];
}

export function getSalesRetentionCutoff(now: Date, months: number): Date {
  if (!Number.isFinite(now.getTime())) throw new Error('A valid current date is required');
  if (!Number.isInteger(months) || months < 1) throw new Error('Retention months must be a positive integer');

  const cutoff = new Date(now);
  const day = cutoff.getUTCDate();
  cutoff.setUTCDate(1);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  const finalDay = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0)).getUTCDate();
  cutoff.setUTCDate(Math.min(day, finalDay));
  return cutoff;
}

export async function runSalesRetention(options: {
  months?: number;
  dryRun?: boolean;
  now?: Date;
} = {}): Promise<SalesRetentionResult> {
  const months = options.months ?? Number(process.env.SALES_RETENTION_MONTHS || 10);
  const dryRun = options.dryRun ?? process.env.SALES_RETENTION_DRY_RUN !== 'false';
  const cutoff = getSalesRetentionCutoff(options.now ?? new Date(), months);
  const filter = { createdAt: { $type: 'date' as const, $lt: cutoff } };

  console.info(`[sales-retention] started mode=${dryRun ? 'dry-run' : 'delete'} cutoff=${cutoff.toISOString()}`);
  if (dryRun) {
    const candidates = await SalesInvoice.find(filter)
      .select('_id invoiceNumber createdAt')
      .sort({ createdAt: 1 })
      .lean();
    const result = { dryRun, cutoff, matchedCount: candidates.length, deletedCount: 0, candidates };
    console.info(`[sales-retention] dry-run complete candidates=${result.matchedCount}`);
    return result;
  }

  const result = await SalesInvoice.deleteMany(filter);
  const summary = {
    dryRun,
    cutoff,
    matchedCount: result.deletedCount,
    deletedCount: result.deletedCount,
  };
  console.info(`[sales-retention] complete deleted=${summary.deletedCount}`);
  return summary;
}

export function startSalesRetentionScheduler(): () => void {
  let stopped = false;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const scheduleNextRun = () => {
    if (stopped) return;
    const now = new Date();
    const nextMidnightUtc = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1
    ));
    timer = setTimeout(async () => {
      scheduleNextRun();
      if (running) {
        console.warn('[sales-retention] skipped overlapping execution');
        return;
      }
      running = true;
      try {
        await runSalesRetention();
      } catch (error) {
        console.error('[sales-retention] execution failed', error);
      } finally {
        running = false;
      }
    }, nextMidnightUtc.getTime() - now.getTime());
  };

  scheduleNextRun();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}