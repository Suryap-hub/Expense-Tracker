import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { DateTime } from 'luxon';
import { setup } from './helpers.js';

let t;
before(async () => {
  t = await setup();
});
after(() => t.teardown());

const tz = 'Asia/Kolkata';
const now = DateTime.now().setZone(tz);
const period = now.toFormat('yyyy-MM');
const prevPeriod = now.minus({ months: 1 }).toFormat('yyyy-MM');
const thisMonth = (day) => now.set({ day: Math.min(day, now.day) }).toISODate();
const lastMonth = (day) => now.minus({ months: 1 }).set({ day }).toISODate();

describe('dashboard analytics', () => {
  let u;
  before(async () => {
    u = await t.createUser();
    await u.as
      .post('/api/expenses/bulk')
      .send({
        expenses: [
          { amount: 300, merchant: 'Swiggy', category: 'Food & Dining', date: thisMonth(1), paymentMethod: 'UPI' },
          { amount: 200, merchant: 'swiggy', category: 'Food & Dining', date: thisMonth(1), paymentMethod: 'UPI' },
          { amount: 1000, merchant: 'Rent share', category: 'Rent & Housing', date: thisMonth(2), paymentMethod: 'Net Banking' },
          { amount: '99.99', merchant: 'Spotify', category: 'Subscriptions', date: thisMonth(3), paymentMethod: 'Card' },
          { amount: 400, merchant: 'Swiggy', category: 'Food & Dining', date: lastMonth(1), paymentMethod: 'UPI' },
          { amount: 50, merchant: 'Metro', category: 'Transport', date: now.minus({ months: 3 }).set({ day: 5 }).toISODate() },
          { amount: 777, merchant: 'Old', category: 'Other', date: now.minus({ months: 8 }).set({ day: 5 }).toISODate() },
        ],
      })
      .expect(201);
    await u.as.put('/api/budgets/Food%20%26%20Dining').send({ limit: 1000 }).expect(200);
    await u.as.put('/api/budgets/Overall').send({ limit: 5000 }).expect(200);
  });

  it('computes totals, categories, trend and budgets in one call', async () => {
    const { body: o } = await u.as.get('/api/analytics/overview').expect(200);
    assert.equal(o.period, period);
    assert.equal(o.totals.spentMinor, 159999);
    assert.equal(o.totals.txCount, 4);
    assert.equal(o.totals.prevSpentMinor, 40000);
    assert.equal(o.totals.changePct, 300);

    assert.deepEqual(o.byCategory.map((c) => c.category), ['Rent & Housing', 'Food & Dining', 'Subscriptions']);
    const food = o.byCategory.find((c) => c.category === 'Food & Dining');
    assert.equal(food.totalMinor, 50000);
    assert.equal(food.prevMinor, 40000);
    assert.equal(food.changePct, 25);

    // merchants are grouped case-insensitively
    assert.equal(o.topMerchants.find((m) => m.merchant.toLowerCase() === 'swiggy').count, 2);

    assert.equal(o.trend.length, 6);
    assert.equal(o.trend.at(-1).totalMinor, 159999);
    assert.equal(o.trend.at(-4).totalMinor, 5000);
    assert.equal(o.trend.reduce((s, x) => s + x.totalMinor, 0), 159999 + 40000 + 5000); // 8-month-old excluded

    assert.equal(o.daily.length, o.totals.daysInMonth);
    const lastKnown = o.daily.filter((d) => d.cumulativeMinor !== null).at(-1);
    assert.equal(lastKnown.cumulativeMinor, 159999);
    assert.equal(o.daily.reduce((s, d) => s + (d.totalMinor || 0), 0), 159999);

    const foodBudget = o.budgets.find((b) => b.category === 'Food & Dining');
    assert.equal(foodBudget.pct, 50);
    assert.equal(o.budgets[0].category, 'Overall');
    assert.equal(o.weekday.length, 7);
    assert.equal(o.largest[0].merchant, 'Rent share');
  });

  it('returns fresh numbers after a write (cache invalidation)', async () => {
    await u.as.get('/api/analytics/overview').expect(200);
    await u.as.post('/api/expenses').send({ amount: 1, merchant: 'Toffee', category: 'Food & Dining' }).expect(201);
    const { body } = await u.as.get('/api/analytics/overview').expect(200);
    assert.equal(body.totals.spentMinor, 160099);
  });

  it('supports past periods and validates the period', async () => {
    const { body } = await u.as.get(`/api/analytics/overview?period=${prevPeriod}`).expect(200);
    assert.equal(body.totals.spentMinor, 40000);
    assert.equal(body.totals.projectedMinor, null);
    await u.as.get('/api/analytics/overview?period=2026-13').expect(400);
  });

  it('manages budgets', async () => {
    const { body } = await u.as.get('/api/budgets').expect(200);
    assert.equal(body.budgets.length, 2);
    await u.as.put('/api/budgets/Bogus').send({ limit: 10 }).expect(400);
    await u.as.put('/api/budgets/Travel').send({ limit: -1 }).expect(400);
    await u.as.delete('/api/budgets/Travel').expect(404);
    await u.as.put('/api/budgets/Travel').send({ limit: 2000 }).expect(200);
    await u.as.delete('/api/budgets/Travel').expect(204);
  });
});

