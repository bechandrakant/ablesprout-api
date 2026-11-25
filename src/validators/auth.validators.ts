import { z } from 'zod';
import { email, language, password, phone } from './common';

export const registerSchoolBody = z.object({
  school: z.object({
    name: z.string().trim().min(2).max(200),
    city: z.string().trim().min(1).max(100),
    state: z.string().trim().min(1).max(100),
    board: z.string().trim().max(50).optional(),
  }),
  admin: z.object({
    name: z.string().trim().min(1).max(120),
    email,
    password,
    phone: phone.optional(),
    preferredLanguage: language.default('en'),
  }),
});

export const loginBody = z.object({ email, password: z.string().min(1).max(128) });
export const refreshBody = z.object({ refreshToken: z.string().min(1).max(2000) });
