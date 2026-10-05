import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import env from '../config/env.js';

const base = {
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.isTest,
  handler: (_req, res, _next, options) =>
    res.status(options.statusCode).json({ error: 'Too many requests, please slow down.', code: 'RATE_LIMITED' }),
};

const userOrIp = (req) => (req.user ? `u:${req.user._id}` : ipKeyGenerator(req.ip));

/** Login / register / password reset: brute-force protection per IP. */
export const authLimiter = rateLimit({ ...base, windowMs: 15 * 60 * 1000, limit: 30 });

/** Emails that a user can trigger (resend verification, forgot password). */
export const emailLimiter = rateLimit({ ...base, windowMs: 60 * 60 * 1000, limit: 8 });

/** Groq calls cost money - cap per user. */
export const aiLimiter = rateLimit({ ...base, windowMs: 60 * 1000, limit: 20, keyGenerator: userOrIp });

/** General API ceiling. */
export const apiLimiter = rateLimit({ ...base, windowMs: 60 * 1000, limit: 600, keyGenerator: userOrIp });
