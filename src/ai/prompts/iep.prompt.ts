import { BASE_SYSTEM, languageInstruction } from './common';
import { DOMAINS } from '../../models/assessment.model';
import { Language } from '../../models/user.model';

export interface IepPromptInput {
  ageYears?: number;
  grade: string;
  disabilityCategories: string[];
  notes: string;
  assessments: { type: string; domain: string; date: string; scores: Record<string, number>; observations: string }[];
  focusDomains?: string[];
  language: Language;
}

export const IEP_SYSTEM = `${BASE_SYSTEM}

Your task: draft an Individualised Education Programme (IEP) for a special educator to review. The educator will edit and approve it; you never finalise anything.`;

export function buildIepPrompt(input: IepPromptInput): string {
  return `Draft an IEP for the student described below.

## Student profile
- Age: ${input.ageYears ?? 'not recorded'}
- Grade/class: ${input.grade}
- Recorded support needs (RPwD Act 2016 categories): ${input.disabilityCategories.join(', ') || 'none recorded'}
- Educator notes: ${input.notes || 'none'}
${input.focusDomains?.length ? `- Educator asked to focus on: ${input.focusDomains.join(', ')}` : ''}

## Recent assessments (scores are 1 = needs high support, 5 = independent)
${
  input.assessments.length
    ? input.assessments
        .map(
          (a) =>
            `- ${a.date} | ${a.type} | ${a.domain} | scores: ${JSON.stringify(a.scores)} | observations: ${a.observations || 'none'}`,
        )
        .join('\n')
    : '- No assessments recorded yet. Keep goals foundational and recommend a baseline assessment.'
}

## Requirements
- "presentLevels": 3-6 sentences on current strengths first, then areas for growth, grounded in the assessments.
- "goals": 3 to 5 goals, prioritising the domains with the lowest scores (and any focus domains).
  - Each "goalText" must be SMART: specific, measurable, achievable, relevant, time-bound (e.g. "By <time frame>, the student will ... with ... support in 4 out of 5 trials").
  - "baseline": what the student does now. "target": the measurable end point. "measurement": how and how often the teacher will measure it.
  - "accommodations": 2-4 classroom accommodations (e.g. extra time, seating, large print, visual schedule, oral responses).
  - "interventions": 2-4 concrete teaching strategies the teacher can run in an Indian classroom.
- "suggestedReviewWeeks": integer 8-26, when the IEP should be reviewed.

${languageInstruction(input.language)}

## JSON schema
{
  "presentLevels": string,
  "goals": [
    {
      "domain": one of ${JSON.stringify(DOMAINS)},
      "goalText": string,
      "baseline": string,
      "target": string,
      "measurement": string,
      "accommodations": string[],
      "interventions": string[]
    }
  ],
  "suggestedReviewWeeks": integer
}`;
}
