import { z } from 'zod';
import { Assessment } from '../models';
import { AuthUser } from '../middleware/auth';
import { getAccessibleStudent, tenantFilter } from '../utils/tenant';
import { Pagination, paginated, toSkip } from '../utils/pagination';
import { audit } from './audit.service';
import { createAssessmentBody } from '../validators/student.validators';

export async function listAssessments(actor: AuthUser, studentId: string, query: Pagination & { domain?: string }) {
  const student = await getAccessibleStudent(actor, studentId);
  const filter = tenantFilter(actor, { studentId: student._id, ...(query.domain ? { domain: query.domain } : {}) });
  const { skip, limit } = toSkip(query);
  const [data, total] = await Promise.all([
    Assessment.find(filter).sort({ date: -1 }).skip(skip).limit(limit),
    Assessment.countDocuments(filter),
  ]);
  return paginated(data, total, query);
}

export async function createAssessment(actor: AuthUser, studentId: string, input: z.infer<typeof createAssessmentBody>) {
  const student = await getAccessibleStudent(actor, studentId, { write: true });
  const assessment = await Assessment.create({
    ...input,
    date: input.date ?? new Date(),
    schoolId: actor.schoolId,
    studentId: student._id,
    educatorId: actor.id,
  });
  await audit(actor, 'CREATE', 'Assessment', assessment._id, {
    studentId: String(student._id),
    type: input.type,
    domain: input.domain,
  });
  return assessment;
}
