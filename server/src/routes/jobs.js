import { Router } from 'express';
import { z } from 'zod';
import env from '../config/env.js';
import { notFound, unauthorized } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { processOutbox } from '../services/email/outbox.js';
import { runMonthlyReports } from '../services/monthlyReport.js';
import { safeEqual } from '../utils/crypto.js';
import { PERIOD_RE } from '../utils/dates.js';

/**
 * Endpoints for an external scheduler (cron-job.org, GitHub Actions, Render
 * Cron) - needed on free hosting where the server sleeps and the in-process
 * cron can't fire. Protected by the CRON_SECRET header.
 */
const router = Router();

router.use((req, _res, next) => {
  if (!env.CRON_SECRET) throw notFound();
  if (!safeEqual(req.get('x-cron-secret') || '', env.CRON_SECRET)) throw unauthorized('Bad cron secret');
  next();
});

router.post('/monthly-summary', validate({ body: z.object({ period: z.string().regex(PERIOD_RE).optional() }) }), async (req, res) => {
  const result = await runMonthlyReports({ period: req.valid.body.period });
  const sent = await processOutbox();
  res.json({ ...result, emailsProcessed: sent });
});

router.post('/process-emails', async (_req, res) => {
  res.json({ emailsProcessed: await processOutbox() });
});

export default router;
