import { Types } from 'mongoose';
import { z } from 'zod';
import { Assessment, Iep, IepDoc, ProgressEntry, School, Student, User } from '../models';
import { renderIepPdf } from './pdf.service';
import { AuthUser } from '../middleware/auth';
import { getAccessibleStudent, studentScope, tenantFilter } from '../utils/tenant';
import { badRequest, conflict, notFound } from '../utils/errors';
import { oid } from '../utils/objectId';
import { Pagination, paginated, toSkip } from '../utils/pagination';
import { audit, changedFields } from './audit.service';
import { withTransaction } from '../db/transaction';
import { createAnonymizer, scrubContactDetails } from '../ai/anonymize';
import { generateJSON } from '../ai/generate';
import { IEP_SYSTEM, buildIepPrompt } from '../ai/prompts/iep.prompt';
import { IepOutputSchema } from '../ai/schemas';
import { createProgressBody, generateIepBody, updateGoalBody, updateIepBody } from '../validators/iep.validators';
import { Language } from '../models/user.model';

const ageInYears = (dob?: Date | null) =>
  dob ? Math.floor((Date.now() - dob.getTime()) / (365.25 * 86_400_000)) : undefined;

/** Loads an IEP in the actor's school and enforces access to its student. */
export async function getAccessibleIep(actor: AuthUser, iepId: string, opts: { write?: boolean } = {}) {
  const iep = await Iep.findOne(tenantFilter(actor, { _id: oid(iepId) }));
  // Parents only ever see finalised plans, never work-in-progress drafts.
  if (!iep || (actor.role === 'PARENT' && iep.status === 'DRAFT')) throw notFound('IEP');
  const student = await getAccessibleStudent(actor, String(iep.studentId), opts);
  return { iep, student };
}

async function getAccessibleGoal(actor: AuthUser, goalId: string, opts: { write?: boolean } = {}) {
  const iep = await Iep.findOne(tenantFilter(actor, { 'goals._id': oid(goalId) }));
  if (!iep || (actor.role === 'PARENT' && iep.status === 'DRAFT')) throw notFound('Goal');
  const student = await getAccessibleStudent(actor, String(iep.studentId), opts);
  const goal = iep.goals.id(goalId);
  if (!goal) throw notFound('Goal');
  return { iep, goal, student };
}

export async function generateIep(actor: AuthUser, studentId: string, input: z.infer<typeof generateIepBody>) {
  const student = await getAccessibleStudent(actor, studentId, { write: true });
  const assessments = await Assessment.find(tenantFilter(actor, { studentId: student._id }))
    .sort({ date: -1 })
    .limit(12);
  const language: Language =
    input.language ?? ((await User.findById(actor.id).select('preferredLanguage'))?.preferredLanguage as Language) ?? 'en';

  // Privacy: the LLM only ever sees "the student" – never the name or contact details.
  const anon = createAnonymizer(student.name);
  const clean = (t?: string | null) => scrubContactDetails(anon.scrub(t));
  const prompt = buildIepPrompt({
    ageYears: ageInYears(student.dateOfBirth),
    grade: student.grade,
    disabilityCategories: student.disabilityCategories,
    notes: clean(student.notes),
    focusDomains: input.focusDomains,
    language,
    assessments: assessments.map((a) => ({
      type: a.type,
      domain: a.domain,
      date: a.date.toISOString().slice(0, 10),
      scores: Object.fromEntries(Array.from(a.scores?.entries() ?? []).map(([k, v]) => [clean(k), v])),
      observations: clean(a.observations),
    })),
  });

  const output = anon.restore(
    await generateJSON({
      task: 'iep.generate',
      system: IEP_SYSTEM,
      prompt,
      schema: IepOutputSchema,
      context: { schoolId: actor.schoolId, studentId: String(student._id), userId: actor.id },
    }),
  );

  const startDate = input.startDate ?? new Date();
  const reviewDate = new Date(startDate.getTime() + output.suggestedReviewWeeks * 7 * 86_400_000);
  // Always saved as an editable DRAFT; approval is an explicit human action.
  const iep = await Iep.create({
    schoolId: actor.schoolId,
    studentId: student._id,
    createdById: actor.id,
    status: 'DRAFT',
    language,
    aiGenerated: true,
    presentLevels: output.presentLevels,
    startDate,
    reviewDate,
    goals: output.goals.map((g) => ({ ...g, status: 'NOT_STARTED' })),
  });
  await audit(actor, 'GENERATE', 'IEP', iep._id, { studentId: String(student._id), goals: iep.goals.length });
  return iep;
}

