import { InferSchemaType, Schema, model } from 'mongoose';
import { toJSONPlugin } from './plugins';

// Separate collection (not embedded in the IEP) so progress history can grow without bound.
const progressEntrySchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    iepId: { type: Schema.Types.ObjectId, ref: 'Iep', required: true },
    goalId: { type: Schema.Types.ObjectId, required: true },
    educatorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    value: { type: Number, required: true, min: 0, max: 100 },
    note: { type: String, maxlength: 2000 },
    date: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);
progressEntrySchema.index({ goalId: 1, date: 1 });
progressEntrySchema.index({ schoolId: 1, date: -1 });
progressEntrySchema.index({ studentId: 1, date: 1 });
progressEntrySchema.plugin(toJSONPlugin);

export type ProgressEntryDoc = InferSchemaType<typeof progressEntrySchema>;
export const ProgressEntry = model('ProgressEntry', progressEntrySchema);
