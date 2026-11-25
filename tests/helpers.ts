import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../src/app';
import { setLLM, LLMProvider, LLMRequest, LLMResponse } from '../src/ai/llm';
import * as models from '../src/models';

export const app = createApp();
let replSet: MongoMemoryReplSet;

export async function startDb() {
  // Replica set so transactions (register-school, IEP approve) run exactly as in production.
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(replSet.getUri());
  const all = Object.values(models).filter((m) => typeof m === 'function' && 'syncIndexes' in m) as unknown as mongoose.Model<unknown>[];
  await Promise.all(all.map((m) => m.syncIndexes()));
}

export async function stopDb() {
  await mongoose.disconnect();
  await replSet?.stop();
}

export async function clearDb() {
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

/** Mock LLM: returns queued replies in order and records every request it received. */
export class MockLLM implements LLMProvider {
  readonly name = 'mock';
  calls: LLMRequest[] = [];
  constructor(private replies: (string | object)[]) {}
  async complete(req: LLMRequest): Promise<LLMResponse> {
    this.calls.push(JSON.parse(JSON.stringify(req)));
    const next = this.replies.length > 1 ? this.replies.shift()! : this.replies[0];
    return { text: typeof next === 'string' ? next : JSON.stringify(next), model: 'mock-model', usage: { inputTokens: 100, outputTokens: 200 } };
  }
}
export const useMockLLM = (replies: (string | object)[]) => {
  const m = new MockLLM(replies);
  setLLM(m);
  return m;
};

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

let counter = 0;
export async function registerSchool(name = 'Sunrise School') {
  counter += 1;
  const res = await request(app)
    .post('/api/v1/auth/register-school')
    .send({
      school: { name, city: 'Pune', state: 'Maharashtra', board: 'CBSE' },
      admin: { name: 'Admin', email: `admin${counter}@test.in`, password: 'password123' },
    })
    .expect(201);
  return { adminToken: res.body.accessToken as string, schoolId: res.body.school.id as string, admin: res.body.user };
}

export async function createUser(adminToken: string, role: 'EDUCATOR' | 'PARENT', name: string = role) {
  counter += 1;
  const email = `${role.toLowerCase()}${counter}@test.in`;
  const created = await request(app)
    .post('/api/v1/users')
    .set(auth(adminToken))
    .send({ name, email, role, password: 'password123' })
    .expect(201);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password: 'password123' }).expect(200);
  return { id: created.body.user.id as string, token: login.body.accessToken as string };
}

export async function createStudent(token: string, body: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/v1/students')
    .set(auth(token))
    .send({ name: 'Aarav Sharma', grade: '3', disabilityCategories: ['SPECIFIC_LEARNING_DISABILITIES'], ...body })
    .expect(201);
  return res.body.student as { id: string; name: string };
}

export const iepReply = (overrides: Record<string, unknown> = {}) => ({
  presentLevels: 'The student enjoys stories and recognises most letters. The student is building phonics skills.',
  goals: [
    {
      domain: 'READING',
      goalText: 'By March, the student will blend 3-letter CVC words with 80% accuracy in 4 of 5 trials.',
      baseline: 'Blends 2 of 10 CVC words',
      target: '8 of 10 CVC words',
      measurement: 'Weekly running record',
      accommodations: ['Large print', 'Extra time'],
      interventions: ['Multisensory phonics with sand trays', 'Peer reading buddy'],
    },
    {
      domain: 'WRITING',
      goalText: 'By March, the student will write a 3-word sentence with a capital letter and full stop in 4 of 5 attempts.',
      baseline: 'Writes single words',
      target: '3-word sentences',
      measurement: 'Fortnightly writing sample',
      accommodations: ['Lined paper with wide spacing'],
      interventions: ['Sentence frames'],
    },
    {
      domain: 'MATH',
      goalText: 'By March, the student will add numbers within 20 using a number line in 4 of 5 trials.',
      baseline: 'Adds within 10 with objects',
      target: 'Adds within 20',
      measurement: 'Weekly 10-item probe',
      accommodations: ['Number line on desk'],
      interventions: ['Bead strings', 'Market role-play with play rupees'],
    },
  ],
  suggestedReviewWeeks: 12,
  ...overrides,
});
