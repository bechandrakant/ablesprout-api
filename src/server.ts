import { env } from './config/env';
import { logger } from './config/logger';
import { connectDB, disconnectDB } from './db/connect';
import { createApp } from './app';

async function main() {
  await connectDB();
  const server = createApp().listen(env.PORT, () => logger.info(`AbleSprout API listening on :${env.PORT}`));

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start');
  process.exit(1);
});
