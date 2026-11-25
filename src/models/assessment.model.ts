import { InferSchemaType, Schema, model } from 'mongoose';
import { toJSONPlugin } from './plugins';

export const ASSESSMENT_TYPES = ['SCREENING', 'OBSERVATION', 'SKILL'] as const;
export const DOMAINS = [
  'READING',
  'WRITING',
  'MATH',
  'COMMUNICATION',
  'SOCIAL',
  'MOTOR',
  'BEHAVIOUR',
  'DAILY_LIVING',
] as const;
export type Domain = (typeof DOMAINS)[number];

const assessmentSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    educatorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ASSESSMENT_TYPES, required: true },
    domain: { type: String, enum: DOMAINS, required: true },
    scores: { type: Map, of: { type: Number, min: 1, max: 5 }, default: {} },
    observations: { type: String, maxlength: 5000 },
    date: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);
assessmentSchema.index({ studentId: 1, date: -1 });
assessmentSchema.index({ schoolId: 1, createdAt: -1 });
assessmentSchema.plugin(toJSONPlugin);

export type AssessmentDoc = InferSchemaType<typeof assessmentSchema>;
export const Assessment = model('Assessment', assessmentSchema);
