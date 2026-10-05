import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { setup } from './helpers.js';

let t;
let alice;
let bob;
before(async () => {
  t = await setup();
  alice = await t.createUser({ name: 'Alice' });
  bob = await t.createUser({ name: 'Bob' });
});
after(() => t.teardown());

describe('money handling', () => {
  it('stores exact integer paise', async () => {
    const r = await alice.as.post('/api/expenses').send({ amount: '1,234.56', merchant: 'Amazon', category: 'Shopping' }).expect(201);
    assert.equal(r.body.expense.amountMinor, 123456);
    assert.equal(r.body.expense.amount, '1234.56');
    assert.equal(r.body.expense.currency, 'INR');
  });

  it('avoids floating point drift (0.1 + 0.2)', async () => {
    await bob.as.post('/api/expenses').send({ amount: 0.1, merchant: 'Chai', date: '2026-01-10' }).expect(201);
    await bob.as.post('/api/expenses').send({ amount: '0.2', merchant: 'Chai', date: '2026-01-10' }).expect(201);
    const list = await bob.as.get('/api/expenses?from=2026-01-01&to=2026-01-31').expect(200);
    assert.equal(list.body.sumMinor, 30);
  });

  it('rejects invalid amounts', async () => {
    for (const amount of [-5, 0, 'abc', '10.999', '1e5', 10_000_000_000]) {
      const r = await alice.as.post('/api/expenses').send({ amount, merchant: 'X' });
      assert.equal(r.status, 400, `amount ${amount} should be rejected`);
    }
  });

  it('auto-categorizes from the merchant when category is missing', async () => {
    const r = await alice.as.post('/api/expenses').send({ amount: 349, merchant: 'Swiggy order' }).expect(201);
    assert.equal(r.body.expense.category, 'Food & Dining');
  });

  it('clamps future dates to now', async () => {
    const r = await alice.as.post('/api/expenses').send({ amount: 10, merchant: 'Future', date: '2099-01-01' }).expect(201);
    assert.ok(new Date(r.body.expense.date) <= new Date(Date.now() + 1000));
  });
});

describe('idempotency', () => {
  it('replays the original response for a retried request', async () => {
    const body = { amount: 999, merchant: 'Retry Store', category: 'Shopping' };
    const a = await alice.as.post('/api/expenses').set('Idempotency-Key', 'abc-123').send(body).expect(201);
    const b = await alice.as.post('/api/expenses').set('Idempotency-Key', 'abc-123').send(body).expect(201);
    assert.equal(a.body.expense.id, b.body.expense.id);
    assert.equal(b.headers['idempotent-replayed'], 'true');

    const list = await alice.as.get('/api/expenses?q=Retry%20Store').expect(200);
    assert.equal(list.body.total, 1);

    const c = await alice.as.post('/api/expenses').set('Idempotency-Key', 'abc-123').send({ ...body, amount: 1 }).expect(422);
    assert.equal(c.body.code, 'IDEMPOTENCY_MISMATCH');

    // keys are per user
    await bob.as.post('/api/expenses').set('Idempotency-Key', 'abc-123').send(body).expect(201);
  });
});

describe('CRUD and isolation', () => {
  it('updates and deletes own expenses only', async () => {
    const { body } = await alice.as.post('/api/expenses').send({ amount: 500, merchant: 'Uber', category: 'Transport' }).expect(201);
    const id = body.expense.id;

    await bob.as.get(`/api/expenses/${id}`).expect(404);
    await bob.as.patch(`/api/expenses/${id}`).send({ amount: 1 }).expect(404);
    await bob.as.delete(`/api/expenses/${id}`).expect(404);

    const up = await alice.as.patch(`/api/expenses/${id}`).send({ amount: '612.50', note: 'airport' }).expect(200);
    assert.equal(up.body.expense.amountMinor, 61250);
    assert.equal(up.body.expense.note, 'airport');

    await alice.as.patch(`/api/expenses/${id}`).send({}).expect(400);
    await alice.as.patch(`/api/expenses/${id}`).send({ category: 'NotACategory' }).expect(400);
    await alice.as.get('/api/expenses/not-an-id').expect(400);

    await alice.as.delete(`/api/expenses/${id}`).expect(204);
    await alice.as.get(`/api/expenses/${id}`).expect(404);

    const activity = await alice.as.get('/api/users/me/activity').expect(200);
    const actions = activity.body.items.map((a) => a.action);
    assert.ok(actions.includes('expense.delete') && actions.includes('expense.update'));
  });

  it('bulk inserts up to 50', async () => {
    const expenses = Array.from({ length: 3 }, (_, i) => ({ amount: 100 + i, merchant: `Bulk ${i}`, date: '2026-02-1' + i, category: 'Other' }));
    const r = await alice.as.post('/api/expenses/bulk').send({ expenses }).expect(201);
    assert.equal(r.body.expenses.length, 3);
    await alice.as.post('/api/expenses/bulk').send({ expenses: [] }).expect(400);
  });
});