export async function listIeps(actor: AuthUser, studentId: string, query: Pagination & { status?: string }) {
  const student = await getAccessibleStudent(actor, studentId);
  const status = actor.role === 'PARENT' ? { $in: query.status && query.status !== 'DRAFT' ? [query.status] : ['APPROVED', 'ARCHIVED'] } : query.status;
  const filter = tenantFilter(actor, { studentId: student._id, ...(status ? { status } : {}) });
  const { skip, limit } = toSkip(query);
  const [data, total] = await Promise.all([
    Iep.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Iep.countDocuments(filter),
  ]);
  return paginated(data, total, query);
}

export async function updateIep(actor: AuthUser, iepId: string, input: z.infer<typeof updateIepBody>) {
  const { iep } = await getAccessibleIep(actor, iepId, { write: true });
  if (iep.status === 'ARCHIVED') throw conflict('Archived IEPs cannot be edited');

  const { goals, ...rest } = input;
  iep.set(rest);
  if (goals) {
    const existing = new Set(iep.goals.map((g) => String(g._id)));
    iep.set(
      'goals',
      goals.map(({ id, ...g }) => {
        if (id && !existing.has(id)) throw badRequest(`Goal ${id} does not belong to this IEP`);
        return { ...g, ...(id ? { _id: oid(id) } : {}) };
      }),
    );
  }
  if (iep.reviewDate <= iep.startDate) throw badRequest('reviewDate must be after startDate');
  await iep.save();
  await audit(actor, 'UPDATE', 'IEP', iep._id, changedFields(input));
  return iep;
}

/** Approves a DRAFT and archives the student's previously APPROVED IEP, atomically. */
export async function approveIep(actor: AuthUser, iepId: string) {
  const { iep: found } = await getAccessibleIep(actor, iepId, { write: true });
  if (found.status !== 'DRAFT') throw conflict(`Only DRAFT IEPs can be approved (this one is ${found.status})`);
  if (!found.goals.length) throw badRequest('An IEP needs at least one goal before approval');

  return withTransaction(async (session) => {
    const iep = await Iep.findOne(tenantFilter(actor, { _id: found._id, status: 'DRAFT' })).session(session);
    if (!iep) throw conflict('IEP was changed by someone else; reload and try again');
    const archived = await Iep.updateMany(
      tenantFilter(actor, { studentId: iep.studentId, status: 'APPROVED', _id: { $ne: iep._id } }),
      { $set: { status: 'ARCHIVED' } },
      { session },
    );
    iep.status = 'APPROVED';
    iep.approvedAt = new Date();
    iep.approvedById = new Types.ObjectId(actor.id);
    await iep.save({ session });
    await audit(actor, 'APPROVE', 'IEP', iep._id, { archivedCount: archived.modifiedCount }, session);
    return iep;
  });
}

export async function updateGoal(actor: AuthUser, goalId: string, input: z.infer<typeof updateGoalBody>) {
  const { iep } = await getAccessibleGoal(actor, goalId, { write: true });
  if (iep.status === 'ARCHIVED') throw conflict('Goals on archived IEPs cannot be edited');
  const $set = Object.fromEntries(Object.entries(input).map(([k, v]) => [`goals.$.${k}`, v]));
  const updated = (await Iep.findOneAndUpdate(
    tenantFilter(actor, { _id: iep._id, 'goals._id': oid(goalId) }),
    { $set },
    { new: true, runValidators: true },
  )) as IepDoc;
  await audit(actor, 'UPDATE', 'IEP', iep._id, { goalId, ...changedFields(input) });
  return updated.goals.id(goalId)!;
}

