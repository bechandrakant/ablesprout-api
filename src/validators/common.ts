import { z } from 'zod';
import { objectId } from '../utils/objectId';
import { paginationQuery } from '../utils/pagination';

export const idParams = z.object({ id: objectId });
export const language = z.enum(['en', 'hi']);
export const password = z.string().min(8, 'Password must be at least 8 characters').max(128);
export const email = z.string().trim().toLowerCase().email().max(254);
export const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9\s-]{7,20}$/, 'Invalid phone number');
export { objectId, paginationQuery };
