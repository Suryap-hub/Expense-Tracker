import mongoose from 'mongoose';

/**
 * Stores the response to a write request sent with an `Idempotency-Key`
 * header. If the client retries (flaky mobile network, double click), the
 * same response is replayed instead of creating a duplicate expense.
 */
const idempotencyKeySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  key: { type: String, required: true },
  requestHash: { type: String, required: true },
  status: { type: String, enum: ['processing', 'done'], default: 'processing' },
  responseStatus: Number,
  responseBody: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now },
});

idempotencyKeySchema.index({ userId: 1, key: 1 }, { unique: true });
idempotencyKeySchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

export default mongoose.model('IdempotencyKey', idempotencyKeySchema);
