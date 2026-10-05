import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { setup } from './helpers.js';

let t;
before(async () => {
  t = await setup();
});
after(() => t.teardown());

const cookieValue = (setCookie) => setCookie?.find((c) => c.startsWith('sw_rt='))?.split(';')[0];

describe('registration and email verification', () => {
  it('requires verification before login, then logs in', async () => {
    const email = 'surya@example.com';
    await t.request.post('/api/auth/register').send({ name: 'Surya', email, password: 'Secret123' }).expect(201);

    const login = await t.request.post('/api/auth/login').send({ email, password: 'Secret123' }).expect(403);
    assert.equal(login.body.code, 'EMAIL_NOT_VERIFIED');

    const emails = await t.flushEmails();
    const mail = emails.find((m) => m.to === email);
    assert.match(mail.subject, /verify/i);
    assert.match(mail.html, /Verify email/);
    const token = new URL(mail.text.match(/https?:\/\/\S+/)[0]).searchParams.get('token');

    const v = await t.request.post('/api/auth/verify-email').send({ token }).expect(200);
    assert.ok(v.body.accessToken);
    assert.equal(v.body.user.emailVerified, true);
    assert.equal(v.body.user.passwordHash, undefined);

    // link is single use
    await t.request.post('/api/auth/verify-email').send({ token }).expect(400);

    const ok = await t.request.post('/api/auth/login').send({ email: 'SURYA@example.com', password: 'Secret123' }).expect(200);
    assert.ok(ok.body.accessToken);
    const cookie = ok.headers['set-cookie'][0];
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Path=\/api\/auth/);
  });

  it('does not reveal whether an email is registered', async () => {
    const a = await t.request.post('/api/auth/register').send({ name: 'X', email: 'surya@example.com', password: 'Another123' }).expect(201);
    const b = await t.request.post('/api/auth/register').send({ name: 'Y', email: 'brandnew@example.com', password: 'Another123' }).expect(201);
    assert.equal(a.body.message, b.body.message);
  });

  it('validates input', async () => {
    const r = await t.request.post('/api/auth/register').send({ name: '', email: 'nope', password: 'short' }).expect(400);
    assert.equal(r.body.code, 'VALIDATION_ERROR');
    const fields = r.body.details.map((d) => d.field);
    assert.ok(fields.includes('email') && fields.includes('password') && fields.includes('name'));
  });

  it('rejects NoSQL operator injection', async () => {
    const r = await t.request.post('/api/auth/login').send({ email: { $gt: '' }, password: { $gt: '' } });
    assert.equal(r.status, 400);
  });
});

describe('sessions', () => {
  it('protects routes and rotates refresh tokens', async () => {
    await t.request.get('/api/auth/me').expect(401);
    await t.request.get('/api/auth/me').set('Authorization', 'Bearer garbage').expect(401);

    const u = await t.createUser();
    const me = await u.as.get('/api/auth/me').expect(200);
    assert.equal(me.body.user.email, u.email);

    const first = cookieValue(u.cookie);
    const r1 = await t.request.post('/api/auth/refresh').set('Cookie', first).expect(200);
    const second = cookieValue(r1.headers['set-cookie']);
    assert.ok(second && second !== first, 'cookie rotated');
    assert.ok(r1.body.accessToken);

    // Same old token again inside the grace window (two tabs): allowed, no new cookie
    const race = await t.request.post('/api/auth/refresh').set('Cookie', first).expect(200);
    assert.equal(race.headers['set-cookie'], undefined);

    // Simulate the old token being replayed later (stolen): whole family revoked
    const Session = t.mongoose.model('Session');
    await Session.updateMany({}, { $set: { replacedAt: new Date(Date.now() - 60_000) } });
    const theft = await t.request.post('/api/auth/refresh').set('Cookie', first).expect(401);
    assert.equal(theft.body.code, 'SESSION_REUSED');
    await t.request.post('/api/auth/refresh').set('Cookie', second).expect(401);
  });

  it('logout revokes the refresh token', async () => {
    const u = await t.createUser();
    const c = cookieValue(u.cookie);
    await t.request.post('/api/auth/logout').set('Cookie', c).expect(204);
    await t.request.post('/api/auth/refresh').set('Cookie', c).expect(401);
  });

  it('locks the account after 5 wrong passwords', async () => {
    const u = await t.createUser();
    for (let i = 0; i < 5; i++) await t.request.post('/api/auth/login').send({ email: u.email, password: 'wrong-pass1' }).expect(401);
    const locked = await t.request.post('/api/auth/login').send({ email: u.email, password: u.password }).expect(423);
    assert.equal(locked.body.code, 'ACCOUNT_LOCKED');
  });
});

describe('password reset', () => {
  it('resets the password and invalidates old access tokens', async () => {
    const u = await t.createUser();
    await u.as.get('/api/auth/me').expect(200);

    await t.request.post('/api/auth/forgot-password').send({ email: u.email }).expect(200);
    await t.request.post('/api/auth/forgot-password').send({ email: 'ghost@example.com' }).expect(200);
    const emails = await t.flushEmails();
    const mail = [...emails].reverse().find((m) => m.to === u.email && /reset/i.test(m.subject));
    const token = new URL(mail.text.match(/https?:\/\/\S+/)[0]).searchParams.get('token');

    await t.request.post('/api/auth/reset-password').send({ token, password: 'BrandNew99' }).expect(200);
    await t.request.post('/api/auth/reset-password').send({ token, password: 'BrandNew99' }).expect(400); // single use

    const old = await u.as.get('/api/auth/me').expect(401);
    assert.equal(old.body.code, 'INVALID_TOKEN');
    await t.request.post('/api/auth/login').send({ email: u.email, password: u.password }).expect(401);
    await t.request.post('/api/auth/login').send({ email: u.email, password: 'BrandNew99' }).expect(200);

    const changed = (await t.flushEmails()).find((m) => m.to === u.email && /password was changed/i.test(m.subject));
    assert.ok(changed, 'security notice email sent');
  });

  it('change-password requires the current password', async () => {
    const u = await t.createUser();
    await u.as.post('/api/users/me/change-password').send({ currentPassword: 'nope', newPassword: 'Another123' }).expect(401);
    await u.as.post('/api/users/me/change-password').send({ currentPassword: u.password, newPassword: 'Another123' }).expect(200);
    await u.as.get('/api/auth/me').expect(401);
  });
});
