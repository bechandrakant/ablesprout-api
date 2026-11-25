import { RequestHandler } from 'express';
import { AnyZodObject, ZodTypeAny } from 'zod';

type Schemas = { body?: ZodTypeAny; query?: AnyZodObject; params?: AnyZodObject };

/** Parses and replaces req.body / req.query / req.params with the Zod-parsed values. */
export const validate =
  (schemas: Schemas): RequestHandler =>
  (req, _res, next) => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) req.query = schemas.query.parse(req.query);
      if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
      next();
    } catch (err) {
      next(err);
    }
  };
