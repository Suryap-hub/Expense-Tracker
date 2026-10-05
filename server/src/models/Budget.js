import mongoose from 'mongoose';
import { BUDGET_CATEGORIES } from '../utils/categories.js';
import { MAX_MINOR } from '../utils/money.js';

/** A monthly spending limit, per category or "Overall". Repeats every month. */
const budgetSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: String, enum: BUDGET_CATEGORIES, required: true },
    limitMinor: {
      type: Number,
      required: true,
      min: 1,
      max: MAX_MINOR,
      validate: { validator: Number.isInteger, message: 'limitMinor must be an integer' },
    },
  },
  { timestamps: true },
);

budgetSchema.index({ userId: 1, category: 1 }, { unique: true });

export default mongoose.model('Budget', budgetSchema);
