import request from 'supertest';
import { app, auth, clearDb, createStudent, createUser, iepReply, registerSchool, startDb, stopDb, useMockLLM } from './helpers';
import { AuditLog, Iep } from '../src/models';

beforeAll(startDb);
afterAll(stopDb);
afterEach(clearDb);

async function setup() {
  const s = await registerSchool();
  const edu = await createUser(s.adminToken, 'EDUCATOR', 'Ms Kavya');
  const parent = await createUser(s.adminToken, 'PARENT', 'Mr Sharma');
  const student = await createStudent(s.adminToken, {
    name: 'Aarav Sharma',
    dateOfBirth: '2017-06-01',
    notes: "Aarav loves cricket. Aarav's mother can be reached at 9876543210.",
    educatorIds: [edu.id],
    parentIds: [parent.id],
  });
  await request(app)
    .post(`/api/v1/students/${student.id}/assessments`)
    .set(auth(edu.token))
    .send({ type: 'SCREENING', domain: 'READING', scores: { phonics: 2, sightWords: 3 }, observations: 'Aarav guesses words from pictures.' })
    .expect(201);
  return { ...s, edu, parent, student };
}

const generate = (token: string, studentId: string, body = {}) =>
  request(app).post(`/api/v1/students/${studentId}/ieps/generate`).set(auth(token)).send(body);

