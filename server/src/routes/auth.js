import { Router } from 'express';
import { z } from 'zod';
import { invalidateUserCache, requireAuth, signAccessToken } from '../middleware/auth.js';
import { AppError, badRequest, unauthorized } from '../middleware/error.js';
import { authLimiter, emailLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { audit } from '../models/AuditLog.js';
import User, { publicUser } from '../models/User.js';
import {
  REFRESH_COOKIE,
  refreshCookieOptions,
  revokeAllSessions,
  revokeSession,
  rotateRefreshToken,
  startSession,
} from '../services/auth.js';
import { enqueueEmail } from '../services/email/outbox.js';
import { passwordChangedTemplate, resetPasswordTemplate, verifyEmailTemplate } from '../services/email/templates.js';
import { burnPasswordCheck, hashPassword, verifyPassword } from '../services/password.js';
import { randomToken, sha256 } from '../utils/crypto.js';

const router = Router();

const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 15 * 60_000;
const VERIFY_TTL_MS = 24 * 60 * 60_000;
const RESET_TTL_MS = 30 * 60_000;

export const emailField = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address').max(254));
export const passwordField = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

const GENERIC_SENT = 'If that email can receive mail from us, a message is on its way.';

async function sendVerification(user) {
  const token = randomToken();
  await User.updateOne(
    { _id: user._id },
    { $set: { emailVerifyTokenHash: sha256(token), emailVerifyExpires: new Date(Date.now() + VERIFY_TTL_MS) } },
  );
  const tpl = verifyEmailTemplate({ name: user.name, token });
  await enqueueEmail({ userId: user._id, type: 'verify_email', to: user.email, ...tpl });
}

// ---------------------------------------------------------------- register
router.post(
  '/register',
  authLimiter,
  validate({
    body: z.object({
      name: z.string().trim().min(1, 'Name is required').max(60),
      email: emailField,
      password: passwordField,
    }),
  }),
  async (req, res) => {
    const { name, email, password } = req.valid.body;
    const existing = await User.findOne({ email });
    if (existing) {
      // Don't reveal whether the email is registered. Unverified accounts get
      // a fresh verification link; verified ones get nothing.
      if (!existing.emailVerified) await sendVerification(existing);
      return res.status(201).json({ message: 'Check your inbox to verify your email.' });
    }
    let user;
    try {
      user = await User.create({ name, email, passwordHash: await hashPassword(password) });
    } catch (err) {
      if (err.code === 11000) return res.status(201).json({ message: 'Check your inbox to verify your email.' });
      throw err;
    }
    await sendVerification(user);
    audit(req, user._id, 'auth.register');
    res.status(201).json({ message: 'Check your inbox to verify your email.' });
  },
);

// ------------------------------------------------------------ verify email
router.post('/verify-email', authLimiter, validate({ body: z.object({ token: z.string().min(10).max(200) }) }), async (req, res) => {
  const user = await User.findOneAndUpdate(
    { emailVerifyTokenHash: sha256(req.valid.body.token), emailVerifyExpires: { $gt: new Date() } },
    { $set: { emailVerified: true, lastLoginAt: new Date() }, $unset: { emailVerifyTokenHash: 1, emailVerifyExpires: 1 } },
    { new: true },
  );
  if (!user) throw badRequest('This verification link is invalid or has expired.', { code: 'INVALID_LINK' });
  invalidateUserCache(user._id);
  audit(req, user._id, 'auth.verify_email');
  const accessToken = await startSession(res, req, user);
  res.json({ accessToken, user: publicUser(user) });
});

router.post('/resend-verification', emailLimiter, validate({ body: z.object({ email: emailField }) }), async (req, res) => {
  const user = await User.findOne({ email: req.valid.body.email });
  if (user && !user.emailVerified) await sendVerification(user);
  res.json({ message: GENERIC_SENT });
});

// ------------------------------------------------------------------- login
router.post(
  '/login',
  authLimiter,
  validate({ body: z.object({ email: emailField, password: z.string().min(1).max(200) }) }),
  async (req, res) => {
    const { email, password } = req.valid.body;
    const user = await User.findOne({ email }).select('+passwordHash +failedLoginAttempts +lockUntil');

    if (!user) {
      await burnPasswordCheck(password);
      throw unauthorized('Incorrect email or password', { code: 'BAD_CREDENTIALS' });
    }
    if (user.lockUntil && user.lockUntil > new Date()) {
      const mins = Math.ceil((user.lockUntil - Date.now()) / 60_000);
      throw new AppError(423, `Too many failed attempts. Try again in ${mins} minute${mins > 1 ? 's' : ''}.`, { code: 'ACCOUNT_LOCKED' });
    }

    if (!(await verifyPassword(password, user.passwordHash))) {
      const attempts = (user.failedLoginAttempts || 0) + 1;
      const update = attempts >= MAX_FAILED_LOGINS
        ? { $set: { failedLoginAttempts: 0, lockUntil: new Date(Date.now() + LOCK_MS) } }
        : { $set: { failedLoginAttempts: attempts } };
      await User.updateOne({ _id: user._id }, update);
      audit(req, user._id, 'auth.login_failed', { meta: { attempts } });
      throw unauthorized('Incorrect email or password', { code: 'BAD_CREDENTIALS' });
    }

    if (!user.emailVerified) {
      throw new AppError(403, 'Please verify your email first. Check your inbox for the link.', { code: 'EMAIL_NOT_VERIFIED' });
    }

    await User.updateOne({ _id: user._id }, { $set: { failedLoginAttempts: 0, lastLoginAt: new Date() }, $unset: { lockUntil: 1 } });
    audit(req, user._id, 'auth.login');
    const accessToken = await startSession(res, req, user);
    res.json({ accessToken, user: publicUser(user) });
  },
);

// ----------------------------------------------------------------- refresh
router.post('/refresh', async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw unauthorized('Not signed in', { code: 'NO_SESSION' });

  let result;
  try {
    result = await rotateRefreshToken(token, req);
  } catch (err) {
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
    if (err.message === 'reused') {
      throw unauthorized('Session ended for your security. Please sign in again.', { code: 'SESSION_REUSED' });
    }
    throw unauthorized('Session expired. Please sign in again.', { code: 'NO_SESSION' });
  }

  const user = await User.findById(result.userId);
  if (!user) throw unauthorized('Account not found', { code: 'NO_SESSION' });
  if (result.newToken) res.cookie(REFRESH_COOKIE, result.newToken, refreshCookieOptions());
  res.json({ accessToken: signAccessToken(user), user: publicUser(user) });
});

