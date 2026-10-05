import crypto from 'node:crypto';
import { promisify } from 'node:util';
import env from '../config/env.js';

/**
 * Password hashing with Node's built-in scrypt (memory-hard, runs on the
 * libuv thread pool so it never blocks the event loop). Parameters follow the
 * OWASP Password Storage Cheat Sheet (N=2^14, r=8, p=5, ~16 MiB).
 * Stored format: scrypt$N$r$p$saltB64$hashB64 - parameters travel with the
 * hash, so they can be raised later without breaking existing users.
 */
const scrypt = promisify(crypto.scrypt);
const KEYLEN = 32;
const PARAMS = env.isTest ? { N: 2 ** 10, r: 8, p: 1 } : { N: 2 ** 14, r: 8, p: 5 };

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const { N, r, p } = PARAMS;
  const hash = await scrypt(password.normalize('NFKC'), salt, KEYLEN, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  return crypto.timingSafeEqual(actual, expected);
}

// Used when the email doesn't exist, so "wrong email" and "wrong password"
// take the same time and can't be told apart by timing.
let dummyHash;
export async function burnPasswordCheck(password) {
  dummyHash ||= await hashPassword('timing-equalizer-password');
  await verifyPassword(password, dummyHash);
}
