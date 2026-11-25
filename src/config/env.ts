import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  MONGODB_URI: z.string().min(1).default('mongodb://localhost:27017/ablesprout'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('1h'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(7),
  // Logins/refreshes per IP per 15 minutes (raise for E2E runs that sign in many times).
  // All /api/v1 requests per IP per 15 minutes. Raise it if a whole school shares one IP (NAT) or for E2E runs.
  API_RATE_LIMIT: z.coerce.number().int().positive().default(600),
  AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(20),
  LLM_PROVIDER: z.enum(['anthropic', 'openai', 'mock']).default('anthropic'),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().optional(),
  // Shared with the Next.js frontend's auth proxy so rate limits key on the real client IP.
  PROXY_SHARED_SECRET: z.string().min(16).optional(),
  DYSLEXIA_FONT_PATH: z.string().optional(),
  HINDI_FONT_PATH: z.string().optional(),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isTest = env.NODE_ENV === 'test';
