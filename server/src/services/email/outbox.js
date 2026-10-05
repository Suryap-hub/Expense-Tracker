import env from '../../config/env.js';
import logger from '../../config/logger.js';
import EmailJob from '../../models/EmailJob.js';
import { sendMail } from './mailer.js';

const MAX_ATTEMPTS = 5;
const CONCURRENCY = 3;
const POLL_MS = 10_000;
const STALE_LOCK_MS = 5 * 60_000;
const RETENTION_MS = 30 * 24 * 60 * 60_000;

let timer = null;
let running = false;
let rerun = false;

/** Queue an email. Returns immediately; the worker sends it in the background. */
export async function enqueueEmail({ userId, type, to, subject, html, text }) {
  const job = await EmailJob.create({ userId, type, to, subject, html, text });
  kick();
  return job;
}

/** Atomically claim one due job so two workers never send the same email. */
function claimNext() {
  const now = new Date();
  return EmailJob.findOneAndUpdate(
    {
      $or: [
        { status: 'pending', nextAttemptAt: { $lte: now } },
        { status: 'sending', lockedAt: { $lt: new Date(now - STALE_LOCK_MS) } },
      ],
    },
    { $set: { status: 'sending', lockedAt: now }, $inc: { attempts: 1 } },
    { sort: { nextAttemptAt: 1 }, new: true },
  );
}

async function deliver(job) {
  try {
    const messageId = await sendMail(job);
    await EmailJob.updateOne(
      { _id: job._id },
      { $set: { status: 'sent', sentAt: new Date(), messageId, expireAt: new Date(Date.now() + RETENTION_MS) }, $unset: { lockedAt: 1, lastError: 1 } },
    );
  } catch (err) {
    const final = job.attempts >= MAX_ATTEMPTS;
    // Exponential backoff: 1m, 2m, 4m, 8m
    const delay = 60_000 * 2 ** (job.attempts - 1);
    await EmailJob.updateOne(
      { _id: job._id },
      {
        $set: {
          status: final ? 'failed' : 'pending',
          lastError: String(err?.message || err).slice(0, 500),
          nextAttemptAt: new Date(Date.now() + delay),
          ...(final ? { expireAt: new Date(Date.now() + RETENTION_MS) } : {}),
        },
        $unset: { lockedAt: 1 },
      },
    );
    logger[final ? 'error' : 'warn']({ err: err?.message, jobId: String(job._id), attempt: job.attempts }, 'email send failed');
  }
}

/** Send every due email. Safe to call concurrently - extra calls coalesce. */
export async function processOutbox() {
  if (running) {
    rerun = true;
    return 0;
  }
  running = true;
  let processed = 0;
  try {
    do {
      rerun = false;
      for (;;) {
        const batch = (await Promise.all(Array.from({ length: CONCURRENCY }, claimNext))).filter(Boolean);
        if (!batch.length) break;
        await Promise.all(batch.map(deliver));
        processed += batch.length;
      }
    } while (rerun);
  } catch (err) {
    logger.error({ err }, 'outbox processing error');
  } finally {
    running = false;
  }
  return processed;
}

function kick() {
  if (env.isTest) return; // tests call processOutbox() explicitly
  setImmediate(() => processOutbox());
}

export function startOutboxWorker() {
  if (timer) return;
  timer = setInterval(processOutbox, POLL_MS);
  timer.unref();
  processOutbox();
}

export function stopOutboxWorker() {
  clearInterval(timer);
  timer = null;
}