describe('email alerts', () => {
  it('sends 80% and 100% budget alerts exactly once each', async () => {
    const u = await t.createUser({ name: 'Budget Person' });
    await u.as.put('/api/budgets/Groceries').send({ limit: 1000 }).expect(200);
    const mine = async () => (await t.flushEmails()).filter((m) => m.to === u.email && /budget/i.test(m.subject));

    await u.as.post('/api/expenses').send({ amount: 700, merchant: 'DMart', category: 'Groceries' }).expect(201);
    assert.equal((await mine()).length, 0, 'no alert at 70%');

    await u.as.post('/api/expenses').send({ amount: 150, merchant: 'Blinkit', category: 'Groceries' }).expect(201);
    let alerts = await mine();
    assert.equal(alerts.length, 1);
    assert.match(alerts[0].subject, /85% of your Groceries budget/);
    assert.ok(!alerts[0].html.includes('&amp;amp;'), 'no double escaping');

    await u.as.post('/api/expenses').send({ amount: 10, merchant: 'Milk', category: 'Groceries' }).expect(201);
    assert.equal((await mine()).length, 1, 'no repeat 80% alert');

    await u.as.post('/api/expenses').send({ amount: 200, merchant: 'Zepto', category: 'Groceries' }).expect(201);
    alerts = await mine();
    assert.equal(alerts.length, 2);
    assert.match(alerts[1].subject, /Budget exceeded: Groceries/);
    assert.match(alerts[1].html, /over/);

    await u.as.post('/api/expenses').send({ amount: 500, merchant: 'More', category: 'Groceries' }).expect(201);
    assert.equal((await mine()).length, 2, 'no repeat 100% alert');
  });

  it('jumping straight past 100% sends only the "exceeded" email', async () => {
    const u = await t.createUser();
    await u.as.put('/api/budgets/Overall').send({ limit: 100 }).expect(200);
    await u.as.post('/api/expenses').send({ amount: 5000, merchant: 'Flight', category: 'Travel' }).expect(201);
    const alerts = (await t.flushEmails()).filter((m) => m.to === u.email && /budget/i.test(m.subject));
    assert.equal(alerts.length, 1);
    assert.match(alerts[0].subject, /exceeded: Overall/);
  });

  it('alerts on large expenses and respects preferences', async () => {
    const u = await t.createUser();
    await u.as.patch('/api/users/me').send({ largeExpenseThreshold: '2000' }).expect(200);
    await u.as.post('/api/expenses').send({ amount: 1999, merchant: 'Below', category: 'Shopping' }).expect(201);
    await u.as.post('/api/expenses').send({ amount: 2500, merchant: '<script>alert(1)</script>', category: 'Shopping' }).expect(201);
    let large = (await t.flushEmails()).filter((m) => m.to === u.email && /Large expense/.test(m.subject));
    assert.equal(large.length, 1);
    assert.ok(!large[0].html.includes('<script>'), 'merchant is HTML-escaped');
    assert.ok(large[0].html.includes('&lt;script&gt;'));

    await u.as.patch('/api/users/me').send({ emailPrefs: { largeExpense: false } }).expect(200);
    await u.as.post('/api/expenses').send({ amount: 9000, merchant: 'Muted', category: 'Shopping' }).expect(201);
    large = (await t.flushEmails()).filter((m) => m.to === u.email && /Large expense/.test(m.subject));
    assert.equal(large.length, 1, 'muted');
  });

  it('monthly summary: on demand and the batch job (deduplicated)', async () => {
    const u = await t.createUser({ name: 'Report Reader' });
    await u.as
      .post('/api/expenses/bulk')
      .send({
        expenses: [
          { amount: 1200, merchant: 'IndiGo', category: 'Travel', date: lastMonth(3) },
          { amount: 300, merchant: 'Chaayos', category: 'Food & Dining', date: lastMonth(4) },
        ],
      })
      .expect(201);

    await u.as.post('/api/users/me/send-report').send({ period: prevPeriod }).expect(200);
    let reports = (await t.flushEmails()).filter((m) => m.to === u.email && /spending:/.test(m.subject));
    assert.equal(reports.length, 1);
    assert.match(reports[0].subject, /₹1,500/);
    assert.match(reports[0].html, /IndiGo/);
    assert.match(reports[0].html, /Travel was your biggest category/);
    assert.match(reports[0].html, /You spent the most on [A-Z][a-z]+days\./);

    const { runMonthlyReports } = await import('../src/services/monthlyReport.js');
    const r1 = await runMonthlyReports({ period: prevPeriod });
    const r2 = await runMonthlyReports({ period: prevPeriod });
    assert.ok(r1.sent >= 1);
    assert.equal(r2.sent, 0, 'second run sends nothing');
    reports = (await t.flushEmails()).filter((m) => m.to === u.email && /spending:/.test(m.subject));
    assert.equal(reports.length, 2); // on-demand + one from the batch
  });

  it('outbox marks delivered jobs as sent with a retention expiry', async () => {
    const EmailJob = t.mongoose.model('EmailJob');
    const job = await EmailJob.create({ type: 't', to: 'x@example.com', subject: 's', html: 'h', text: 't' });
    const mailer = await import('../src/services/email/mailer.js');
    assert.equal(typeof mailer.sendMail, 'function');
    await t.flushEmails();
    const done = await EmailJob.findById(job._id).lean();
    assert.equal(done.status, 'sent');
    assert.equal(done.attempts, 1);
    assert.ok(done.expireAt);
  });
});

