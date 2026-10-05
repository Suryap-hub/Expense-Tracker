import mongoose from 'mongoose';

/**
 * Transactional outbox for emails. API requests only insert a row here (fast),
 * and a background worker sends it with retries. If the server restarts or
 * the SMTP provider is down, nothing is lost.
 */
const emailJobSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: { type: String, required: true },
    to: { type: String, required: true },
    subject: { type: String, required: true },
    html: { type: String, required: true },
    text: { type: String, required: true },
    status: { type: String, enum: ['pending', 'sending', 'sent', 'failed'], default: 'pending' },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: Date.now },
    lockedAt: Date,
    lastError: String,
    sentAt: Date,
    messageId: String,
    // Set once sent/failed so MongoDB cleans the row up after 30 days.
    expireAt: Date,
  },
  { timestamps: true },
);

emailJobSchema.index({ status: 1, nextAttemptAt: 1 });
emailJobSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('EmailJob', emailJobSchema);
