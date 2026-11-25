import { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors';
import { logger } from '../config/logger';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` } });
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Something went wrong';
  let details: unknown;

  if (err instanceof AppError) {
    ({ status, code, message, details } = err);
  } else if (err instanceof ZodError) {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Request validation failed';
    details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Data validation failed';
    details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
  } else if (err instanceof mongoose.Error.CastError) {
    status = 404;
    code = 'NOT_FOUND';
    message = 'Resource not found';
  } else if ((err as { code?: number })?.code === 11000) {
    status = 409;
    code = 'DUPLICATE';
    const fields = Object.keys((err as { keyValue?: object }).keyValue ?? {});
    message = fields.length ? `A record with this ${fields.join(', ')} already exists` : 'Duplicate record';
  } else if ((err as { type?: string })?.type === 'entity.parse.failed') {
    status = 400;
    code = 'INVALID_JSON';
    message = 'Request body is not valid JSON';
  } else if ((err as { type?: string })?.type === 'entity.too.large') {
    status = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request body is too large';
  }

  if (status >= 500) logger.error({ err, path: req.path }, 'Unhandled error');

  res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
};
