import { HydratedDocument, InferSchemaType, Schema, model } from 'mongoose';
import { toJSONPlugin } from './plugins';
import { DOMAINS } from './assessment.model';

export const IEP_STATUSES = ['DRAFT', 'APPROVED', 'ARCHIVED'] as const;
export const GOAL_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'ACHIEVED'] as const;

const goalSchema = new Schema(
  {
    domain: { type: String, enum: DOMAINS, required: true },
    goalText: { type: String, required: true, maxlength: 1000 },
    baseline: { type: String, maxlength: 1000 },
    target: { type: String, maxlength: 1000 },
    measurement: { type: String, maxlength: 1000 },
    accommodations: { type: [String], default: [] },
    interventions: { type: [String], default: [] },
    status: { type: String, enum: GOAL_STATUSES, default: 'NOT_STARTED' },
  },
  { timestamps: false },
);
goalSchema.plugin(toJSONPlugin);

const iepSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    createdById: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: IEP_STATUSES, default: 'DRAFT' },
    language: { type: String, enum: ['en', 'hi'], default: 'en' },
    presentLevels: { type: String, maxlength: 5000 },
    startDate: { type: Date, required: true },
    reviewDate: { type: Date, required: true },
    aiGenerated: { type: Boolean, default: false },
    approvedAt: { type: Date },
    approvedById: { type: Schema.Types.ObjectId, ref: 'User' },
    goals: { type: [goalSchema], default: [] },
  },
  { timestamps: true },
);
iepSchema.index({ studentId: 1, status: 1 });
iepSchema.index({ schoolId: 1, reviewDate: 1 });
iepSchema.index({ 'goals._id': 1 });
// Invariant: at most one APPROVED IEP per student, even under concurrent approvals.
iepSchema.index({ studentId: 1 }, { unique: true, partialFilterExpression: { status: 'APPROVED' }, name: 'one_approved_iep_per_student' });
iepSchema.plugin(toJSONPlugin);

export type IepDoc = HydratedDocument<InferSchemaType<typeof iepSchema>>;
export const Iep = model('Iep', iepSchema);