export async function addProgress(actor: AuthUser, goalId: string, input: z.infer<typeof createProgressBody>) {
  const { iep, student } = await getAccessibleGoal(actor, goalId, { write: true });
  if (iep.status !== 'APPROVED') throw conflict('Progress can only be recorded on an APPROVED IEP');
  const entry = await ProgressEntry.create({
    schoolId: actor.schoolId,
    studentId: student._id,
    iepId: iep._id,
    goalId: oid(goalId),
    educatorId: actor.id,
    value: input.value,
    note: input.note,
    date: input.date ?? new Date(),
  });
  // First data point moves the goal from NOT_STARTED to IN_PROGRESS.
  await Iep.updateOne(
    tenantFilter(actor, { _id: iep._id }),
    { $set: { 'goals.$[g].status': 'IN_PROGRESS' } },
    { arrayFilters: [{ 'g._id': oid(goalId), 'g.status': 'NOT_STARTED' }] },
  );
  return entry;
}

export async function listProgress(actor: AuthUser, goalId: string, query: Pagination) {
  await getAccessibleGoal(actor, goalId);
  const filter = tenantFilter(actor, { goalId: oid(goalId) });
  const { skip, limit } = toSkip(query);
  const [data, total] = await Promise.all([
    ProgressEntry.find(filter).sort({ date: 1 }).skip(skip).limit(limit),
    ProgressEntry.countDocuments(filter),
  ]);
  return paginated(data, total, query);
}

export async function iepPdf(actor: AuthUser, iepId: string, out: import('stream').Writable) {
  const { iep, student } = await getAccessibleIep(actor, iepId);
  const [school, approver] = await Promise.all([
    School.findById(actor.schoolId),
    iep.approvedById ? User.findOne(tenantFilter(actor, { _id: iep.approvedById })).select('name') : null,
  ]);
  await audit(actor, 'EXPORT', 'IEP', iep._id, { format: 'pdf' });
  renderIepPdf(
    {
      school: { name: school?.name ?? 'School', city: school?.city, state: school?.state },
      student: {
        name: student.name,
        grade: student.grade,
        section: student.section,
        dateOfBirth: student.dateOfBirth,
        disabilityCategories: student.disabilityCategories,
      },
      iep: iep.toObject() as never,
      approvedByName: approver?.name,
    },
    out,
  );
  return { filename: `IEP-${student.name.replace(/[^\w]+/g, '_')}-${iep.status}.pdf` };
}

/** Ids of every student the actor can see (whole school for admins). */
async function accessibleStudentIds(actor: AuthUser) {
  return Student.find(studentScope(actor)).distinct('_id');
}

/** IEPs across the actor's caseload, e.g. `?status=APPROVED&dueWithinDays=30` for "due for review". */
export async function listAllIeps(actor: AuthUser, query: Pagination & { status?: string; dueWithinDays?: number }) {
  const filter: Record<string, unknown> = { studentId: { $in: await accessibleStudentIds(actor) } };
  if (actor.role === 'PARENT') filter.status = { $in: ['APPROVED', 'ARCHIVED'] };
  if (query.status && !(actor.role === 'PARENT' && query.status === 'DRAFT')) filter.status = query.status;
  if (query.dueWithinDays) {
    filter.reviewDate = { $gte: new Date(), $lte: new Date(Date.now() + query.dueWithinDays * 86_400_000) };
  }
  const scoped = tenantFilter(actor, filter);
  const { skip, limit } = toSkip(query);
  const [data, total] = await Promise.all([
    Iep.find(scoped)
      .sort(query.dueWithinDays ? { reviewDate: 1 } : { updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('studentId', 'name grade section'),
    Iep.countDocuments(scoped),
  ]);
  return paginated(data, total, query);
}

/** Latest progress entries across the actor's caseload, with student name and goal text. */
export async function recentProgress(actor: AuthUser, limit: number) {
  const entries = await ProgressEntry.find(tenantFilter(actor, { studentId: { $in: await accessibleStudentIds(actor) } }))
    .sort({ date: -1, createdAt: -1 })
    .limit(limit)
    .populate('studentId', 'name');
  const ieps = await Iep.find(tenantFilter(actor, { _id: { $in: [...new Set(entries.map((e) => String(e.iepId)))].map(oid) } })).select('goals');
  const goals = new Map(ieps.flatMap((i) => i.goals.map((g) => [String(g._id), { goalText: g.goalText, domain: g.domain }] as const)));
  return {
    data: entries.map((e) => ({ ...e.toJSON(), goal: goals.get(String(e.goalId)) ?? null })),
  };
}
