import request from 'supertest';
import { app, auth, clearDb, registerSchool, startDb, stopDb } from './helpers';
import { School, User } from '../src/models';

beforeAll(startDb);
afterAll(stopDb);
afterEach(clearDb);

describe('auth', () => {
  it('registers a school + admin in one transaction and hides secrets', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register-school')
      .send({
        school: { name: 'Green Valley School', city: 'Jaipur', state: 'Rajasthan', board: 'RBSE' },
        admin: { name: 'Meera', email: 'Meera@School.IN', password: 'password123' },
      })
      .expect(201);

    expect(res.body.user).toMatchObject({ email: 'meera@school.in', role: 'ADMIN' });
    expect(res.body.user.id).toMatch(/^[a-f0-9]{24}$/);
    expect(res.body.user._id).toBeUndefined();
    expect(res.body.user.__v).toBeUndefined();
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.user.refreshTokens).toBeUndefined();
    expect(res.body.school.id).toBeDefined();
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(await School.countDocuments()).toBe(1);
  });

  it('rejects duplicate email with 409 and does not create an orphan school', async () => {
    await registerSchool();
    const before = await School.countDocuments();
    const email = (await User.findOne())!.email;
    const res = await request(app)
      .post('/api/v1/auth/register-school')
      .send({ school: { name: 'Other School', city: 'Y', state: 'Z' }, admin: { name: 'A', email, password: 'password123' } })
      .expect(409);
    expect(res.body.error.code).toBeDefined();
    expect(await School.countDocuments()).toBe(before);
  });

  it('validates input with 400 + error shape', async () => {
    const res = await request(app).post('/api/v1/auth/register-school').send({ school: {}, admin: { email: 'nope' } }).expect(400);
    expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('logs in, returns me, and rejects bad passwords', async () => {
    const { admin } = await registerSchool();
    await request(app).post('/api/v1/auth/login').send({ email: admin.email, password: 'wrong-password' }).expect(401);
    const login = await request(app).post('/api/v1/auth/login').send({ email: admin.email, password: 'password123' }).expect(200);
    const me = await request(app).get('/api/v1/auth/me').set(auth(login.body.accessToken)).expect(200);
    expect(me.body.user.email).toBe(admin.email);
    expect(me.body.user.passwordHash).toBeUndefined();
    await request(app).get('/api/v1/auth/me').expect(401);
    await request(app).get('/api/v1/auth/me').set(auth('garbage')).expect(401);
  });

  it('stores refresh tokens hashed, rotates them, and revokes all on reuse', async () => {
    const reg = await request(app)
      .post('/api/v1/auth/register-school')
      .send({ school: { name: 'Rotation School', city: 'C', state: 'St' }, admin: { name: 'A', email: 'a@a.in', password: 'password123' } })
      .expect(201);
    const first = reg.body.refreshToken as string;

    const stored = await User.findOne({ email: 'a@a.in' }).select('+refreshTokens');
    expect(stored!.refreshTokens).toHaveLength(1);
    expect(stored!.refreshTokens[0].tokenHash).not.toBe(first);
    expect(stored!.refreshTokens[0].tokenHash).toMatch(/^[a-f0-9]{64}$/);

    const rotated = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: first }).expect(200);
    expect(rotated.body.refreshToken).not.toBe(first);

    // Reusing the consumed token is treated as theft => every session is revoked.
    await request(app).post('/api/v1/auth/refresh').send({ refreshToken: first }).expect(401);
    await request(app).post('/api/v1/auth/refresh').send({ refreshToken: rotated.body.refreshToken }).expect(401);
  });

  it('logout revokes the refresh token', async () => {
    const { admin } = await registerSchool();
    const login = await request(app).post('/api/v1/auth/login').send({ email: admin.email, password: 'password123' });
    await request(app).post('/api/v1/auth/logout').send({ refreshToken: login.body.refreshToken }).expect(204);
    await request(app).post('/api/v1/auth/refresh').send({ refreshToken: login.body.refreshToken }).expect(401);
  });

  it('strips NoSQL operators from input', async () => {
    await registerSchool();
    const res = await request(app).post('/api/v1/auth/login').send({ email: { $gt: '' }, password: { $gt: '' } });
    expect([400, 401]).toContain(res.status);
  });
});
