import { Router } from 'express';
import { isObjectId } from '../utils/objectId';
import { notFound } from '../utils/errors';

/** Any :id-style param that isn't a valid ObjectId yields 404 instead of a CastError/500. */
export function guardObjectIdParams(router: Router, ...names: string[]) {
  for (const name of names) {
    router.param(name, (_req, _res, next, value) => {
      if (!isObjectId(value)) return next(notFound());
      next();
    });
  }
}
