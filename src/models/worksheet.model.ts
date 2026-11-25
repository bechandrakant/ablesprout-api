import { InferSchemaType, Schema, model } from 'mongoose';
import { toJSONPlugin } from './plugins';

export const ADAPTATIONS = [
  'dyslexia_font',
  'large_print',
  'chunked_steps',
  'visual_supports',
  'simplified_language',
  'extra_spacing',
  'high_contrast',
] as const;
export type Adaptation = (typeof ADAPTATIONS)[number];
export const ANSWER_TYPES = ['short_text', 'long_text', 'multiple_choice', 'true_false', 'number', 'draw', 'match'] as const;

const questionSchema = new Schema(
  {
    text: { type: String, required: true, maxlength: 2000 },
    answerType: { type: String, enum: ANSWER_TYPES, default: 'short_text' },
    options: { type: [String], default: undefined },
  },
  { _id: false },
);
const sectionSchema = new Schema(
  {
    heading: { type: String, maxlength: 300 },
    instructions: { type: String, maxlength: 2000 },
    questions: { type: [questionSchema], default: [] },
  },
  { _id: false },
);

const worksheetSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true },
    // Optional: /worksheets/adapt can be used without a specific learner.
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', default: null },
    createdById: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    goalId: { type: Schema.Types.ObjectId, default: null },
    title: { type: String, required: true, maxlength: 300 },
    subject: { type: String, maxlength: 100 },
    level: { type: String, maxlength: 100 },
    language: { type: String, enum: ['en', 'hi'], default: 'en' },
    adaptations: { type: [{ type: String, enum: ADAPTATIONS }], default: [] },
    content: {
      sections: { type: [sectionSchema], default: [] },
    },
    sourceText: { type: String, maxlength: 20000 },
    aiGenerated: { type: Boolean, default: true },
  },
  { timestamps: true },
);
worksheetSchema.index({ studentId: 1, createdAt: -1 });
worksheetSchema.index({ schoolId: 1, createdAt: -1 });
worksheetSchema.plugin(toJSONPlugin);

export type WorksheetDoc = InferSchemaType<typeof worksheetSchema>;
export const Worksheet = model('Worksheet', worksheetSchema);
