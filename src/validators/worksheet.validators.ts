import { z } from 'zod';
import { language, objectId, paginationQuery } from './common';
import { ADAPTATIONS, ANSWER_TYPES } from '../models/worksheet.model';

const adaptations = z.array(z.enum(ADAPTATIONS)).max(ADAPTATIONS.length).default([]);

export const generateWorksheetBody = z.object({
  subject: z.string().trim().min(1).max(100),
  topic: z.string().trim().min(1).max(200),
  goalId: objectId.optional(),
  adaptations,
  language: language.default('en'),
});

export const adaptWorksheetBody = z.object({
  sourceText: z.string().trim().min(20, 'sourceText is too short to adapt').max(20000),
  adaptations: adaptations.refine((a) => a.length > 0, 'Choose at least one adaptation'),
  language: language.default('en'),
  studentId: objectId.optional(), // tailor to (and save under) a learner
  subject: z.string().trim().max(100).optional(),
});

export const listWorksheetsQuery = paginationQuery;

const question = z.object({
  text: z.string().trim().min(1).max(2000),
  answerType: z.enum(ANSWER_TYPES),
  options: z.array(z.string().trim().min(1).max(300)).max(8).optional(),
});

/** Educator edits to an AI-generated worksheet before printing/sharing. */
export const updateWorksheetBody = z
  .object({
    title: z.string().trim().min(1).max(300),
    level: z.string().trim().max(100),
    adaptations,
    content: z.object({
      sections: z
        .array(
          z.object({
            heading: z.string().trim().max(300).optional(),
            instructions: z.string().trim().max(2000).optional(),
            questions: z.array(question).max(15),
          }),
        )
        .min(1)
        .max(6),
    }),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
