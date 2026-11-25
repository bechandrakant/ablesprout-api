import { PipelineStage } from 'mongoose';
import { Assessment, Iep, ProgressEntry, Student } from '../models';
import { AuthUser } from '../middleware/auth';
import { getAccessibleStudent } from '../utils/tenant';
import { oid } from '../utils/objectId';

const DAY = 86_400_000;

/** School dashboard, computed with aggregation pipelines. Every $match starts with schoolId. */
export async function schoolAnalytics(actor: AuthUser) {
  const schoolId = oid(actor.schoolId);
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * DAY);
  const ago30 = new Date(now.getTime() - 30 * DAY);

  const [studentStats] = await Student.aggregate<{
    total: { n: number }[];
    byCategory: { category: string; count: number }[];
  }>([
    { $match: { schoolId } },
    {
      $facet: {
        total: [{ $count: 'n' }],
        byCategory: [
          { $unwind: '$disabilityCategories' },
          { $group: { _id: '$disabilityCategories', count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
          { $project: { _id: 0, category: '$_id', count: 1 } },
        ],
      },
    },
  ]);
  const totalStudents = studentStats?.total[0]?.n ?? 0;

  const [iepStats] = await Iep.aggregate<{
    approvedStudents: { n: number }[];
    dueForReview: { iepId: string; studentId: string; studentName: string; reviewDate: Date }[];
    goalStatus: { status: string; count: number }[];
    domainProgress: { domain: string; averageProgress: number; goals: number }[];
  }>([
    { $match: { schoolId, status: { $in: ['APPROVED', 'DRAFT'] } } },
    {
      $facet: {
        approvedStudents: [{ $match: { status: 'APPROVED' } }, { $group: { _id: '$studentId' } }, { $count: 'n' }],
        dueForReview: [
          { $match: { status: 'APPROVED', reviewDate: { $gte: now, $lte: in30 } } },
          { $sort: { reviewDate: 1 } },
          { $limit: 50 },
          { $lookup: { from: 'students', localField: 'studentId', foreignField: '_id', as: 'student', pipeline: [{ $project: { name: 1 } }] } },
          {
            $project: {
              _id: 0,
              iepId: { $toString: '$_id' },
              studentId: { $toString: '$studentId' },
              studentName: { $first: '$student.name' },
              reviewDate: 1,
            },
          },
        ],
        goalStatus: [
          { $match: { status: 'APPROVED' } },
          { $unwind: '$goals' },
          { $group: { _id: '$goals.status', count: { $sum: 1 } } },
          { $project: { _id: 0, status: '$_id', count: 1 } },
          { $sort: { status: 1 } },
        ],
        // Latest progress value per goal, averaged per domain (uses the { goalId, date } index).
        domainProgress: [
          { $match: { status: 'APPROVED' } },
          { $unwind: '$goals' },
          {
            $lookup: {
              from: 'progressentries',
              let: { gid: '$goals._id' },
              pipeline: [
                { $match: { $expr: { $and: [{ $eq: ['$goalId', '$$gid'] }, { $eq: ['$schoolId', schoolId] }] } } },
                { $sort: { date: -1 } },
                { $limit: 1 },
                { $project: { value: 1 } },
              ],
              as: 'latest',
            },
          },
          { $unwind: '$latest' },
          { $group: { _id: '$goals.domain', averageProgress: { $avg: '$latest.value' }, goals: { $sum: 1 } } },
          { $project: { _id: 0, domain: '$_id', averageProgress: { $round: ['$averageProgress', 1] }, goals: 1 } },
          { $sort: { domain: 1 } },
        ],
      },
    },
  ]);

  // Educator activity: union of everything an educator produces in the last 30 days.
  const activity = await ProgressEntry.aggregate<{
    educatorId: string;
    name: string;
    progressEntries: number;
    assessments: number;
    ieps: number;
    worksheets: number;
    total: number;
  }>([
    { $match: { schoolId, createdAt: { $gte: ago30 } } },
    { $project: { userId: '$educatorId', kind: { $literal: 'progressEntries' } } },
    {
      $unionWith: {
        coll: 'assessments',
        pipeline: [{ $match: { schoolId, createdAt: { $gte: ago30 } } }, { $project: { userId: '$educatorId', kind: { $literal: 'assessments' } } }],
      },
    },
    {
      $unionWith: {
        coll: 'ieps',
        pipeline: [{ $match: { schoolId, createdAt: { $gte: ago30 } } }, { $project: { userId: '$createdById', kind: { $literal: 'ieps' } } }],
      },
    },
    {
      $unionWith: {
        coll: 'worksheets',
        pipeline: [{ $match: { schoolId, createdAt: { $gte: ago30 } } }, { $project: { userId: '$createdById', kind: { $literal: 'worksheets' } } }],
      },
    },
    { $group: { _id: { userId: '$userId', kind: '$kind' }, n: { $sum: 1 } } },
    { $group: { _id: '$_id.userId', counts: { $push: { k: '$_id.kind', v: '$n' } }, total: { $sum: '$n' } } },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user', pipeline: [{ $match: { schoolId } }, { $project: { name: 1, role: 1 } }] } },
    { $unwind: '$user' },
    {
      $replaceWith: {
        $mergeObjects: [
          { progressEntries: 0, assessments: 0, ieps: 0, worksheets: 0 },
          { $arrayToObject: '$counts' },
          { educatorId: { $toString: '$_id' }, name: '$user.name', role: '$user.role', total: '$total' },
        ],
      },
    },
    { $sort: { total: -1, name: 1 } },
  ] as PipelineStage[]);

  const approvedStudents = iepStats?.approvedStudents[0]?.n ?? 0;
  return {
    generatedAt: now,
    totalStudents,
    studentsByDisabilityCategory: studentStats?.byCategory ?? [],
    approvedIep: {
      students: approvedStudents,
      percentage: totalStudents ? Math.round((approvedStudents / totalStudents) * 1000) / 10 : 0,
    },
    iepsDueForReview: { within30Days: iepStats?.dueForReview.length ?? 0, items: iepStats?.dueForReview ?? [] },
    goalStatusBreakdown: iepStats?.goalStatus ?? [],
    averageProgressByDomain: iepStats?.domainProgress ?? [],
    educatorActivityLast30Days: activity,
  };
}

/** Goal progress over time for one student (any user who can see the student). */
export async function studentAnalytics(actor: AuthUser, studentId: string) {
  const student = await getAccessibleStudent(actor, studentId);
  const schoolId = oid(actor.schoolId);

  const goals = await ProgressEntry.aggregate([
    { $match: { schoolId, studentId: student._id } },
    { $sort: { date: 1 } },
    {
      $group: {
        _id: '$goalId',
        iepId: { $first: '$iepId' },
        points: { $push: { date: '$date', value: '$value', note: '$note' } },
        first: { $first: '$value' },
        latest: { $last: '$value' },
        entries: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: 'ieps',
        let: { gid: '$_id', iid: '$iepId' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$_id', '$$iid'] }, { $eq: ['$schoolId', schoolId] }] } } },
          { $unwind: '$goals' },
          { $match: { $expr: { $eq: ['$goals._id', '$$gid'] } } },
          { $project: { _id: 0, status: 1, goal: '$goals' } },
        ],
        as: 'iep',
      },
    },
    { $unwind: { path: '$iep', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        goalId: { $toString: '$_id' },
        iepId: { $toString: '$iepId' },
        iepStatus: '$iep.status',
        domain: '$iep.goal.domain',
        goalText: '$iep.goal.goalText',
        goalStatus: '$iep.goal.status',
        entries: 1,
        firstValue: '$first',
        latestValue: '$latest',
        change: { $subtract: ['$latest', '$first'] },
        points: 1,
      },
    },
    { $sort: { domain: 1, goalText: 1 } },
  ]);

  const assessmentTrend = await Assessment.aggregate([
    { $match: { schoolId, studentId: student._id } },
    { $project: { domain: 1, date: 1, avg: { $avg: { $map: { input: { $objectToArray: '$scores' }, in: '$$this.v' } } } } },
    { $sort: { date: 1 } },
    { $group: { _id: '$domain', points: { $push: { date: '$date', averageScore: { $round: ['$avg', 2] } } } } },
    { $project: { _id: 0, domain: '$_id', points: 1 } },
    { $sort: { domain: 1 } },
  ]);

  return { studentId: String(student._id), goals, assessmentTrend };
}
