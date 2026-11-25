import request from 'supertest';
import { app, auth, clearDb, createStudent, createUser, registerSchool, startDb, stopDb } from './helpers';

beforeAll(startDb);
afterAll(stopDb);
afterEach(clearDb);

async function world() {
  const a = await registerSchool('School A');
  const eduA1 = await createUser(a.adminToken, 'EDUCATOR', 'Edu A1');
  const eduA2 = await createUser(a.adminToken, 'EDUCATOR', 'Edu A2');
  const parentA = await createUser(a.adminToken, 'PARENT', 'Parent A');
  const s1 = await createStudent(a.adminToken, { name: 'Aarav Sharma', educatorIds: [eduA1.id], parentIds: [parentA.id] });
  const s2 = await createStudent(a.adminToken, { name: 'Diya Patel', educatorIds: [eduA2.id] });
  const b = await registerSchool('School B');
  const sB = await createStudent(b.adminToken, { name: 'Kabir Rao' });
  return { a, b, eduA1, eduA2, parentA, s1, s2, sB };
}

describe('role-based scoping & tenant isolation', () => {
  it('scopes GET /students by role', async () => {
    const w = await world();
    const list = async (t: string) => (await request(app).get('/api/v1/students').set(auth(t)).expect(200)).body;

    const admin = await list(w.a.adminToken);
    expect(admin.data.map((s: { name: string }) => s.name).sort()).toEqual(['Aarav Sharma', 'Diya Patel']);
    expect(admin.pagination).toMatchObject({ page: 1, total: 2 });

    expect((await list(w.eduA1.token)).data.map((s: { id: string }) => s.id)).toEqual([w.s1.id]);
    expect((await list(w.parentA.token)).data.map((s: { id: string }) => s.id)).toEqual([w.s1.id]);
    expect((await list(w.b.adminToken)).data.map((s: { id: string }) => s.id)).toEqual([w.sB.id]);
  });

  it('supports ?search and pagination', async () => {
    const w = await world();
    const res = await request(app).get('/api/v1/students?search=diya').set(auth(w.a.adminToken)).expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Diya Patel');
    const paged = await request(app).get('/api/v1/students?page=2&limit=1').set(auth(w.a.adminToken)).expect(200);
    expect(paged.body.data).toHaveLength(1);
    expect(paged.body.pagination).toMatchObject({ page: 2, limit: 1, total: 2, totalPages: 2 });
  });

  it('returns 404 for other-school, unassigned, invalid and unknown ids', async () => {
    const w = await world();
    await request(app).get(`/api/v1/students/${w.sB.id}`).set(auth(w.a.adminToken)).expect(404);
    await request(app).get(`/api/v1/students/${w.s2.id}`).set(auth(w.eduA1.token)).expect(404);
    await request(app).get(`/api/v1/students/${w.s2.id}`).set(auth(w.parentA.token)).expect(404);
    const bad = await request(app).get('/api/v1/students/not-an-id').set(auth(w.a.adminToken)).expect(404);
    expect(bad.body.error.code).toBe('NOT_FOUND');
    await request(app).get('/api/v1/students/0123456789abcdef01234567').set(auth(w.a.adminToken)).expect(404);
    await request(app).patch(`/api/v1/students/${w.sB.id}`).set(auth(w.a.adminToken)).send({ notes: 'x' }).expect(404);
  });

  it('enforces read-only parents and admin-only routes', async () => {
    const w = await world();
    const assessment = { type: 'SCREENING', domain: 'READING', scores: { phonics: 2 } };
    await request(app).post(`/api/v1/students/${w.s1.id}/assessments`).set(auth(w.parentA.token)).send(assessment).expect(403);
    await request(app).patch(`/api/v1/students/${w.s1.id}`).set(auth(w.parentA.token)).send({ notes: 'x' }).expect(403);
    await request(app).post(`/api/v1/students/${w.s1.id}/ieps/generate`).set(auth(w.parentA.token)).send({}).expect(403);
    await request(app).post('/api/v1/students').set(auth(w.parentA.token)).send({ name: 'X', grade: '1' }).expect(403);
    await request(app).post('/api/v1/users').set(auth(w.eduA1.token)).send({ name: 'X', email: 'x@x.in', role: 'PARENT' }).expect(403);
    await request(app).get('/api/v1/analytics/school').set(auth(w.eduA1.token)).expect(403);
    await request(app).post(`/api/v1/students/${w.s1.id}/educators`).set(auth(w.eduA1.token)).send({ educatorIds: [w.eduA2.id] }).expect(403);

    // Parent can read assessments and message about their own child.
    await request(app).post(`/api/v1/students/${w.s1.id}/assessments`).set(auth(w.eduA1.token)).send(assessment).expect(201);
    const list = await request(app).get(`/api/v1/students/${w.s1.id}/assessments`).set(auth(w.parentA.token)).expect(200);
    expect(list.body.data[0].scores).toEqual({ phonics: 2 });
    await request(app).post(`/api/v1/students/${w.s1.id}/messages`).set(auth(w.parentA.token)).send({ body: 'Thank you!' }).expect(201);
  });

  it('cannot assign users from another school', async () => {
    const w = await world();
    const eduB = await createUser(w.b.adminToken, 'EDUCATOR', 'Edu B');
    await request(app).post(`/api/v1/students/${w.s1.id}/educators`).set(auth(w.a.adminToken)).send({ educatorIds: [eduB.id] }).expect(400);
    await request(app).post(`/api/v1/students/${w.s1.id}/educators`).set(auth(w.a.adminToken)).send({ educatorIds: [w.eduA2.id] }).expect(200);
    await request(app).get(`/api/v1/students/${w.s1.id}`).set(auth(w.eduA2.token)).expect(200);
  });

  it('lists users by role within the school only', async () => {
    const w = await world();
    const res = await request(app).get('/api/v1/users?role=EDUCATOR').set(auth(w.a.adminToken)).expect(200);
    expect(res.body.data.map((u: { name: string }) => u.name).sort()).toEqual(['Edu A1', 'Edu A2']);
    expect(res.body.data[0].passwordHash).toBeUndefined();
  });

  it('message read receipts are idempotent', async () => {
    const w = await world();
    const msg = await request(app).post(`/api/v1/students/${w.s1.id}/messages`).set(auth(w.eduA1.token)).send({ body: 'Hello' }).expect(201);
    await request(app).post(`/api/v1/messages/${msg.body.message.id}/read`).set(auth(w.parentA.token)).expect(200);
    const again = await request(app).post(`/api/v1/messages/${msg.body.message.id}/read`).set(auth(w.parentA.token)).expect(200);
    expect(again.body.message.readBy).toHaveLength(2);
    await request(app).post(`/api/v1/messages/${msg.body.message.id}/read`).set(auth(w.b.adminToken)).expect(404);
  });
});