describe('IEP generation (mock LLM)', () => {
  it('creates a DRAFT IEP without ever sending the student name to the LLM', async () => {
    const { edu, student } = await setup();
    const llm = useMockLLM([iepReply()]);

    const res = await generate(edu.token, student.id).expect(201);
    const { iep } = res.body;
    expect(iep.status).toBe('DRAFT');
    expect(iep.aiGenerated).toBe(true);
    expect(iep.goals).toHaveLength(3);
    expect(iep.goals[0].id).toMatch(/^[a-f0-9]{24}$/);
    expect(iep.goals[0].status).toBe('NOT_STARTED');
    expect(new Date(iep.reviewDate).getTime() - new Date(iep.startDate).getTime()).toBe(12 * 7 * 86_400_000);

    // Privacy: no name or phone in anything sent to the model.
    const sent = JSON.stringify(llm.calls);
    expect(sent).not.toMatch(/Aarav|Sharma/i);
    expect(sent).not.toContain('9876543210');
    expect(sent).toContain('the student');
    expect(llm.calls[0].system).toMatch(/NEP/);
    expect(llm.calls[0].system).toMatch(/RPwD/);

    // Name re-inserted into the saved document.
    expect(iep.presentLevels).toMatch(/^Aarav enjoys stories/);
    expect(iep.goals[0].goalText).toContain('Aarav will blend');

    expect(await AuditLog.countDocuments({ entity: 'IEP', action: 'GENERATE' })).toBe(1);
  });

  it('supports Hindi via the language param', async () => {
    const { edu, student } = await setup();
    const llm = useMockLLM([iepReply()]);
    const res = await generate(edu.token, student.id, { language: 'hi' }).expect(201);
    expect(res.body.iep.language).toBe('hi');
    expect(llm.calls[0].messages[0].content).toMatch(/Hindi \(Devanagari/);
  });

  it('retries once on invalid JSON, then succeeds', async () => {
    const { edu, student } = await setup();
    const llm = useMockLLM(['Sure! Here is the IEP: {not json', iepReply()]);
    await generate(edu.token, student.id).expect(201);
    expect(llm.calls).toHaveLength(2);
    expect(llm.calls[1].messages.at(-1)!.content).toMatch(/not valid/);
  });

  it('retries once on schema violations, then fails with 502', async () => {
    const { edu, student } = await setup();
    const llm = useMockLLM([iepReply({ goals: [] })]);
    const res = await generate(edu.token, student.id).expect(502);
    expect(res.body.error.code).toBe('AI_INVALID_OUTPUT');
    expect(llm.calls).toHaveLength(2);
    expect(await Iep.countDocuments()).toBe(0);
  });

  it('accepts JSON wrapped in code fences', async () => {
    const { edu, student } = await setup();
    useMockLLM(['```json\n' + JSON.stringify(iepReply()) + '\n```']);
    await generate(edu.token, student.id).expect(201);
  });
});

describe('IEP lifecycle', () => {
  it('edits, approves (archiving the previous), updates goals and tracks progress', async () => {
    const { edu, parent, adminToken, student } = await setup();
    useMockLLM([iepReply()]);
    const first = (await generate(edu.token, student.id).expect(201)).body.iep;

    // Parents never see drafts.
    await request(app).get(`/api/v1/ieps/${first.id}`).set(auth(parent.token)).expect(404);
    const parentList = await request(app).get(`/api/v1/students/${student.id}/ieps`).set(auth(parent.token)).expect(200);
    expect(parentList.body.data).toHaveLength(0);

    // Edit the draft, keeping goal ids.
    const edited = await request(app)
      .patch(`/api/v1/ieps/${first.id}`)
      .set(auth(edu.token))
      .send({ presentLevels: 'Edited by educator', goals: first.goals.slice(0, 2).map((g: Record<string, unknown>) => ({ ...g })) })
      .expect(200);
    expect(edited.body.iep.presentLevels).toBe('Edited by educator');
    expect(edited.body.iep.goals.map((g: { id: string }) => g.id)).toEqual(first.goals.slice(0, 2).map((g: { id: string }) => g.id));
    await request(app).patch(`/api/v1/ieps/${first.id}`).set(auth(edu.token)).send({ status: 'APPROVED' }).expect(400);

    // Progress is only for approved IEPs.
    const goalId = first.goals[0].id;
    await request(app).post(`/api/v1/goals/${goalId}/progress`).set(auth(edu.token)).send({ value: 20 }).expect(409);

    const approved = await request(app).post(`/api/v1/ieps/${first.id}/approve`).set(auth(edu.token)).expect(200);
    expect(approved.body.iep).toMatchObject({ status: 'APPROVED', approvedById: edu.id });
    expect(approved.body.iep.approvedAt).toBeDefined();
    await request(app).post(`/api/v1/ieps/${first.id}/approve`).set(auth(edu.token)).expect(409);
    await request(app).post(`/api/v1/ieps/${first.id}/approve`).set(auth(parent.token)).expect(403);

    // Progress + automatic NOT_STARTED -> IN_PROGRESS.
    await request(app).post(`/api/v1/goals/${goalId}/progress`).set(auth(edu.token)).send({ value: 30, note: 'Week 1', date: '2026-01-05' }).expect(201);
    await request(app).post(`/api/v1/goals/${goalId}/progress`).set(auth(edu.token)).send({ value: 55, date: '2026-01-12' }).expect(201);
    await request(app).post(`/api/v1/goals/${goalId}/progress`).set(auth(edu.token)).send({ value: 140 }).expect(400);
    const progress = await request(app).get(`/api/v1/goals/${goalId}/progress`).set(auth(parent.token)).expect(200);
    expect(progress.body.data.map((p: { value: number }) => p.value)).toEqual([30, 55]);

    let iep = (await request(app).get(`/api/v1/ieps/${first.id}`).set(auth(parent.token)).expect(200)).body.iep;
    expect(iep.goals[0].status).toBe('IN_PROGRESS');

    // Positional goal update.
    const goal = await request(app).patch(`/api/v1/goals/${goalId}`).set(auth(edu.token)).send({ status: 'ACHIEVED', target: '9 of 10' }).expect(200);
    expect(goal.body.goal).toMatchObject({ id: goalId, status: 'ACHIEVED', target: '9 of 10' });
    iep = (await request(app).get(`/api/v1/ieps/${first.id}`).set(auth(edu.token))).body.iep;
    expect(iep.goals[1].status).toBe('NOT_STARTED');
    await request(app).patch('/api/v1/goals/bad-id').set(auth(edu.token)).send({ status: 'ACHIEVED' }).expect(404);

    // A second approval archives the first.
    useMockLLM([iepReply()]);
    const second = (await generate(adminToken, student.id).expect(201)).body.iep;
    await request(app).post(`/api/v1/ieps/${second.id}/approve`).set(auth(adminToken)).expect(200);
    const statuses = Object.fromEntries((await Iep.find()).map((d) => [String(d._id), d.status]));
    expect(statuses).toEqual({ [first.id]: 'ARCHIVED', [second.id]: 'APPROVED' });
    await request(app).patch(`/api/v1/ieps/${first.id}`).set(auth(edu.token)).send({ presentLevels: 'x' }).expect(409);

    expect(await AuditLog.countDocuments({ entity: 'IEP', action: 'APPROVE' })).toBe(2);
  });

  it('exports a PDF', async () => {
    const { edu, student } = await setup();
    useMockLLM([iepReply()]);
    const iep = (await generate(edu.token, student.id)).body.iep;
    const res = await request(app)
      .get(`/api/v1/ieps/${iep.id}/pdf`)
      .set(auth(edu.token))
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });
});

describe('worksheets (mock LLM)', () => {
  const worksheetReply = {
    title: 'Adding with mangoes',
    level: 'Class 2 maths',
    sections: [
      {
        heading: 'Warm up',
        instructions: 'Look at the picture. Count the mangoes. Write the number.',
        questions: [
          { text: 'How many mangoes? [picture: 3 mangoes]', answerType: 'number' },
          { text: '2 + 1 = ?', answerType: 'multiple_choice', options: ['2', '3', '4'] },
        ],
      },
    ],
  };

  it('generates, lists and renders an adapted PDF', async () => {
    const { edu, parent, student } = await setup();
    const llm = useMockLLM([worksheetReply]);
    const res = await request(app)
      .post(`/api/v1/students/${student.id}/worksheets/generate`)
      .set(auth(edu.token))
      .send({ subject: 'Maths', topic: 'Addition within 10', adaptations: ['dyslexia_font', 'large_print', 'chunked_steps', 'visual_supports'] })
      .expect(201);
    expect(res.body.worksheet.content.sections[0].questions).toHaveLength(2);
    expect(JSON.stringify(llm.calls)).not.toMatch(/Aarav/);

    const list = await request(app).get(`/api/v1/students/${student.id}/worksheets`).set(auth(parent.token)).expect(200);
    expect(list.body.data).toHaveLength(1);

    const edited = await request(app)
      .patch(`/api/v1/worksheets/${res.body.worksheet.id}`)
      .set(auth(edu.token))
      .send({ title: 'Mango maths', content: { sections: [{ heading: 'Try', instructions: 'Count.', questions: [{ text: '1 + 1 = ?', answerType: 'number' }] }] } })
      .expect(200);
    expect(edited.body.worksheet.title).toBe('Mango maths');
    await request(app).patch(`/api/v1/worksheets/${res.body.worksheet.id}`).set(auth(parent.token)).send({ title: 'x' }).expect(403);

    const pdf = await request(app).get(`/api/v1/worksheets/${res.body.worksheet.id}/pdf`).set(auth(parent.token)).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
  });

  it('adapts existing text; parents cannot adapt', async () => {
    const { edu, parent } = await setup();
    useMockLLM([worksheetReply]);
    const body = { sourceText: 'Q1. Add 2 and 3. Q2. Add 4 and 5. Show your working.', adaptations: ['simplified_language'] };
    await request(app).post('/api/v1/worksheets/adapt').set(auth(parent.token)).send(body).expect(403);
    const res = await request(app).post('/api/v1/worksheets/adapt').set(auth(edu.token)).send(body).expect(201);
    expect(res.body.worksheet.sourceText).toBe(body.sourceText);
    await request(app).get(`/api/v1/worksheets/${res.body.worksheet.id}`).set(auth(parent.token)).expect(404);
  });
});
