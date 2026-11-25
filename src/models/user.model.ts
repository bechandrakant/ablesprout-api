import { HydratedDocument, InferSchemaType, Schema, model } from 'mongoose';
import { toJSONPlugin } from './plugins';

export const ROLES = ['ADMIN', 'EDUCATOR', 'PARENT'] as const;
export type Role = (typeof ROLES)[number];
export const LANGUAGES = ['en', 'hi'] as const;
export type Language = (typeof LANGUAGES)[number];

const refreshTokenSchema = new Schema(
  { tokenHash: { type: String, required: true }, expiresAt: { type: Date, required: true } },
  { _id: false },
);

const userSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    phone: { type: String, trim: true, maxlength: 20 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true },
    preferredLanguage: { type: String, enum: LANGUAGES, default: 'en' },
    refreshTokens: { type: [refreshTokenSchema], default: [], select: false },
  },
  { timestamps: true },
);
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ schoolId: 1, role: 1 });
userSchema.plugin(toJSONPlugin);

export type UserDoc = HydratedDocument<InferSchemaType<typeof userSchema>>;
export const User = model('User', userSchema);