describe('listing', () => {
  before(async () => {
    const rows = [
      { amount: 200, merchant: 'Zomato', category: 'Food & Dining', date: '2026-03-01', paymentMethod: 'UPI' },
      { amount: 1500, merchant: 'DMart', category: 'Groceries', date: '2026-03-05', paymentMethod: 'Card' },
      { amount: 80, merchant: 'Metro card', category: 'Transport', date: '2026-03-07', paymentMethod: 'Card' },
      { amount: 450, merchant: 'Dominos', category: 'Food & Dining', date: '2026-03-09', paymentMethod: 'UPI', note: 'team pizza' },
    ];
    await bob.as.post('/api/expenses/bulk').send({ expenses: rows }).expect(201);
  });

  it('filters, searches, sorts and paginates', async () => {
    const all = await bob.as.get('/api/expenses?from=2026-03-01&to=2026-03-31').expect(200);
    assert.equal(all.body.total, 4);
    assert.equal(all.body.sumMinor, 223000);
    assert.equal(all.body.items[0].merchant, 'Dominos'); // newest first

    const food = await bob.as.get('/api/expenses?from=2026-03-01&to=2026-03-31&category=Food%20%26%20Dining').expect(200);
    assert.equal(food.body.total, 2);

    const multi = await bob.as.get('/api/expenses?from=2026-03-01&to=2026-03-31&category=Groceries,Transport&paymentMethod=Card').expect(200);
    assert.equal(multi.body.total, 2);

    const search = await bob.as.get('/api/expenses?q=pizza').expect(200);
    assert.equal(search.body.items[0].merchant, 'Dominos');

    const regexSafe = await bob.as.get('/api/expenses?q=.*').expect(200);
    assert.equal(regexSafe.body.total, 0);

    const range = await bob.as.get('/api/expenses?from=2026-03-01&to=2026-03-31&min=100&max=500').expect(200);
    assert.equal(range.body.total, 2);

    const sorted = await bob.as.get('/api/expenses?from=2026-03-01&to=2026-03-31&sort=amount_desc&limit=2&page=1').expect(200);
    assert.deepEqual(sorted.body.items.map((x) => x.merchant), ['DMart', 'Dominos']);
    assert.equal(sorted.body.pages, 2);
    const p2 = await bob.as.get('/api/expenses?from=2026-03-01&to=2026-03-31&sort=amount_desc&limit=2&page=2').expect(200);
    assert.deepEqual(p2.body.items.map((x) => x.merchant), ['Zomato', 'Metro card']);

    await bob.as.get('/api/expenses?category=Nope').expect(400);
    await bob.as.get('/api/expenses?limit=1000').expect(400);
  });

  it('exports CSV safely', async () => {
    await bob.as.post('/api/expenses').send({ amount: 1, merchant: '=HYPERLINK("http://evil")', date: '2026-03-10' }).expect(201);
    const r = await bob.as.get('/api/expenses/export.csv?from=2026-03-01&to=2026-03-31').expect(200);
    assert.match(r.headers['content-type'], /text\/csv/);
    const lines = r.text.trim().split('\n');
    assert.equal(lines.length, 6); // header + 5
    assert.ok(r.text.includes(`"'=HYPERLINK(""http://evil"")"`), 'formula neutralised');
    assert.ok(r.text.includes('"1500.00"'));
  });
});
