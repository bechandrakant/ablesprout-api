import { FilterQuery } from 'mongoose';
import { AuthUser } from '../middleware/auth';
import { oid } from './objectId';
import { Student, StudentDoc } from '../models';
import { forbidden, notFound } from './errors';

/**
 * Tenant isolation: every query goes through this helper so `schoolId` always comes from the
 * verified JWT, and is applied last so caller-supplied filters can never override it.
 */
export function tenantFilter<T>(user: AuthUser, filter: FilterQuery<T> = {}): FilterQuery<T> {
  return { ...filter, schoolId: oid(user.schoolId) } as FilterQuery<T>;
}

/** Row-level scope for students: admin = whole school, educator = assigned, parent = own child. */
export function studentScope(user: AuthUser): FilterQuery<StudentDoc> {
  const filter: FilterQuery<StudentDoc> = {};
  if (user.role === 'EDUCATOR') filter.educatorIds = oid(user.id);
  if (user.role === 'PARENT') filter.parentIds = oid(user.id);
  return tenantFilter(user, filter);
}

/**
 * Loads a student the user may see. Inaccessible and non-existent students both return 404,
 * so the API never reveals whether a record exists in another school / caseload.
 * `write` additionally rejects parents (read-only role).
 */
export async function getAccessibleStudent(
  user: AuthUser,
  studentId: string,
  opts: { write?: boolean } = {},
): Promise<StudentDoc> {
  const student = await Student.findOne({ ...studentScope(user), _id: oid(studentId) });
  if (!student) throw notFound('Student');
  if (opts.write && user.role === 'PARENT') throw forbidden('Parents have read-only access');
  return student;
}
