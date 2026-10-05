import mongoose from 'mongoose';
import logger from '../config/logger.js';

/** Append-only record of security- and money-relevant actions. */
const auditLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true }, // e.g. auth.login, expense.create
    entityId: String,
    meta: { type: mongoose.Schema.Types.Mixed },
    ip: String,
    userAgent: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ userId: 1, createdAt: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

/** Fire-and-forget audit write. Never blocks or fails the request. */
export function audit(req, userId, action, { entityId, meta } = {}) {
  AuditLog.create({
    userId,
    action,
    entityId: entityId ? String(entityId) : undefined,
    meta,
    ip: req?.ip,
    userAgent: req?.get?.('user-agent')?.slice(0, 200),
  }).catch((err) => logger.error({ err, action }, 'audit log write failed'));
}

export default AuditLog;
