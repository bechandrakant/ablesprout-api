import { z } from 'zod';
import { email, language, paginationQuery, password, phone } from './common';

export const createUserBody = z.object({
  name: z.string().trim().min(1).max(120),
  email,
  role: z.enum(['EDUCATOR', 'PARENT']),
  phone: phone.optional(),
  preferredLanguage: language.default('en'),
  password: password.optional(), // if omitted a temporary password is generated and returned once
});

export const listUsersQuery = paginationQuery.extend({
  role: z.enum(['ADMIN', 'EDUCATOR', 'PARENT']).optional(),
});

export const updateUserBody = z
  .object({
    name: z.string().trim().min(1).max(120),
    phone: phone.nullable(),
    preferredLanguage: language,
    role: z.enum(['EDUCATOR', 'PARENT']),
    password,
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
