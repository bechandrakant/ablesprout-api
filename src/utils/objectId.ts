import { Types } from 'mongoose';
import { z } from 'zod';

export const isObjectId = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-f\d]{24}$/i.test(v) && Types.ObjectId.isValid(v);

export const objectId = z.string().refine(isObjectId, { message: 'Invalid id' });

export const oid = (v: string | Types.ObjectId) => (typeof v === 'string' ? new Types.ObjectId(v) : v);
