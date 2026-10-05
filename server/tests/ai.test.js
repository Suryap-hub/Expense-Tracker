import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { DateTime } from 'luxon';
import { setup } from './helpers.js';

const today = DateTime.now().setZone('Asia/Kolkata');
const calls = [];
let mode = 'ok';

// Fake Groq: answers like the real OpenAI-compatible endpoint.
async function groqHandler(body, req) {
  calls.push({ body, auth: req.headers.authorization });
  if (mode === 'down') return { status: 503, body: { error: { message: 'overloaded' } } };
  const system = body.messages[0].content;
  let content;
  if (system.includes('convert short notes')) {
    content = JSON.stringify({
      expenses: [
        { amount: 450, merchant: 'Swiggy', category: 'Food & Dining', paymentMethod: 'UPI', date: today.minus({ days: 1 }).toISODate(), note: '' },
        { amount: '120.5', merchant: 'Uber', category: 'Taxi stuff', paymentMethod: 'Bitcoin', date: '2099-01-01', note: '' },
        { amount: -50, merchant: 'Refund', category: 'Other', paymentMethod: 'UPI', date: today.toISODate() },
      ],
    });
  } else if (system.includes('personal finance coach')) {
    content = '```json\n{"headline":"Food is your biggest spend.","insights":[{"type":"tip","title":"Cook twice a week","detail":"Could save about ₹1,200."},{"type":"weird","title":"x","detail":"y"}]}\n```';
  } else {
    content = '{"category":"Education"}';
  }
  return { body: { choices: [{ message: { content } }], usage: { total_tokens: 100 } } };
}

let t;
let u;
before(async () => {
  t = await setup({ groqHandler });
  u = await t.createUser();
});
after(() => t.teardown());

describe('Groq-powered parsing', () => {
  it('turns text into validated drafts', async () => {
    const r = await u.as.post('/api/ai/parse').send({ text: 'swiggy 450 yesterday, uber 120.50' }).expect(200);
    assert.equal(r.body.engine, 'groq');
    assert.equal(calls.at(-1).auth, 'Bearer test-key');
    assert.equal(calls.at(-1).body.response_format.type, 'json_object');

    const [a, b, ...rest] = r.body.drafts;
    assert.equal(rest.length, 0, 'negative amount dropped');
    assert.equal(a.amountMinor, 45000);
    assert.equal(a.date, today.minus({ days: 1 }).toISODate());
    assert.equal(b.amountMinor, 12050);
    assert.equal(b.category, 'Transport', 'invalid category replaced via keyword rules');
    assert.equal(b.paymentMethod, 'UPI', 'invalid payment method replaced');
    assert.equal(b.date, today.toISODate(), 'future date clamped');

    // Drafts are not saved until confirmed
    const list = await u.as.get('/api/expenses').expect(200);
    assert.equal(list.body.total, 0);
    const saved = await u.as.post('/api/expenses/bulk').send({ expenses: r.body.drafts.map(({ amount, merchant, category, paymentMethod, date, note, source }) => ({ amount, merchant, category, paymentMethod, date, note, source })) }).expect(201);
    assert.equal(saved.body.expenses.length, 2);
    assert.equal(saved.body.expenses[0].source, 'ai');
  });

  it('falls back to the basic parser when Groq is down', async () => {
    mode = 'down';
    const r = await u.as.post('/api/ai/parse').send({ text: 'Rs.250.00 debited from A/c XX1234 on 03-10-26 to VPA zomato.order@icici UPI Ref 1234' }).expect(200);
    mode = 'ok';
    assert.equal(r.body.engine, 'basic');
    assert.ok(r.body.warning);
    assert.equal(r.body.drafts.length, 1);
    const d = r.body.drafts[0];
    assert.equal(d.amountMinor, 25000);
    assert.equal(d.merchant, 'Zomato');
    assert.equal(d.category, 'Food & Dining');
    assert.equal(d.date, '2026-10-03');
    assert.equal(d.source, 'sms');
  });

  it('suggests categories (rules first, then Groq)', async () => {
    const before = calls.length;
    const r1 = await u.as.post('/api/ai/categorize').send({ merchant: 'Netflix' }).expect(200);
    assert.deepEqual(r1.body, { category: 'Subscriptions', engine: 'rules' });
    assert.equal(calls.length, before, 'no API call needed');
    const r2 = await u.as.post('/api/ai/categorize').send({ merchant: 'Unknown Academy' }).expect(200);
    assert.deepEqual(r2.body, { category: 'Education', engine: 'groq' });
  });

  it('generates insights and caches them until data changes', async () => {
    const r = await u.as.get('/api/ai/insights').expect(200);
    assert.equal(r.body.engine, 'groq');
    assert.equal(r.body.headline, 'Food is your biggest spend.');
    assert.equal(r.body.insights[1].type, 'info', 'unknown type coerced');
    const n = calls.length;
    await u.as.get('/api/ai/insights').expect(200);
    assert.equal(calls.length, n, 'served from cache');
    await u.as.post('/api/expenses').send({ amount: 10, merchant: 'Tea' }).expect(201);
    await u.as.get('/api/ai/insights').expect(200);
    assert.equal(calls.length, n + 1, 'recomputed after write');
  });
});

describe('basic parser (no API key)', () => {
  it('handles common Indian SMS and notes', async () => {
    const { basicParse } = await import('../src/services/ai.js');
    const tz = 'Asia/Kolkata';
    const cases = [
      ['Paid Rs 1,250 to Uber via UPI', { amountMinor: 125000, merchant: 'Uber', category: 'Transport' }],
      ['INR 499.00 spent on your HDFC Bank Card ending 1234 at NETFLIX on 02-Oct-26', { amountMinor: 49900, category: 'Subscriptions', paymentMethod: 'Card', date: '2026-10-02' }],
      ['lunch 180', { amountMinor: 18000, category: 'Food & Dining' }],
      ['Rs 5000 credited to your account', null],
      ['Your OTP is 482913', null],
    ];
    for (const [text, expected] of cases) {
      const [d] = basicParse(text, tz);
      if (expected === null) {
        assert.equal(d, undefined, text);
        continue;
      }
      for (const [k, v] of Object.entries(expected)) assert.equal(d[k], v, `${text} -> ${k}`);
    }
    assert.equal(basicParse('coffee 120 and auto 60', tz).length, 2);
  });
});
