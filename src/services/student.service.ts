import { Types } from 'mongoose';
import { z } from 'zod';
import { Assessment, Iep, Message, ProgressEntry, Student, User, Worksheet } from '../models';
import { AuthUser } from '../middleware/auth';
import { getAccessibleStudent, studentScope, tenantFilter } from '../utils/tenant';
import { badRequest, forbidden } from '../utils/errors';
import { oid } from '../utils/objectId';
import { Pagination, paginated, toSkip } from '../utils/pagination';
import { audit, changedFields } from './audit.service';
import { withTransaction } from '../db/transaction';
import { createStudentBody, updateStudentBody } from '../validators/student.validators';

/** Ensures every id is a user of the given role in the actor's school. */
async function assertUsersInSchool(actor: AuthUser, ids: string[], role: 'EDUCATOR' | 'PARENT') {
  const unique = [...new Set(ids)];
  const count = await User.countDocuments(tenantFilter(actor, { _id: { $in: unique.map(oid) }, role }));
  if (count !== unique.length) throw badRequest(`All ids must be ${role.toLowerCase()}s in your school`);
  return unique.map(oid);
}

export async function listStudents(
  actor: AuthUser,
  query: Pagination & { search?: string; category?: string; grade?: string },
) {
  const filter = studentScope(actor);
  if (query.search) filter.$text = { $search: query.search };
  if (query.category) filter.disabilityCategories = query.category;
  if (query.grade) filter.grade = query.grade;
  const { skip, limit } = toSkip(query);
  const [data, total] = await Promise.all([
    Student.find(filter)
      .sort(query.search ? { score: { $meta: 'textScore' } } : { name: 1 })
      .skip(skip)
      .limit(limit),
    Student.countDocuments(filter),
  ]);
  return paginated(data, total, query);
}

export async function createStudent(actor: AuthUser, input: z.infer<typeof createStudentBody>) {
  const educatorIds = input.educatorIds?.length ? await assertUsersInSchool(actor, input.educatorIds, 'EDUCATOR') : [];
  const parentIds = input.parentIds?.length ? await assertUsersInSchool(actor, input.parentIds, 'PARENT') : [];
  // An educator creating a student is automatically on that student's team.
  if (actor.role === 'EDUCATOR' && !educatorIds.some((id) => id.equals(actor.id))) educatorIds.push(oid(actor.id));

  const student = await Student.create({ ...input, schoolId: actor.schoolId, educatorIds, parentIds });
  await audit(actor, 'CREATE', 'Student', student._id, { disabilityCategories: student.disabilityCategories });
  return student;
}

/** Student plus the names of their team. Parents see names only; staff also see contact emails. */
export async function getStudent(actor: AuthUser, id: string) {
  const student = await getAccessibleStudent(actor, id);
  const users = await User.find(tenantFilter(actor, { _id: { $in: [...student.educatorIds, ...student.parentIds] } })).select(
    'name role email preferredLanguage',
  );
  const card = (u: (typeof users)[number]) => ({
    id: String(u._id),
    name: u.name,
    role: u.role,
    ...(actor.role !== 'PARENT' ? { email: u.email, preferredLanguage: u.preferredLanguage } : {}),
  });
  return {
    student,
    team: {
      educators: users.filter((u) => u.role === 'EDUCATOR').map(card),
      parents: users.filter((u) => u.role === 'PARENT').map(card),
    },
  };
}

export async function updateStudent(actor: AuthUser, id: string, input: z.infer<typeof updateStudentBody>) {
  const student = await getAccessibleStudent(actor, id, { write: true });
  student.set(input);
  await student.save();
  await audit(actor, 'UPDATE', 'Student', student._id, changedFields(input));
  return student;
}

export async function addEducators(actor: AuthUser, id: string, educatorIds: string[]) {
  const student = await getAccessibleStudent(actor, id, { write: true });
  const ids = await assertUsersInSchool(actor, educatorIds, 'EDUCATOR');
  const updated = await Student.findOneAndUpdate(
    tenantFilter(actor, { _id: student._id }),
    { $addToSet: { educatorIds: { $each: ids } } },
    { new: true },
  );
  await audit(actor, 'UPDATE', 'Student', student._id, { addedEducatorIds: educatorIds });
  return updated!;
}

export async function addParents(actor: AuthUser, id: string, parentIds: string[]) {
  const student = await getAccessibleStudent(actor, id, { write: true });
  const ids = await assertUsersInSchool(actor, parentIds, 'PARENT');
  const updated = await Student.findOneAndUpdate(
    tenantFilter(actor, { _id: student._id }),
    { $addToSet: { parentIds: { $each: ids } } },
    { new: true },
  );
  await audit(actor, 'UPDATE', 'Student', student._id, { addedParentIds: parentIds });
  return updated!;
}

/**
 * Erases a student and all linked records (DPDP Act 2023 right to erasure) in one transaction.
 * The audit entry is kept: it records that erasure happened, without personal data.
 */
export async function deleteStudent(actor: AuthUser, id: string) {
  if (actor.role !== 'ADMIN') throw forbidden();
  const student = await getAccessibleStudent(actor, id);
  const studentId: Types.ObjectId = student._id;
  await withTransaction(async (session) => {
    const f = tenantFilter(actor, { studentId });
    const counts = {
      assessments: (await Assessment.deleteMany(f, { session })).deletedCount,
      ieps: (await Iep.deleteMany(f, { session })).deletedCount,
      progressEntries: (await ProgressEntry.deleteMany(f, { session })).deletedCount,
      worksheets: (await Worksheet.deleteMany(f, { session })).deletedCount,
      messages: (await Message.deleteMany(f, { session })).deletedCount,
    };
    await Student.deleteOne(tenantFilter(actor, { _id: studentId }), { session });
    await audit(actor, 'DELETE', 'Student', studentId, { cascade: counts }, session);
  });
}
