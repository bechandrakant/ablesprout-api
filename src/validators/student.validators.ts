import { z } from 'zod';
import { objectId, paginationQuery } from './common';
import { DISABILITY_CATEGORIES } from '../models/student.model';
import { ASSESSMENT_TYPES, DOMAINS } from '../models/assessment.model';

const studentFields = {
  name: z.string().trim().min(1).max(120),
  dateOfBirth: z.coerce.date().max(new Date(), 'Date of birth cannot be in the future'),
  grade: z.string().trim().min(1).max(20),
  section: z.string().trim().max(10),
  disabilityCategories: z.array(z.enum(DISABILITY_CATEGORIES)).max(10),
  notes: z.string().max(5000),
};

export const createStudentBody = z.object({
  ...studentFields,
  dateOfBirth: studentFields.dateOfBirth.optional(),
  section: studentFields.section.optional(),
  disabilityCategories: studentFields.disabilityCategories.default([]),
  notes: studentFields.notes.optional(),
  educatorIds: z.array(objectId).max(20).optional(),
  parentIds: z.array(objectId).max(10).optional(),
});

export const updateStudentBody = z
  .object(studentFields)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export const listStudentsQuery = paginationQuery.extend({
  search: z.string().trim().min(1).max(100).optional(),
  category: z.enum(DISABILITY_CATEGORIES).optional(),
  grade: z.string().trim().min(1).max(20).optional(),
});

export const assignEducatorsBody = z.object({ educatorIds: z.array(objectId).min(1).max(20) });
export const assignParentsBody = z.object({ parentIds: z.array(objectId).min(1).max(10) });

export const createAssessmentBody = z.object({
  type: z.enum(ASSESSMENT_TYPES),
  domain: z.enum(DOMAINS),
  scores: z
    .record(z.string().trim().min(1).max(60).regex(/^[^$.]+$/, 'Score keys cannot contain "$" or "."'), z.number().int().min(1).max(5))
    .refine((v) => Object.keys(v).length <= 30, 'Too many score items'),
  observations: z.string().max(5000).optional(),
  date: z.coerce.date().max(new Date(Date.now() + 86_400_000)).optional(),
});

export const listAssessmentsQuery = paginationQuery.extend({
  domain: z.enum(DOMAINS).optional(),
});
