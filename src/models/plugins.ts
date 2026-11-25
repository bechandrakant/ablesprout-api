import { Schema } from 'mongoose';

const HIDDEN = ['passwordHash', 'refreshTokens', '__v'];

/** Exposes `id` (string) instead of `_id`, strips __v and secrets on every toJSON/toObject. */
export function toJSONPlugin(schema: Schema) {
  const transform = (_doc: unknown, ret: Record<string, unknown>) => {
    if (ret._id !== undefined) {
      ret.id = String(ret._id);
      delete ret._id;
    }
    for (const key of HIDDEN) delete ret[key];
    return ret;
  };
  schema.set('toJSON', { virtuals: false, versionKey: false, transform });
  schema.set('toObject', { virtuals: false, versionKey: false, transform });
}
