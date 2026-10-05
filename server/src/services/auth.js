import crypto from 'node:crypto';
import env from '../config/env.js';
import { signAccessToken } from '../middleware/auth.js';
import Session from '../models/Session.js';
import { randomToken, sha256 } from '../utils/crypto.js';

export const REFRESH_COOKIE = 'sw_rt';
// Two tabs refreshing at the same moment both send the same token. Inside this
// window the second request is treated as a harmless race, not token theft.
const REUSE_GRACE_MS = 15_000;

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProd || env.COOKIE_SAMESITE === 'none',
    sameSite: env.COOKIE_SAMESITE,
    path: '/api/auth',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}

export async function createSession(user, req, family = crypto.randomUUID()) {
  const token = randomToken(48);
  await Session.create({
    userId: user._id,
    tokenHash: sha256(token),
    family,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
    userAgent: req.get('user-agent')?.slice(0, 200),
    ip: req.ip,
  });
  return token;
}

/** Issue access token + refresh cookie for a freshly authenticated user. */
export async function startSession(res, req, user) {
  const refreshToken = await createSession(user, req);
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
  return signAccessToken(user);
}

/**
 * Rotate a refresh token. Returns { userId, newToken | null } or throws a
 * reason string: 'invalid' | 'reused'.
 */
export async function rotateRefreshToken(token, req) {
  const tokenHash = sha256(token);
  // Atomically mark the token as used so concurrent refreshes can't both rotate it.
  const session = await Session.findOneAndUpdate(
    { tokenHash, revokedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { revokedAt: new Date(), replacedAt: new Date() } },
  );

  if (session) {
    const newToken = await createSession({ _id: session.userId }, req, session.family);
    return { userId: session.userId, newToken };
  }

  const old = await Session.findOne({ tokenHash });
  if (!old) throw new Error('invalid');
  if (old.replacedAt && Date.now() - old.replacedAt.getTime() < REUSE_GRACE_MS) {
    return { userId: old.userId, newToken: null }; // benign race: keep the cookie the browser already got
  }
  // A rotated token came back long after rotation: assume theft and kill the whole family.
  await Session.updateMany({ family: old.family, revokedAt: null }, { $set: { revokedAt: new Date() } });
  throw new Error('reused');
}

export async function revokeSession(token) {
  if (!token) return;
  await Session.updateOne({ tokenHash: sha256(token), revokedAt: null }, { $set: { revokedAt: new Date() } });
}

export async function revokeAllSessions(userId) {
  await Session.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}
