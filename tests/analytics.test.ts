import request from 'supertest';
import { app, auth, clearDb, createStudent, createUser, iepReply, registerSchool, startDb, stopDb, useMockLLM } from './helpers';

beforeAll(startDb);
afterAll(stopDb);
afterEach(clearDb);

describe('analytics', () => {
  it('computes the school dashboard with aggregation pipelines', async () => {
    const s = await registerSchool();
    const edu = await createUser(s.adminToken, 'EDUCATOR', 'Ms Kavya');
    const s1 = await createStudent(s.adminToken, { name: 'Aarav', disabilityCategories: ['SPECIFIC_LEARNING_DISABILITIES', 'ADHD'], educatorIds: [edu.id] });
    await createStudent(s.adminToken, { name: 'Diya', disabilityCategories: ['AUTISM_SPECTRUM_DISORDER'] });
    await createStudent(s.adminToken, { name: 'Ishaan', disabilityCategories: ['SPECIFIC_LEARNING_DISABILITIES'] });
    await createStudent(s.adminToken, { name: 'Meher', disabilityCategories: ['LOW_VISION'] });

    // Another school's data must never leak in.
    const other = await registerSchool('Other');
    await createStudent(other.adminToken, { name: 'Zed', disabilityCategories: ['LOW_VISION'] });

    await request(app).post(`/api/v1/students/${s1.id}/assessments`).set(auth(edu.token)).send({ type: 'SKILL', domain: 'MATH', scores: { add: 2 } }).expect(201);

    useMockLLM([iepReply({ suggestedReviewWeeks: 4 })]);
    const iep = (await request(app).post(`/api/v1/students/${s1.id}/ieps/generate`).set(auth(edu.token)).send({}).expect(201)).body.iep;
    await request(app).post(`/api/v1/ieps/${iep.id}/approve`).set(auth(edu.token)).expect(200);
    const [reading, writing] = iep.goals;
    for (const [goal, value, date] of [
      [reading, 20, '2026-01-01'],
      [reading, 60, '2026-02-01'],
      [writing, 40, '2026-02-01'],
    ] as const) {
      await request(app).post(`/api/v1/goals/${goal.id}/progress`).set(auth(edu.token)).send({ value, date }).expect(201);
    }

    const res = await request(app).get('/api/v1/analytics/school').set(auth(s.adminToken)).expect(200);
    const a = res.body;
    expect(a.totalStudents).toBe(4);
    expect(a.studentsByDisabilityCategory).toEqual(
      expect.arrayContaining([
        { category: 'SPECIFIC_LEARNING_DISABILITIES', count: 2 },
        { category: 'ADHD', count: 1 },
        { category: 'AUTISM_SPECTRUM_DISORDER', count: 1 },
        { category: 'LOW_VISION', count: 1 },
      ]),
    );
    expect(a.studentsByDisabilityCategory[0]).toEqual({ category: 'SPECIFIC_LEARNING_DISABILITIES', count: 2 });
    expect(a.approvedIep).toEqual({ students: 1, percentage: 25 });
    expect(a.iepsDueForReview.within30Days).toBe(1);
    expect(a.iepsDueForReview.items[0]).toMatchObject({ studentName: 'Aarav', iepId: iep.id });
    expect(a.goalStatusBreakdown).toEqual(
      expect.arrayContaining([
        { status: 'IN_PROGRESS', count: 2 },
        { status: 'NOT_STARTED', count: 1 },
      ]),
    );
    // Latest value per goal: READING 60, WRITING 40.
    expect(a.averageProgressByDomain).toEqual([
      { domain: 'READING', averageProgress: 60, goals: 1 },
      { domain: 'WRITING', averageProgress: 40, goals: 1 },
    ]);
    expect(a.educatorActivityLast30Days).toEqual([
      expect.objectContaining({ educatorId: edu.id, name: 'Ms Kavya', progressEntries: 3, assessments: 1, ieps: 1, worksheets: 0, total: 5 }),
    ]);

    const st = await request(app).get(`/api/v1/analytics/students/${s1.id}`).set(auth(edu.token)).expect(200);
    const readingSeries = st.body.goals.find((g: { goalId: string }) => g.goalId === reading.id);
    expect(readingSeries).toMatchObject({ domain: 'READING', entries: 2, firstValue: 20, latestValue: 60, change: 40 });
    expect(readingSeries.points.map((p: { value: number }) => p.value)).toEqual([20, 60]);
    expect(st.body.assessmentTrend).toEqual([{ domain: 'MATH', points: [expect.objectContaining({ averageScore: 2 })] }]);

    await request(app).get(`/api/v1/analytics/students/${s1.id}`).set(auth(other.adminToken)).expect(404);
  });
});
