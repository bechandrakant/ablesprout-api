import { Router } from 'express';
import * as ctrl from '../controllers/auth.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimit';
import { loginBody, refreshBody, registerSchoolBody } from '../validators/auth.validators';

const r = Router();
r.post('/register-school', authLimiter, validate({ body: registerSchoolBody }), asyncHandler(ctrl.registerSchool));
r.post('/login', authLimiter, validate({ body: loginBody }), asyncHandler(ctrl.login));
r.post('/refresh', authLimiter, validate({ body: refreshBody }), asyncHandler(ctrl.refresh));
r.post('/logout', validate({ body: refreshBody }), asyncHandler(ctrl.logout));
r.get('/me', authenticate, asyncHandler(ctrl.me));
export default r;
