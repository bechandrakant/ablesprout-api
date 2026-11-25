/**
 * Vercel serverless entry point. vercel.json rewrites every path to this function;
 * Express then routes as usual. The Mongo connection is cached between warm invocations.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from '../src/app';
import { connectDB } from '../src/db/connect';

const app = createApp();

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await connectDB();
  return app(req as never, res as never);
}
