import { Router } from 'express';
import * as ctrl from '../controllers/user.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { authenticate, requireRole } from '../middleware/auth';
import { guardObjectIdParams } from '../middleware/objectIdParam';
import { createUserBody, listUsersQuery, updateUserBody } from '../validators/user.validators';

const r = Router();
guardObjectIdParams(r, 'id');
r.use(authenticate);
r.post('/', requireRole('ADMIN'), validate({ body: createUserBody }), asyncHandler(ctrl.create));
r.get('/', requireRole('ADMIN', 'EDUCATOR'), validate({ query: listUsersQuery }), asyncHandler(ctrl.list));
// Admin can edit anyone in the school; any user can edit their own profile.
r.patch('/:id', validate({ body: updateUserBody }), asyncHandler(ctrl.update));
export default r;
