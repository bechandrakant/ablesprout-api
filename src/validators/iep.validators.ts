import { z } from 'zod';
import { language, objectId, paginationQuery } from './common';
import { DOMAINS } from '../models/assessment.model';
import { GOAL_STATUSES, IEP_STATUSES } from '../models/iep.model';

const str = (max: number) => z.string().trim().min(1).max(max);
const list = z.array(str(300)).max(10);

export const generateIepBody = z.object({
  language: language.optional(),
  startDate: z.coerce.date().optional(),
  focusDomains: z.array(z.enum(DOMAINS)).max(4).optional(),
});

export const goalFields = {
  domain: z.enum(DOMAINS),
  goalText: str(1000),
  baseline: z.string().trim().max(1000),
  target: z.string().trim().max(1000),
  measurement: z.string().trim().max(1000),
  accommodations: list,
  interventions: list,
  status: z.enum(GOAL_STATUSES),
};

const goalInput = z.object({
  id: objectId.optional(), // keep an existing goal's id so its progress history stays linked
  ...goalFields,
  baseline: goalFields.baseline.optional(),
  target: goalFields.target.optional(),
  measurement: goalFields.measurement.optional(),
  accommodations: list.default([]),
  interventions: list.default([]),
  status: goalFields.status.optional(),
});

export const updateIepBody = z
  .object({
    presentLevels: z.string().trim().max(5000),
    startDate: z.coerce.date(),
    reviewDate: z.coerce.date(),
    language,
    goals: z.array(goalInput).max(10),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export const listIepsQuery = paginationQuery.extend({ status: z.enum(IEP_STATUSES).optional() });

export const updateGoalBody = z
  .object(goalFields)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export const createProgressBody = z.object({
  value: z.number().min(0).max(100),
  note: z.string().trim().max(2000).optional(),
  date: z.coerce.date().max(new Date(Date.now() + 86_400_000)).optional(),
});

export const listAllIepsQuery = paginationQuery.extend({
  status: z.enum(IEP_STATUSES).optional(),
  dueWithinDays: z.coerce.number().int().min(1).max(365).optional(),
});

export const recentProgressQuery = z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) });
