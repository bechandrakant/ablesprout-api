import { ClientSession, Types } from 'mongoose';
import { AuditLog, AuditAction } from '../models';
import { AuthUser } from '../middleware/auth';
import { logger } from '../config/logger';

export async function audit(
  user: AuthUser,
  action: AuditAction,
  entity: string,
  entityId: Types.ObjectId | string,
  meta?: Record<string, unknown>,
  session?: ClientSession,
): Promise<void> {
  const doc = { schoolId: user.schoolId, userId: user.id, action, entity, entityId, meta };
  if (session) {
    // Inside a transaction the audit row commits or rolls back with the change it describes.
    await AuditLog.create([doc], { session });
    return;
  }
  try {
    await AuditLog.create(doc);
  } catch (err) {
    logger.error({ err, action, entity, entityId: String(entityId) }, 'Failed to write audit log');
  }
}

/** Field names only (never values) so the audit trail doesn't duplicate sensitive data. */
export const changedFields = (body: Record<string, unknown>) => ({ fields: Object.keys(body) });
