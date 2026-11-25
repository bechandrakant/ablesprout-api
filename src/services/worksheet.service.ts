import { Writable } from 'stream';
import { z } from 'zod';
import { Assessment, Iep, Student, Worksheet } from '../models';
import { AuthUser } from '../middleware/auth';
import { getAccessibleStudent, tenantFilter } from '../utils/tenant';
import { forbidden, notFound } from '../utils/errors';
import { oid } from '../utils/objectId';
import { Pagination, paginated, toSkip } from '../utils/pagination';
import { audit } from './audit.service';
import { createAnonymizer, scrubContactDetails } from '../ai/anonymize';
import { generateJSON } from '../ai/generate';
import { WORKSHEET_SYSTEM, buildAdaptPrompt, buildWorksheetPrompt } from '../ai/prompts/worksheet.prompt';
import { WorksheetOutputSchema } from '../ai/schemas';
import { adaptWorksheetBody, generateWorksheetBody, updateWorksheetBody } from '../validators/worksheet.validators';
import { Domain } from '../models/assessment.model';
import { renderWorksheetPdf } from './pdf.service';

/** Maps a free-text subject to the assessment domains that indicate the learner's level. */
function domainsForSubject(subject: string): Domain[] {
  const s = subject.toLowerCase();
  if (/math|maths|ganit|गणित|number|evs/.test(s)) return ['MATH'];
  if (/english|hindi|हिंदी|reading|language|literacy|marathi|tamil|telugu|bengali|kannada/.test(s)) return ['READING', 'WRITING'];
  if (/writing/.test(s)) return ['WRITING'];
  if (/life skill|daily/.test(s)) return ['DAILY_LIVING'];
  return ['READING', 'WRITING', 'MATH', 'COMMUNICATION'];
}

const LEVEL_WORDS = ['', 'needs high support', 'needs considerable support', 'emerging', 'developing well', 'independent'];

async function levelHint(actor: AuthUser, studentId: string, subject: string): Promise<string> {
  const domains = domainsForSubject(subject);
  const recent = await Assessment.find(tenantFilter(actor, { studentId: oid(studentId), domain: { $in: domains } }))
    .sort({ date: -1 })
    .limit(6);
  if (!recent.length) return 'no recent assessment; start at an easy, foundational level';
  return domains
    .map((d) => {
      const scores = recent.filter((r) => r.domain === d).flatMap((r) => Array.from(r.scores?.values() ?? []));
      if (!scores.length) return null;
      const avg = scores.reduce((x, y) => x + y, 0) / scores.length;
      return `${d}: average ${avg.toFixed(1)}/5 (${LEVEL_WORDS[Math.round(avg)]})`;
    })
    .filter(Boolean)
    .join('; ') || 'no recent assessment; start at an easy, foundational level';
}

export async function generateWorksheet(actor: AuthUser, studentId: string, input: z.infer<typeof generateWorksheetBody>) {
  const student = await getAccessibleStudent(actor, studentId, { write: true });
  let goalText: string | undefined;
  if (input.goalId) {
    const iep = await Iep.findOne(tenantFilter(actor, { studentId: student._id, 'goals._id': oid(input.goalId) }));
    const goal = iep?.goals.id(input.goalId);
    if (!goal) throw notFound('Goal');
    goalText = goal.goalText;
  }

  const anon = createAnonymizer(student.name);
  const clean = (t?: string) => (t ? scrubContactDetails(anon.scrub(t)) : t);
  const out = anon.restore(
    await generateJSON({
      task: 'worksheet.generate',
      system: WORKSHEET_SYSTEM,
      schema: WorksheetOutputSchema,
      context: { schoolId: actor.schoolId, studentId: String(student._id), userId: actor.id },
      prompt: buildWorksheetPrompt({
        subject: clean(input.subject)!,
        topic: clean(input.topic)!,
        grade: student.grade,
        levelHint: await levelHint(actor, String(student._id), input.subject),
        disabilityCategories: student.disabilityCategories,
        goalText: clean(goalText),
        adaptations: input.adaptations,
        language: input.language,
      }),
    }),
  );

  const ws = await Worksheet.create({
    schoolId: actor.schoolId,
    studentId: student._id,
    createdById: actor.id,
    goalId: input.goalId ? oid(input.goalId) : null,
    title: out.title,
    subject: input.subject,
    level: out.level,
    language: input.language,
    adaptations: input.adaptations,
    content: { sections: out.sections },
  });
  await audit(actor, 'GENERATE', 'Worksheet', ws._id, { studentId: String(student._id) });
  return ws;
}

