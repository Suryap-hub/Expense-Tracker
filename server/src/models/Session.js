import mongoose from 'mongoose';

/**
 * One row per refresh token. Refresh tokens rotate on every use; all tokens
 * descending from one login share a `family`. If an already-rotated token is
 * presented again (outside a short grace window), the whole family is revoked
 * - that's how a stolen refresh token gets detected.
 */
const sessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    family: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
    replacedAt: Date,
    userAgent: String,
    ip: String,
  },
  { timestamps: true },
);

// MongoDB deletes expired sessions automatically.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('Session', sessionSchema);
