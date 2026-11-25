import { Router } from 'express';
import { asyncHandler as h } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { authenticate, requireRole } from '../middleware/auth';
import { guardObjectIdParams } from '../middleware/objectIdParam';
import * as ieps from '../controllers/iep.controller';
import { createProgressBody, listAllIepsQuery, recentProgressQuery, updateGoalBody, updateIepBody } from '../validators/iep.validators';
import { paginationQuery } from '../utils/pagination';

const staff = requireRole('ADMIN', 'EDUCATOR');

export const iepRouter = Router();
guardObjectIdParams(iepRouter, 'id');
iepRouter.use(authenticate);
iepRouter.get('/', validate({ query: listAllIepsQuery }), h(ieps.listAll));
iepRouter.get('/:id', h(ieps.get));
iepRouter.patch('/:id', staff, validate({ body: updateIepBody }), h(ieps.update));
iepRouter.post('/:id/approve', staff, h(ieps.approve));
iepRouter.get('/:id/pdf', h(ieps.pdf));

export const goalRouter = Router();
guardObjectIdParams(goalRouter, 'id');
goalRouter.use(authenticate);
goalRouter.patch('/:id', staff, validate({ body: updateGoalBody }), h(ieps.updateGoal));
goalRouter.post('/:id/progress', staff, validate({ body: createProgressBody }), h(ieps.addProgress));
goalRouter.get('/:id/progress', validate({ query: paginationQuery.extend({}) }), h(ieps.listProgress));

export const progressRouter = Router();
progressRouter.use(authenticate);
progressRouter.get('/recent', validate({ query: recentProgressQuery }), h(ieps.recentProgress));
