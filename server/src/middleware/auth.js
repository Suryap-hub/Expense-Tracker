import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import User from '../models/User.js';
import { unauthorized } from './error.js';

const ISSUER = 'spendwise-api';
const AUDIENCE = 'spendwise-web';

export function signAccessToken(user) {
  return jwt.sign({ tv: user.tokenVersion ?? 0 }, env.JWT_ACCESS_SECRET, {
    subject: String(user._id),
    expiresIn: `${env.ACCESS_TOKEN_TTL_MIN}m`,
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithm: 'HS256',
  });
}

// Tiny in-process cache so authenticated requests don't hit MongoDB for the
// user on every call. Entries live 30s and are dropped on any profile change.
const userCache = new Map();
const USER_TTL_MS = 30_000;

export function invalidateUserCache(userId) {
  userCache.delete(String(userId));
}

async function loadUser(id) {
  const hit = userCache.get(id);
  if (hit && hit.expires > Date.now()) return hit.user;
  const user = await User.findById(id).lean();
  if (user) {
    if (userCache.size > 10_000) userCache.delete(userCache.keys().next().value);
    userCache.set(id, { user, expires: Date.now() + USER_TTL_MS });
  }
  return user;
}

export async function requireAuth(req, _res, next) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw unauthorized();

  let payload;
  try {
    payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });
  } catch (err) {
    throw unauthorized(err.name === 'TokenExpiredError' ? 'Session expired' : 'Invalid token', {
      code: err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
    });
  }

  const user = await loadUser(payload.sub);
  if (!user || (user.tokenVersion ?? 0) !== payload.tv) {
    throw unauthorized('Session is no longer valid', { code: 'INVALID_TOKEN' });
  }
  req.user = user;
  next();
}
