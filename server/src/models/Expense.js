import mongoose from 'mongoose';
import { CATEGORIES, PAYMENT_METHODS } from '../utils/categories.js';
import { CURRENCY_CODES, MAX_MINOR, fromMinor } from '../utils/money.js';

export const SOURCES = ['manual', 'ai', 'sms', 'import'];

const expenseSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amountMinor: {
      type: Number,
      required: true,
      min: 1,
      max: MAX_MINOR,
      validate: { validator: Number.isInteger, message: 'amountMinor must be an integer' },
    },
    currency: { type: String, enum: CURRENCY_CODES, required: true },
    category: { type: String, enum: CATEGORIES, required: true },
    merchant: { type: String, required: true, trim: true, maxlength: 100 },
    note: { type: String, trim: true, maxlength: 500, default: '' },
    date: { type: Date, required: true },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, default: 'UPI' },
    source: { type: String, enum: SOURCES, default: 'manual' },
  },
  { timestamps: true },
);

// Every query is scoped by user and almost always by date, so these compound
// indexes let MongoDB answer list, filter and analytics queries from the index.
expenseSchema.index({ userId: 1, date: -1, _id: -1 });
expenseSchema.index({ userId: 1, category: 1, date: -1 });

export function serializeExpense(e) {
  return {
    id: String(e._id),
    amountMinor: e.amountMinor,
    amount: fromMinor(e.amountMinor),
    currency: e.currency,
    category: e.category,
    merchant: e.merchant,
    note: e.note || '',
    date: e.date,
    paymentMethod: e.paymentMethod,
    source: e.source,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

export default mongoose.model('Expense', expenseSchema);