export async function adaptWorksheet(actor: AuthUser, input: z.infer<typeof adaptWorksheetBody>) {
  const student = input.studentId ? await getAccessibleStudent(actor, input.studentId, { write: true }) : null;
  const anon = student ? createAnonymizer(student.name) : null;
  const scrubbed = scrubContactDetails(anon ? anon.scrub(input.sourceText) : input.sourceText);

  let out = await generateJSON({
    task: 'worksheet.adapt',
    system: WORKSHEET_SYSTEM,
    schema: WorksheetOutputSchema,
    context: { schoolId: actor.schoolId, studentId: student ? String(student._id) : undefined, userId: actor.id },
    prompt: buildAdaptPrompt({
      sourceText: scrubbed,
      adaptations: input.adaptations,
      language: input.language,
      grade: student?.grade,
      disabilityCategories: student?.disabilityCategories,
    }),
  });
  if (anon) out = anon.restore(out);

  const ws = await Worksheet.create({
    schoolId: actor.schoolId,
    studentId: student?._id ?? null,
    createdById: actor.id,
    title: out.title,
    subject: input.subject,
    level: out.level,
    language: input.language,
    adaptations: input.adaptations,
    content: { sections: out.sections },
    sourceText: input.sourceText,
  });
  await audit(actor, 'GENERATE', 'Worksheet', ws._id, { adapted: true });
  return ws;
}

export async function listWorksheets(actor: AuthUser, studentId: string, query: Pagination) {
  const student = await getAccessibleStudent(actor, studentId);
  const filter = tenantFilter(actor, { studentId: student._id });
  const { skip, limit } = toSkip(query);
  const [data, total] = await Promise.all([
    Worksheet.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Worksheet.countDocuments(filter),
  ]);
  return paginated(data, total, query);
}

export async function getWorksheet(actor: AuthUser, id: string) {
  const ws = await Worksheet.findOne(tenantFilter(actor, { _id: oid(id) }));
  if (!ws) throw notFound('Worksheet');
  if (ws.studentId) {
    await getAccessibleStudent(actor, String(ws.studentId));
  } else if (actor.role === 'PARENT') {
    // Unassigned (adapted) worksheets are staff resources.
    throw notFound('Worksheet');
  }
  return ws;
}

export async function updateWorksheet(actor: AuthUser, id: string, input: z.infer<typeof updateWorksheetBody>) {
  if (actor.role === 'PARENT') throw forbidden('Parents have read-only access');
  const ws = await getWorksheet(actor, id);
  if (ws.studentId) await getAccessibleStudent(actor, String(ws.studentId), { write: true });
  ws.set(input);
  await ws.save();
  await audit(actor, 'UPDATE', 'Worksheet', ws._id, { fields: Object.keys(input) });
  return ws;
}

export async function worksheetPdf(actor: AuthUser, id: string, out: Writable) {
  const ws = await getWorksheet(actor, id);
  const student = ws.studentId ? await Student.findOne(tenantFilter(actor, { _id: ws.studentId })).select('name') : null;
  renderWorksheetPdf(
    {
      title: ws.title,
      subject: ws.subject,
      level: ws.level,
      studentName: student?.name,
      adaptations: ws.adaptations as never,
      sections: (ws.content?.sections ?? []) as never,
    },
    out,
  );
}
