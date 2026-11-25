import { Router } from 'express';
import { asyncHandler as h } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { authenticate, requireRole } from '../middleware/auth';
import { aiLimiter } from '../middleware/rateLimit';
import { guardObjectIdParams } from '../middleware/objectIdParam';
import * as students from '../controllers/student.controller';
import * as ieps from '../controllers/iep.controller';
import * as worksheets from '../controllers/worksheet.controller';
import * as messages from '../controllers/message.controller';
import {
  assignEducatorsBody,
  assignParentsBody,
  createAssessmentBody,
  createStudentBody,
  listAssessmentsQuery,
  listStudentsQuery,
  updateStudentBody,
} from '../validators/student.validators';
import { generateIepBody, listIepsQuery } from '../validators/iep.validators';
import { generateWorksheetBody, listWorksheetsQuery } from '../validators/worksheet.validators';
import { createMessageBody, listMessagesQuery } from '../validators/message.validators';

const staff = requireRole('ADMIN', 'EDUCATOR');
const r = Router();
guardObjectIdParams(r, 'id');
r.use(authenticate);

r.get('/', validate({ query: listStudentsQuery }), h(students.list));
r.post('/', staff, validate({ body: createStudentBody }), h(students.create));
r.get('/:id', h(students.get));
r.patch('/:id', staff, validate({ body: updateStudentBody }), h(students.update));
r.delete('/:id', requireRole('ADMIN'), h(students.remove));
r.post('/:id/educators', requireRole('ADMIN'), validate({ body: assignEducatorsBody }), h(students.addEducators));
r.post('/:id/parents', staff, validate({ body: assignParentsBody }), h(students.addParents));

r.get('/:id/assessments', validate({ query: listAssessmentsQuery }), h(students.listAssessments));
r.post('/:id/assessments', staff, validate({ body: createAssessmentBody }), h(students.createAssessment));

r.post('/:id/ieps/generate', staff, aiLimiter, validate({ body: generateIepBody }), h(ieps.generate));
r.get('/:id/ieps', validate({ query: listIepsQuery }), h(ieps.listForStudent));

r.post('/:id/worksheets/generate', staff, aiLimiter, validate({ body: generateWorksheetBody }), h(worksheets.generate));
r.get('/:id/worksheets', validate({ query: listWorksheetsQuery }), h(worksheets.listForStudent));

r.get('/:id/messages', validate({ query: listMessagesQuery }), h(messages.list));
r.post('/:id/messages', validate({ body: createMessageBody }), h(messages.create));

export default r;