describe('caseload endpoints used by the dashboards', () => {
  it('filters students and returns team names scoped to role', async () => {
    const w = await world();
    const byCat = await request(app).get('/api/v1/students?category=SPECIFIC_LEARNING_DISABILITIES&grade=3').set(auth(w.a.adminToken)).expect(200);
    expect(byCat.body.data).toHaveLength(2);
    await request(app).get('/api/v1/students?category=NOT_A_CATEGORY').set(auth(w.a.adminToken)).expect(400);

    const staffView = await request(app).get(`/api/v1/students/${w.s1.id}`).set(auth(w.eduA1.token)).expect(200);
    expect(staffView.body.team.educators).toEqual([expect.objectContaining({ name: 'Edu A1', email: expect.any(String) })]);
    expect(staffView.body.team.parents[0].name).toBe('Parent A');
    const parentView = await request(app).get(`/api/v1/students/${w.s1.id}`).set(auth(w.parentA.token)).expect(200);
    expect(parentView.body.team.educators[0].email).toBeUndefined();
  });

  it('lists IEPs and recent progress only for the caller’s caseload', async () => {
    const w = await world();
    const { Iep } = await import('../src/models');
    const base = { schoolId: w.a.schoolId, createdById: w.eduA1.id, startDate: new Date(), goals: [{ domain: 'READING', goalText: 'Read' }] };
    const soon = new Date(Date.now() + 10 * 86_400_000);
    await Iep.create({ ...base, studentId: w.s1.id, status: 'APPROVED', reviewDate: soon });
    await Iep.create({ ...base, studentId: w.s2.id, status: 'APPROVED', reviewDate: soon });
    await Iep.create({ ...base, studentId: w.s1.id, status: 'DRAFT', reviewDate: soon });

    const edu = await request(app).get('/api/v1/ieps?status=APPROVED&dueWithinDays=30').set(auth(w.eduA1.token)).expect(200);
    expect(edu.body.data).toHaveLength(1);
    expect(edu.body.data[0].studentId.name).toBe('Aarav Sharma');
    const admin = await request(app).get('/api/v1/ieps?dueWithinDays=30').set(auth(w.a.adminToken)).expect(200);
    expect(admin.body.pagination.total).toBe(3);
    const parent = await request(app).get('/api/v1/ieps').set(auth(w.parentA.token)).expect(200);
    expect(parent.body.data.map((i: { status: string }) => i.status)).toEqual(['APPROVED']);
    const other = await request(app).get('/api/v1/ieps').set(auth(w.b.adminToken)).expect(200);
    expect(other.body.data).toHaveLength(0);

    const goalId = (await Iep.findOne({ studentId: w.s1.id, status: 'APPROVED' }))!.goals[0]._id;
    await request(app).post(`/api/v1/goals/${goalId}/progress`).set(auth(w.eduA1.token)).send({ value: 40 }).expect(201);
    const recent = await request(app).get('/api/v1/progress/recent').set(auth(w.eduA1.token)).expect(200);
    expect(recent.body.data[0]).toMatchObject({ value: 40, studentId: { name: 'Aarav Sharma' }, goal: { goalText: 'Read' } });
    const none = await request(app).get('/api/v1/progress/recent').set(auth(w.eduA2.token)).expect(200);
    expect(none.body.data).toHaveLength(0);
  });
});
