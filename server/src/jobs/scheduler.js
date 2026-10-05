import cron from 'node-cron';
import env from '../config/env.js';
import logger from '../config/logger.js';
import { runMonthlyReports } from '../services/monthlyReport.js';

let task;

/** 09:00 on the 1st of every month: email everyone last month's summary. */
export function startScheduler() {
  if (!env.ENABLE_CRON || task) return;
  task = cron.schedule(
    '0 9 1 * *',
    () => {
      runMonthlyReports().catch((err) => logger.error({ err }, 'monthly report job crashed'));
    },
    { timezone: env.CRON_TIMEZONE, name: 'monthly-summary' },
  );
  logger.info(`Monthly summary scheduled for 09:00 on the 1st (${env.CRON_TIMEZONE})`);
}

export function stopScheduler() {
  task?.stop();
  task = undefined;
}
