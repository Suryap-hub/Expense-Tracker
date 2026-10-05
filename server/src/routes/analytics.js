import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { getOverview } from '../services/analytics.js';
import { PERIOD_RE, currentPeriod } from '../utils/dates.js';

const router = Router();
router.use(requireAuth);

router.get('/overview', validate({ query: z.object({ period: z.string().regex(PERIOD_RE, 'period must be YYYY-MM').optional() }) }), async (req, res) => {
  const period = req.valid.query.period || currentPeriod(req.user.timezone);
  res.set('Cache-Control', 'private, no-cache');
  res.json(await getOverview(req.user, period));
});

export default router;
