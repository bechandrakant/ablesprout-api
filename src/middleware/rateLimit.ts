import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';
import { env, isTest } from '../config/env';

/**
 * The Next.js frontend proxies auth calls server-side, so every login would otherwise share the
 * frontend server's IP. When the request carries the shared proxy secret, trust its X-Client-IP.
 */
export function clientKey(req: Request): string {
  const secret = req.headers['x-proxy-secret'];
  const clientIp = req.headers['x-client-ip'];
  if (env.PROXY_SHARED_SECRET && secret === env.PROXY_SHARED_SECRET && typeof clientIp === 'string' && clientIp) {
    return ipKeyGenerator(clientIp.split(',')[0].trim());
  }
  return ipKeyGenerator(req.ip ?? '');
}

const common = {
  standardHeaders: 'draft-7' as const,
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' } },
};

export const apiLimiter = rateLimit({ ...common, windowMs: 15 * 60_000, limit: env.API_RATE_LIMIT, keyGenerator: clientKey });
export const authLimiter = rateLimit({ ...common, windowMs: 15 * 60_000, limit: env.AUTH_RATE_LIMIT, keyGenerator: clientKey });
/** LLM calls are slow and cost money: limit per authenticated user. */
export const aiLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60_000,
  limit: 60,
  keyGenerator: (req) => req.user?.id ?? clientKey(req),
});
