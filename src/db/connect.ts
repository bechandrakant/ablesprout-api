import mongoose from 'mongoose';
import { env } from '../config/env';
import { logger } from '../config/logger';

mongoose.set('strictQuery', true);
// NoSQL-injection defence lives at the edge: express-mongo-sanitize strips `$`/`.` keys and
// every input is parsed by a strict Zod schema before it reaches a query.

// Cached across warm serverless invocations (Vercel) so each request doesn't reconnect.
const g = globalThis as unknown as { __mongoose?: Promise<typeof mongoose> };

export function connectDB(uri = env.MONGODB_URI): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) return Promise.resolve(mongoose);
  if (!g.__mongoose) {
    g.__mongoose = mongoose
      .connect(uri, { serverSelectionTimeoutMS: 10_000, maxPoolSize: 10 })
      .then((conn) => {
        logger.info({ host: conn.connection.host, db: conn.connection.name }, 'MongoDB connected');
        return conn;
      })
      .catch((err) => {
        g.__mongoose = undefined; // allow a retry on the next request
        throw err;
      });
  }
  return g.__mongoose;
}

export async function disconnectDB(): Promise<void> {
  g.__mongoose = undefined;
  await mongoose.disconnect();
}
