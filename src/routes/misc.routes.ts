import { Router } from 'express';
import { asyncHandler as h } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { authenticate, requireRole } from '../middleware/auth';
import { aiLimiter } from '../middleware/rateLimit';
import { guardObjectIdParams } from '../middleware/objectIdParam';
import * as worksheets from '../controllers/worksheet.controller';
import * as messages from '../controllers/message.controller';
import * as analytics from '../controllers/analytics.controller';
import { adaptWorksheetBody, updateWorksheetBody } from '../validators/worksheet.validators';

export const worksheetRouter = Router();
guardObjectIdParams(worksheetRouter, 'id');
worksheetRouter.use(authenticate);
worksheetRouter.post('/adapt', requireRole('ADMIN', 'EDUCATOR'), aiLimiter, validate({ body: adaptWorksheetBody }), h(worksheets.adapt));
worksheetRouter.get('/:id', h(worksheets.get));
worksheetRouter.patch('/:id', requireRole('ADMIN', 'EDUCATOR'), validate({ body: updateWorksheetBody }), h(worksheets.update));
worksheetRouter.get('/:id/pdf', h(worksheets.pdf));

export const messageRouter = Router();
guardObjectIdParams(messageRouter, 'id');
messageRouter.use(authenticate);
messageRouter.post('/:id/read', h(messages.markRead));

export const analyticsRouter = Router();
guardObjectIdParams(analyticsRouter, 'id');
analyticsRouter.use(authenticate);
analyticsRouter.get('/school', requireRole('ADMIN'), h(analytics.school));
// Student-level progress: admins, the student's educators and the student's parents.
analyticsRouter.get('/students/:id', h(analytics.student));
