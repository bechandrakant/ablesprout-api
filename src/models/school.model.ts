import { InferSchemaType, Schema, model } from 'mongoose';
import { toJSONPlugin } from './plugins';

const schoolSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    city: { type: String, required: true, trim: true, maxlength: 100 },
    state: { type: String, required: true, trim: true, maxlength: 100 },
    board: { type: String, trim: true, maxlength: 50 }, // CBSE, ICSE, State Board...
  },
  { timestamps: true },
);
schoolSchema.plugin(toJSONPlugin);

export type SchoolDoc = InferSchemaType<typeof schoolSchema>;
export const School = model('School', schoolSchema);
