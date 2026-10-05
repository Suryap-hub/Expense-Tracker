import { Router } from 'express';
import { z } from 'zod';
import env from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { aiLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { getInsights, parseExpenses, suggestCategory } from '../services/ai.js';
import { PERIOD_RE, currentPeriod } from '../utils/dates.js';

const router = Router();
router.use(requireAuth);

router.get('/status', (_req, res) => {
  res.json({ enabled: env.aiEnabled, provider: env.aiEnabled ? 'groq' : null, model: env.aiEnabled ? env.GROQ_MODEL : null });
});

/** Free text or pasted bank SMS -> expense drafts (not saved until the user confirms). */
router.post('/parse', aiLimiter, validate({ body: z.object({ text: z.string().trim().min(2).max(4000) }) }), async (req, res) => {
  const started = Date.now();
  const result = await parseExpenses(req.user, req.valid.body.text);
  res.json({ ...result, ms: Date.now() - started });
});

router.post(
  '/categorize',
  aiLimiter,
  validate({ body: z.object({ merchant: z.string().trim().min(1).max(100), note: z.string().trim().max(500).optional().default('') }) }),
  async (req, res) => {
    res.json(await suggestCategory(req.valid.body.merchant, req.valid.body.note));
  },
);

router.get('/insights', aiLimiter, validate({ query: z.object({ period: z.string().regex(PERIOD_RE).optional() }) }), async (req, res) => {
  res.json(await getInsights(req.user, req.valid.query.period || currentPeriod(req.user.timezone)));
});

export default router;
