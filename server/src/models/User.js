import mongoose from 'mongoose';
import { CURRENCY_CODES } from '../utils/money.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },

    emailVerified: { type: Boolean, default: false },
    emailVerifyTokenHash: { type: String, select: false },
    emailVerifyExpires: { type: Date, select: false },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },

    // Incremented on password change / "log out everywhere". Access tokens
    // carry it, so old tokens stop working immediately.
    tokenVersion: { type: Number, default: 0 },
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, select: false },
    lastLoginAt: Date,

    currency: { type: String, enum: CURRENCY_CODES, default: 'INR' },
    timezone: { type: String, default: 'Asia/Kolkata' },
    // Email alert when a single expense is >= this amount. 0 disables it.
    largeExpenseThresholdMinor: { type: Number, default: 500_000, min: 0 },
    emailPrefs: {
      budgetAlerts: { type: Boolean, default: true },
      largeExpense: { type: Boolean, default: true },
      monthlySummary: { type: Boolean, default: true },
    },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform(_doc, ret) {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.passwordHash;
        delete ret.emailVerifyTokenHash;
        delete ret.emailVerifyExpires;
        delete ret.passwordResetTokenHash;
        delete ret.passwordResetExpires;
        delete ret.failedLoginAttempts;
        delete ret.lockUntil;
        delete ret.tokenVersion;
        return ret;
      },
    },
  },
);

userSchema.index({ emailVerifyTokenHash: 1 }, { sparse: true });
userSchema.index({ passwordResetTokenHash: 1 }, { sparse: true });

/** Plain-object view of a user that is safe to send to the client. */
export function publicUser(u) {
  return {
    id: String(u._id),
    name: u.name,
    email: u.email,
    emailVerified: u.emailVerified,
    currency: u.currency,
    timezone: u.timezone,
    largeExpenseThresholdMinor: u.largeExpenseThresholdMinor,
    emailPrefs: {
      budgetAlerts: u.emailPrefs?.budgetAlerts ?? true,
      largeExpense: u.emailPrefs?.largeExpense ?? true,
      monthlySummary: u.emailPrefs?.monthlySummary ?? true,
    },
    createdAt: u.createdAt,
  };
}

export default mongoose.model('User', userSchema);
