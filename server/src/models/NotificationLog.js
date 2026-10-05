import mongoose from 'mongoose';

/**
 * Exactly-once guard for alert emails. The unique index on (userId, key)
 * means two concurrent requests can't both send "Food budget 80% reached"
 * for the same month - the second insert fails with a duplicate key error.
 *
 * Example keys:  budget:Food & Dining:2026-10:80   monthly:2026-09   large:<expenseId>
 */
const notificationLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  key: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

notificationLogSchema.index({ userId: 1, key: 1 }, { unique: true });
notificationLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 400 });

const NotificationLog = mongoose.model('NotificationLog', notificationLogSchema);

/** Returns true if this is the first time `key` is claimed for the user. */
export async function claimNotification(userId, key) {
  try {
    await NotificationLog.create({ userId, key });
    return true;
  } catch (err) {
    if (err?.code === 11000) return false;
    throw err;
  }
}

export default NotificationLog;
