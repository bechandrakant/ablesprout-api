import { z } from 'zod';
import { DOMAINS } from '../models/assessment.model';
import { ANSWER_TYPES } from '../models/worksheet.model';

const text = (max: number) => z.string().trim().min(1).max(max);

export const IepOutputSchema = z.object({
  presentLevels: text(5000),
  goals: z
    .array(
      z.object({
        domain: z.enum(DOMAINS),
        goalText: text(1000),
        baseline: text(1000),
        target: text(1000),
        measurement: text(1000),
        accommodations: z.array(text(300)).min(1).max(8),
        interventions: z.array(text(300)).min(1).max(8),
      }),
    )
    .min(3)
    .max(5),
  suggestedReviewWeeks: z.number().int().min(4).max(52),
});
export type IepOutput = z.infer<typeof IepOutputSchema>;

export const WorksheetOutputSchema = z.object({
  title: text(300),
  level: text(100),
  sections: z
    .array(
      z.object({
        heading: text(300),
        instructions: text(2000),
        questions: z
          .array(
            z
              .object({
                text: text(2000),
                answerType: z.enum(ANSWER_TYPES),
                options: z.array(text(300)).min(2).max(8).optional(),
              })
              .refine((q) => !['multiple_choice', 'match'].includes(q.answerType) || q.options?.length, {
                message: 'options are required for multiple_choice and match questions',
              }),
          )
          .min(1)
          .max(15),
      }),
    )
    .min(1)
    .max(6),
});
export type WorksheetOutput = z.infer<typeof WorksheetOutputSchema>;
