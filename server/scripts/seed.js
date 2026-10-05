/**
 * Creates a verified demo account with ~4 months of realistic spending.
 *   npm run seed            -> demo@spendwise.dev / Demo1234
 *   npm run seed -- --reset -> delete and recreate the demo data
 */
import { DateTime } from 'luxon';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import Budget from '../src/models/Budget.js';
import Expense from '../src/models/Expense.js';
import User from '../src/models/User.js';
import { hashPassword } from '../src/services/password.js';

const EMAIL = 'demo@spendwise.dev';
const PASSWORD = 'Demo1234';
const TZ = 'Asia/Kolkata';

// [merchant, category, paymentMethod, minRupees, maxRupees, timesPerMonth]
const PATTERNS = [
  ['Swiggy', 'Food & Dining', 'UPI', 180, 520, 9],
  ['Zomato', 'Food & Dining', 'UPI', 150, 480, 6],
  ['College canteen', 'Food & Dining', 'Cash', 40, 120, 14],
  ['Blinkit', 'Groceries', 'UPI', 120, 900, 6],
  ['DMart', 'Groceries', 'Card', 600, 2200, 2],
  ['Delhi Metro', 'Transport', 'UPI', 30, 80, 16],
  ['Uber', 'Transport', 'UPI', 140, 420, 4],
  ['Rapido', 'Transport', 'UPI', 45, 120, 5],
  ['Amazon', 'Shopping', 'Card', 299, 2499, 2],
  ['Myntra', 'Shopping', 'Card', 499, 1999, 1],
  ['Airtel recharge', 'Bills & Utilities', 'UPI', 299, 299, 1],
  ['Electricity bill', 'Bills & Utilities', 'Net Banking', 650, 1300, 1],
  ['PG rent', 'Rent & Housing', 'Net Banking', 9500, 9500, 1],
  ['PVR Cinemas', 'Entertainment', 'Card', 250, 700, 1],
  ['Apollo Pharmacy', 'Health', 'UPI', 90, 600, 1],
  ['Udemy', 'Education', 'Card', 449, 649, 0.5],
  ['Spotify', 'Subscriptions', 'Card', 119, 119, 1],
  ['Netflix', 'Subscriptions', 'Card', 199, 199, 1],
  ['Barber', 'Personal Care', 'Cash', 150, 250, 1],
  ['Chai point', 'Food & Dining', 'UPI', 20, 60, 12],
];

const rand = (min, max) => min + Math.random() * (max - min);

async function main() {
  await connectDB();
  const reset = process.argv.includes('--reset');
  let user = await User.findOne({ email: EMAIL });
  if (user && reset) {
    await Promise.all([Expense.deleteMany({ userId: user._id }), Budget.deleteMany({ userId: user._id }), User.deleteOne({ _id: user._id })]);
    user = null;
  }
  if (user) {
    console.log(`Demo user already exists. Sign in with ${EMAIL} / ${PASSWORD}  (use --reset to recreate)`);
    return;
  }

  user = await User.create({ name: 'Demo Student', email: EMAIL, passwordHash: await hashPassword(PASSWORD), emailVerified: true, timezone: TZ });
  const now = DateTime.now().setZone(TZ);
  const docs = [];
  for (let back = 3; back >= 0; back--) {
    const month = now.minus({ months: back }).startOf('month');
    const lastDay = back === 0 ? now.day : month.daysInMonth;
    for (const [merchant, category, paymentMethod, min, max, times] of PATTERNS) {
      // vary each month a little so the trend isn't flat
      const fixedDay = merchant === 'PG rent' ? 1 : 5;
      const count =
        min === max // fixed monthly bills: once a month, if the due day has passed
          ? Math.round(times) && (back > 0 || now.day >= fixedDay) ? 1 : 0
          : Math.round(times * rand(0.75, 1.25) * (back === 0 ? lastDay / month.daysInMonth : 1));
      for (let i = 0; i < count; i++) {
        const fixed = min === max;
        const day = fixed ? fixedDay : Math.ceil(rand(0, lastDay)) || 1;
        const date = month.set({ day, hour: Math.floor(rand(8, 22)), minute: Math.floor(rand(0, 59)) });
        if (date > now) continue;
        const rupees = fixed ? min : Math.round(rand(min, max));
        docs.push({ userId: user._id, amountMinor: rupees * 100, currency: 'INR', category, merchant, paymentMethod, date: date.toJSDate(), source: 'manual' });
      }
    }
  }
  await Expense.insertMany(docs);
  await Budget.insertMany([
    { userId: user._id, category: 'Overall', limitMinor: 25_000_00 },
    { userId: user._id, category: 'Food & Dining', limitMinor: 6_000_00 },
    { userId: user._id, category: 'Transport', limitMinor: 2_500_00 },
    { userId: user._id, category: 'Shopping', limitMinor: 3_000_00 },
  ]);
  console.log(`✅ Seeded ${docs.length} expenses. Sign in with ${EMAIL} / ${PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