// ------------------------------------------------------------------ logout
router.post('/logout', async (req, res) => {
  await revokeSession(req.cookies?.[REFRESH_COOKIE]);
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
  res.status(204).end();
});

router.post('/logout-all', requireAuth, async (req, res) => {
  await Promise.all([revokeAllSessions(req.user._id), User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } })]);
  invalidateUserCache(req.user._id);
  audit(req, req.user._id, 'auth.logout_all');
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
  res.status(204).end();
});

// ---------------------------------------------------------- password reset
router.post('/forgot-password', emailLimiter, validate({ body: z.object({ email: emailField }) }), async (req, res) => {
  const user = await User.findOne({ email: req.valid.body.email });
  if (user) {
    const token = randomToken();
    await User.updateOne(
      { _id: user._id },
      { $set: { passwordResetTokenHash: sha256(token), passwordResetExpires: new Date(Date.now() + RESET_TTL_MS) } },
    );
    const tpl = resetPasswordTemplate({ name: user.name, token });
    await enqueueEmail({ userId: user._id, type: 'password_reset', to: user.email, ...tpl });
    audit(req, user._id, 'auth.password_reset_requested');
  }
  res.json({ message: GENERIC_SENT });
});

router.post(
  '/reset-password',
  authLimiter,
  validate({ body: z.object({ token: z.string().min(10).max(200), password: passwordField }) }),
  async (req, res) => {
    const { token, password } = req.valid.body;
    const user = await User.findOneAndUpdate(
      { passwordResetTokenHash: sha256(token), passwordResetExpires: { $gt: new Date() } },
      {
        $set: { passwordHash: await hashPassword(password), emailVerified: true, failedLoginAttempts: 0 },
        $unset: { passwordResetTokenHash: 1, passwordResetExpires: 1, lockUntil: 1 },
        $inc: { tokenVersion: 1 },
      },
      { new: true },
    );
    if (!user) throw badRequest('This reset link is invalid or has expired.', { code: 'INVALID_LINK' });
    await revokeAllSessions(user._id);
    invalidateUserCache(user._id);
    audit(req, user._id, 'auth.password_reset');
    const tpl = passwordChangedTemplate({ name: user.name });
    await enqueueEmail({ userId: user._id, type: 'password_changed', to: user.email, ...tpl });
    res.json({ message: 'Password updated. You can sign in now.' });
  },
);

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

export default router;
