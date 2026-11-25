import { HydratedDocument, InferSchemaType, Schema, model } from 'mongoose';
import { toJSONPlugin } from './plugins';

/** The 21 specified disabilities under the Rights of Persons with Disabilities Act, 2016 (Schedule). */
export const RPWD_CATEGORIES = [
  'BLINDNESS',
  'LOW_VISION',
  'LEPROSY_CURED',
  'HEARING_IMPAIRMENT',
  'LOCOMOTOR_DISABILITY',
  'DWARFISM',
  'INTELLECTUAL_DISABILITY',
  'MENTAL_ILLNESS',
  'AUTISM_SPECTRUM_DISORDER',
  'CEREBRAL_PALSY',
  'MUSCULAR_DYSTROPHY',
  'CHRONIC_NEUROLOGICAL_CONDITIONS',
  'SPECIFIC_LEARNING_DISABILITIES',
  'MULTIPLE_SCLEROSIS',
  'SPEECH_AND_LANGUAGE_DISABILITY',
  'THALASSEMIA',
  'HAEMOPHILIA',
  'SICKLE_CELL_DISEASE',
  'MULTIPLE_DISABILITIES',
  'ACID_ATTACK_VICTIM',
  'PARKINSONS_DISEASE',
] as const;
/**
 * ADHD is not a separately listed RPwD category but is commonly supported in schools;
 * keep it as an explicit "support need" so educators can record it.
 */
export const OTHER_SUPPORT_NEEDS = ['ADHD'] as const;
export const DISABILITY_CATEGORIES = [...RPWD_CATEGORIES, ...OTHER_SUPPORT_NEEDS] as const;

const studentSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    dateOfBirth: { type: Date },
    grade: { type: String, required: true, trim: true, maxlength: 20 },
    section: { type: String, trim: true, maxlength: 10 },
    disabilityCategories: {
      type: [{ type: String, enum: DISABILITY_CATEGORIES }],
      default: [],
    },
    notes: { type: String, maxlength: 5000 },
    educatorIds: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
    parentIds: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
  },
  { timestamps: true },
);
studentSchema.index({ schoolId: 1 });
studentSchema.index({ educatorIds: 1 });
studentSchema.index({ parentIds: 1 });
studentSchema.index({ name: 'text' });
studentSchema.plugin(toJSONPlugin);

export type StudentDoc = HydratedDocument<InferSchemaType<typeof studentSchema>>;
export const Student = model('Student', studentSchema);
