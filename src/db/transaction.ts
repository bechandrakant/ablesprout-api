import mongoose, { ClientSession } from 'mongoose';
import { logger } from '../config/logger';

/**
 * Runs `fn` inside a MongoDB transaction (requires a replica set or Atlas).
 * The callback may be retried by the driver on transient errors, so it must be idempotent
 * and must pass `session` to every read/write.
 */
export async function withTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } catch (err: unknown) {
    // Standalone mongod (no replica set) cannot run transactions. Surface a clear message.
    const code = (err as { code?: number }).code;
    if (code === 20 || /replica set/i.test(String((err as Error).message))) {
      logger.error('Transactions require a MongoDB replica set (see docker-compose.yml) or Atlas');
    }
    throw err;
  } finally {
    await session.endSession();
  }
}