describe('settings and account', () => {
  it('updates settings and deletes the account with all data', async () => {
    const u = await t.createUser();
    const s = await u.as.patch('/api/users/me').send({ currency: 'USD', timezone: 'America/New_York', name: 'New Name' }).expect(200);
    assert.equal(s.body.user.currency, 'USD');
    await u.as.patch('/api/users/me').send({ timezone: 'Mars/Base' }).expect(400);
    await u.as.post('/api/expenses').send({ amount: 5, merchant: 'Coffee' }).expect(201);
    const e = await u.as.get('/api/expenses').expect(200);
    assert.equal(e.body.items[0].currency, 'USD');

    await u.as.delete('/api/users/me').send({ password: 'wrong' }).expect(401);
    await u.as.delete('/api/users/me').send({ password: u.password }).expect(204);
    await t.request.post('/api/auth/login').send({ email: u.email, password: u.password }).expect(401);
    const left = await t.mongoose.model('Expense').countDocuments({ userId: u.user.id });
    assert.equal(left, 0);
  });
});

describe('month-end projection', () => {
  it('does not multiply one-off costs like rent across the month', async () => {
    const { projectMonth } = await import('../src/services/analytics.js');
    // Day 1 rent 9,800 then ~300/day: naive estimate would be ~66K
    assert.equal(projectMonth([980000, 40000, 30000, 60000, 20000], 1130000, 31), 2534000);
    assert.equal(projectMonth([1000, 1000, 1000], 3000, 30), 30000); // steady spender: plain average
    assert.equal(projectMonth([], 0, 30), 0);
  });
});

describe('email templates', () => {
  it('escapes user text exactly once', async () => {
    const t = await import('../src/services/email/templates.js');
    const { html } = t.budgetAlertTemplate({ name: 'A', category: 'Food & Dining', level: 80, spentMinor: 85, limitMinor: 100, currency: 'INR', periodLabel: 'Oct' });
    assert.ok(html.includes('Food &amp; Dining'));
    assert.ok(!html.includes('&amp;amp;'));
  });
});
