import http from 'node:http';
import crypto from 'node:crypto';

/**
 * Boots a fresh app against a throwaway database. Each test file runs in its
 * own process (node --test), so env is configured once per file.
 *
 * Requires a local MongoDB: TEST_MONGODB_URI (default mongodb://127.0.0.1:27017).
 */
export async function setup({ groqHandler } = {}) {
  let groqServer;
  if (groqHandler) {
    groqServer = http.createServer(async (req, res) => {
      let body = '';
      for await (const chunk of req) body += chunk;
      const result = await groqHandler(JSON.parse(body), req);
      res.writeHead(result.status || 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.body));
    });
    await new Promise((r) => groqServer.listen(0, '127.0.0.1', r));
    process.env.GROQ_API_KEY = 'test-key';
    process.env.GROQ_BASE_URL = `http://127.0.0.1:${groqServer.address().port}`;
  } else {
    process.env.GROQ_API_KEY = '';
  }

  const base = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017';
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = `${base}/spendwise_test_${crypto.randomBytes(4).toString('hex')}`;
  process.env.JWT_ACCESS_SECRET = crypto.randomBytes(32).toString('hex');
  process.env.EMAIL_TRANSPORT = 'json';
  process.env.CLIENT_URL = 'http://localhost:5173';
  process.env.ENABLE_CRON = 'false';
  process.env.SERVE_CLIENT = 'false';

  const { connectDB } = await import('../src/config/db.js');
  const { createApp } = await import('../src/app.js');
  const mongoose = (await import('mongoose')).default;
  const { sentEmails } = await import('../src/services/email/mailer.js');
  const { processOutbox } = await import('../src/services/email/outbox.js');
  const supertest = (await import('supertest')).default;

  await connectDB();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  const app = createApp();
  const request = supertest(app);

  /** Waits for background work (alerts) then flushes the email outbox. */
  async function flushEmails() {
    await new Promise((r) => setTimeout(r, 150));
    await processOutbox();
    return sentEmails;
  }

  /** Register + verify + login a user; returns an authed request helper. */
  async function createUser({ name = 'Test User', email, password = 'Passw0rd!' } = {}) {
    email ||= `u${crypto.randomBytes(4).toString('hex')}@example.com`;
    await request.post('/api/auth/register').send({ name, email, password }).expect(201);
    await flushEmails();
    const mail = [...sentEmails].reverse().find((m) => m.to === email && /verify/i.test(m.subject));
    const token = new URL(mail.text.match(/https?:\/\/\S+/)[0]).searchParams.get('token');
    const res = await request.post('/api/auth/verify-email').send({ token }).expect(200);
    const auth = `Bearer ${res.body.accessToken}`;
    const cookie = res.headers['set-cookie'];
    const as = {
      get: (url) => request.get(url).set('Authorization', auth),
      post: (url) => request.post(url).set('Authorization', auth),
      patch: (url) => request.patch(url).set('Authorization', auth),
      put: (url) => request.put(url).set('Authorization', auth),
      delete: (url) => request.delete(url).set('Authorization', auth),
    };
    return { email, password, user: res.body.user, accessToken: res.body.accessToken, cookie, as };
  }

  async function teardown() {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    groqServer?.close();
  }

  return { request, sentEmails, flushEmails, createUser, teardown, mongoose };
}
