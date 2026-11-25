import { InferSchemaType, Schema, model } from 'mongoose';
import { toJSONPlugin } from './plugins';

export const AUDIT_ACTIONS = ['CREATE', 'UPDATE', 'APPROVE', 'DELETE', 'GENERATE', 'EXPORT'] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

// DPDP Act 2023 accountability: who did what to which record, when.
const auditLogSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
    entity: { type: String, required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);
auditLogSchema.index({ schoolId: 1, createdAt: -1 });
auditLogSchema.index({ entity: 1, entityId: 1 });
auditLogSchema.plugin(toJSONPlugin);

export type AuditLogDoc = InferSchemaType<typeof auditLogSchema>;
export const AuditLog = model('AuditLog', auditLogSchema);
