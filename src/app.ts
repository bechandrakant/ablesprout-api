import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import mongoSanitize from 'express-mongo-sanitize';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import mongoose from 'mongoose';
import { randomUUID } from 'crypto';
import { env } from './config/env';
import { logger } from './config/logger';
import api from './routes';
import { apiLimiter } from './middleware/rateLimit';
import { errorHandler, notFoundHandler } from './middleware/error';
import { openApiSpec } from './docs/openapi';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req.headers['x-request-id'] as string) || randomUUID(),
      customProps: (req) => ({ userId: (req as express.Request).user?.id }),
      autoLogging: { ignore: (req) => req.url === '/health' },
    }),
  );
  // Swagger UI needs inline scripts/styles, so it gets a helmet config without CSP (mounted first).
  app.get('/api/docs.json', (_req, res) => res.json(openApiSpec));
  app.use(
    '/api/docs',
    helmet({ contentSecurityPolicy: false }),
    swaggerUi.serve,
    swaggerUi.setup(openApiSpec, { customSiteTitle: 'AbleSprout API' }),
  );

  app.use(helmet());
  // FRONTEND_URL is a comma-separated allow-list; `*` is a wildcard (e.g. https://ablesprout-ui-*.vercel.app for previews).
  const origins = env.FRONTEND_URL.split(',')
    .map((o) => o.trim())
    .filter(Boolean)
    .map((o) => (o.includes('*') ? new RegExp(`^${o.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[a-z0-9-]+')}$`) : o));
  app.use(cors({ origin: origins, credentials: true, exposedHeaders: ['Content-Disposition'] }));
  app.use(express.json({ limit: '256kb' }));
  // Strips keys starting with `$` or containing `.` from body/query/params (NoSQL injection).
  app.use(mongoSanitize({ replaceWith: '_' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', db: mongoose.connection.readyState === 1 ? 'up' : 'down' });
  });

  app.use('/api/v1', apiLimiter, api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
