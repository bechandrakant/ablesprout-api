/* OpenAPI 3.1 description of the AbleSprout API, served at /api/docs (UI) and /api/docs.json. */
import { DOMAINS, ASSESSMENT_TYPES } from '../models/assessment.model';
import { DISABILITY_CATEGORIES } from '../models/student.model';
import { ADAPTATIONS, ANSWER_TYPES } from '../models/worksheet.model';
import { GOAL_STATUSES, IEP_STATUSES } from '../models/iep.model';

type Obj = Record<string, unknown>;
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: Obj) => ({ content: { 'application/json': { schema } } });
const ok = (schema: Obj, description = 'OK') => ({ description, ...json(schema) });
const wrap = (key: string, name: string) => ({ type: 'object', properties: { [key]: ref(name) } });
const page = (name: string) => ({
  type: 'object',
  properties: { data: { type: 'array', items: ref(name) }, pagination: ref('Pagination') },
});
const idParam = (name = 'id', what = 'resource') => ({
  name,
  in: 'path',
  required: true,
  description: `${what} id (24-char hex). Invalid or unknown ids return 404.`,
  schema: { type: 'string', pattern: '^[a-f0-9]{24}$' },
});
const pageParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
];
const errors = (...codes: number[]) =>
  Object.fromEntries(codes.map((c) => [String(c), { $ref: `#/components/responses/E${c}` }]));
const body = (schema: Obj) => ({ required: true, ...json(schema) });

interface Op {
  summary: string;
  tags: string[];
  roles?: string;
  params?: Obj[];
  body?: Obj;
  res: Obj;
  errs?: number[];
  public?: boolean;
}
const op = (o: Op) => ({
  summary: o.summary,
  tags: o.tags,
  description: o.roles ? `Roles: ${o.roles}` : undefined,
  ...(o.public ? { security: [] } : {}),
  parameters: o.params,
  requestBody: o.body,
  responses: { ...o.res, ...errors(...(o.errs ?? [400, 401, 403, 404])) },
});

const str = { type: 'string' };
const strArr = { type: 'array', items: str };
const date = { type: 'string', format: 'date-time' };
const id = { type: 'string', example: '665f1c2e8a1b2c3d4e5f6a7b' };
const lang = { type: 'string', enum: ['en', 'hi'] };
const pdf = { description: 'PDF file', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } };

const Goal = {
  type: 'object',
  properties: {
    id,
    domain: { type: 'string', enum: DOMAINS },
    goalText: str,
    baseline: str,
    target: str,
    measurement: str,
    accommodations: strArr,
    interventions: strArr,
    status: { type: 'string', enum: GOAL_STATUSES },
  },
};

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'AbleSprout API',
    version: '1.0.0',
    description:
      'AI-powered Inclusive Education OS for Indian schools. All endpoints are tenant-scoped to the caller’s school. Errors are returned as `{ "error": { "code", "message" } }`.',
  },
  servers: [{ url: '/api/v1' }],
  security: [{ bearerAuth: [] }],
  tags: ['Auth', 'Users', 'Students', 'Assessments', 'IEPs', 'Goals', 'Worksheets', 'Messages', 'Analytics'].map((name) => ({ name })),
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    responses: Object.fromEntries(
      [
        [400, 'Validation error'],
        [401, 'Missing or invalid access token'],
        [403, 'Role not allowed'],
        [404, 'Not found (also returned for invalid ids and records outside your scope)'],
        [409, 'Conflict / duplicate'],
        [502, 'AI provider error or invalid AI output'],
      ].map(([c, d]) => [`E${c}`, { description: d, ...json(ref('Error')) }]),
    ),
    schemas: {
      Error: {
        type: 'object',
        properties: { error: { type: 'object', properties: { code: str, message: str, details: {} }, required: ['code', 'message'] } },
      },
      Pagination: { type: 'object', properties: { page: { type: 'integer' }, limit: { type: 'integer' }, total: { type: 'integer' }, totalPages: { type: 'integer' } } },
      School: { type: 'object', properties: { id, name: str, city: str, state: str, board: str, createdAt: date, updatedAt: date } },
      User: {
        type: 'object',
        properties: { id, schoolId: id, name: str, email: str, phone: str, role: { type: 'string', enum: ['ADMIN', 'EDUCATOR', 'PARENT'] }, preferredLanguage: lang, createdAt: date, updatedAt: date },
      },
      AuthResult: {
        type: 'object',
        properties: { user: ref('User'), school: ref('School'), accessToken: str, refreshToken: str, expiresIn: { type: 'string', example: '1h' } },
      },
      Tokens: { type: 'object', properties: { accessToken: str, refreshToken: str, expiresIn: str } },
      Student: {
        type: 'object',
        properties: {
          id,
          schoolId: id,
          name: str,
          dateOfBirth: date,
          grade: str,
          section: str,
          disabilityCategories: { type: 'array', items: { type: 'string', enum: DISABILITY_CATEGORIES } },
          notes: str,
          educatorIds: { type: 'array', items: id },
          parentIds: { type: 'array', items: id },
          createdAt: date,
          updatedAt: date,
        },
      },
      StudentInput: {
        type: 'object',
        required: ['name', 'grade'],
        properties: {
          name: str,
          dateOfBirth: { type: 'string', format: 'date' },
          grade: str,
          section: str,
          disabilityCategories: { type: 'array', items: { type: 'string', enum: DISABILITY_CATEGORIES } },
          notes: str,
          educatorIds: { type: 'array', items: id },
          parentIds: { type: 'array', items: id },
        },
      },
      Assessment: {
        type: 'object',
        properties: {
          id,
          studentId: id,
          educatorId: id,
          type: { type: 'string', enum: ASSESSMENT_TYPES },
          domain: { type: 'string', enum: DOMAINS },
          scores: { type: 'object', additionalProperties: { type: 'integer', minimum: 1, maximum: 5 }, example: { phonics: 2, sightWords: 3 } },
          observations: str,
          date,
        },
      },
      Goal,
      Iep: {
        type: 'object',
        properties: {
          id,
          schoolId: id,
          studentId: id,
          createdById: id,
          status: { type: 'string', enum: IEP_STATUSES },
          language: lang,
          presentLevels: str,
          startDate: date,
          reviewDate: date,
          aiGenerated: { type: 'boolean' },
          approvedAt: date,
          approvedById: id,
          goals: { type: 'array', items: ref('Goal') },
        },
      },
      ProgressEntry: { type: 'object', properties: { id, studentId: id, iepId: id, goalId: id, educatorId: id, value: { type: 'number', minimum: 0, maximum: 100 }, note: str, date } },
      Worksheet: {
        type: 'object',
        properties: {
          id,
          studentId: { ...id, nullable: true },
          goalId: { ...id, nullable: true },
          title: str,
          subject: str,
          level: str,
          language: lang,
          adaptations: { type: 'array', items: { type: 'string', enum: ADAPTATIONS } },
          content: {
            type: 'object',
            properties: {
              sections: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    heading: str,
                    instructions: str,
                    questions: {
                      type: 'array',
                      items: { type: 'object', properties: { text: str, answerType: { type: 'string', enum: ANSWER_TYPES }, options: strArr } },
                    },
                  },
                },
              },
            },
          },
          sourceText: str,
          createdAt: date,
        },
      },
      Message: {
        type: 'object',
        properties: {
          id,
          studentId: id,
          senderId: { type: 'object', properties: { id, name: str, role: str } },
          body: str,
          attachmentWorksheetId: { ...id, nullable: true },
          readBy: { type: 'array', items: { type: 'object', properties: { userId: id, readAt: date } } },
          createdAt: date,
        },
      },
    },
  },
  paths: {
    '/auth/register-school': {
      post: op({
        summary: 'Create a school and its first ADMIN (transaction)',
        tags: ['Auth'],
        public: true,
        body: body({
          type: 'object',
          required: ['school', 'admin'],
          properties: {
            school: { type: 'object', required: ['name', 'city', 'state'], properties: { name: str, city: str, state: str, board: str } },
            admin: { type: 'object', required: ['name', 'email', 'password'], properties: { name: str, email: str, password: { type: 'string', minLength: 8 }, phone: str, preferredLanguage: lang } },
          },
        }),
        res: { 201: ok(ref('AuthResult'), 'Created') },
        errs: [400, 409],
      }),
    },
    '/auth/login': {
      post: op({
        summary: 'Log in',
        tags: ['Auth'],
        public: true,
        body: body({ type: 'object', required: ['email', 'password'], properties: { email: str, password: str } }),
        res: { 200: ok(ref('AuthResult')) },
        errs: [400, 401],
      }),
    },
    '/auth/refresh': {
      post: op({
        summary: 'Rotate refresh token (single use; reuse revokes all sessions)',
        tags: ['Auth'],
        public: true,
        body: body({ type: 'object', required: ['refreshToken'], properties: { refreshToken: str } }),
        res: { 200: ok(ref('Tokens')) },
        errs: [400, 401],
      }),
    },
    '/auth/logout': {
      post: op({
        summary: 'Revoke a refresh token',
        tags: ['Auth'],
        public: true,
        body: body({ type: 'object', required: ['refreshToken'], properties: { refreshToken: str } }),
        res: { 204: { description: 'Logged out' } },
        errs: [400],
      }),
    },
    '/auth/me': { get: op({ summary: 'Current user', tags: ['Auth'], res: { 200: ok(wrap('user', 'User')) }, errs: [401] }) },
    '/users': {
      post: op({
        summary: 'Invite an EDUCATOR or PARENT',
        tags: ['Users'],
        roles: 'ADMIN. If password is omitted a `temporaryPassword` is returned once.',
        body: body({
          type: 'object',
          required: ['name', 'email', 'role'],
          properties: { name: str, email: str, role: { type: 'string', enum: ['EDUCATOR', 'PARENT'] }, phone: str, preferredLanguage: lang, password: str },
        }),
        res: { 201: ok({ type: 'object', properties: { user: ref('User'), temporaryPassword: str } }, 'Created') },
        errs: [400, 401, 403, 409],
      }),
      get: op({
        summary: 'List users in the school',
        tags: ['Users'],
        roles: 'ADMIN, EDUCATOR',
        params: [{ name: 'role', in: 'query', schema: { type: 'string', enum: ['ADMIN', 'EDUCATOR', 'PARENT'] } }, ...pageParams],
        res: { 200: ok(page('User')) },
      }),
    },
    '/users/{id}': {
      patch: op({
        summary: 'Update a user',
        tags: ['Users'],
        roles: 'ADMIN (any user in school) or the user themself. Only ADMIN can change role.',
        params: [idParam('id', 'User')],
        body: body({ type: 'object', properties: { name: str, phone: str, preferredLanguage: lang, role: { type: 'string', enum: ['EDUCATOR', 'PARENT'] }, password: str } }),
        res: { 200: ok(wrap('user', 'User')) },
      }),
    },
    '/students': {
      get: op({
        summary: 'List students (admin: all; educator: assigned; parent: own children)',
        tags: ['Students'],
        params: [
          { name: 'search', in: 'query', schema: str, description: 'Full-text search on name' },
          { name: 'category', in: 'query', schema: { type: 'string', enum: DISABILITY_CATEGORIES } },
          { name: 'grade', in: 'query', schema: str },
          ...pageParams,
        ],
        res: { 200: ok(page('Student')) },
      }),
      post: op({ summary: 'Create student', tags: ['Students'], roles: 'ADMIN, EDUCATOR', body: body(ref('StudentInput')), res: { 201: ok(wrap('student', 'Student'), 'Created') } }),
    },
    '/students/{id}': {
      get: op({
        summary: 'Get student with team names (staff also see emails)',
        tags: ['Students'],
        params: [idParam('id', 'Student')],
        res: {
          200: ok({
            type: 'object',
            properties: {
              student: ref('Student'),
              team: {
                type: 'object',
                properties: {
                  educators: { type: 'array', items: { type: 'object', properties: { id, name: str, role: str, email: str } } },
                  parents: { type: 'array', items: { type: 'object', properties: { id, name: str, role: str, email: str } } },
                },
              },
            },
          }),
        },
      }),
      patch: op({ summary: 'Update student', tags: ['Students'], roles: 'ADMIN, assigned EDUCATOR', params: [idParam('id', 'Student')], body: body(ref('StudentInput')), res: { 200: ok(wrap('student', 'Student')) } }),
      delete: op({
        summary: 'Erase student and all linked records (DPDP right to erasure, transaction)',
        tags: ['Students'],
        roles: 'ADMIN',
        params: [idParam('id', 'Student')],
        res: { 204: { description: 'Deleted' } },
      }),
    },
    '/students/{id}/educators': {
      post: op({
        summary: 'Assign educators',
        tags: ['Students'],
        roles: 'ADMIN',
        params: [idParam('id', 'Student')],
        body: body({ type: 'object', required: ['educatorIds'], properties: { educatorIds: { type: 'array', items: id } } }),
        res: { 200: ok(wrap('student', 'Student')) },
      }),
    },
    '/students/{id}/parents': {
      post: op({
        summary: 'Link parents',
        tags: ['Students'],
        roles: 'ADMIN, assigned EDUCATOR',
        params: [idParam('id', 'Student')],
        body: body({ type: 'object', required: ['parentIds'], properties: { parentIds: { type: 'array', items: id } } }),
        res: { 200: ok(wrap('student', 'Student')) },
      }),
    },
    '/students/{id}/assessments': {
      get: op({
        summary: 'List assessments (newest first)',
        tags: ['Assessments'],
        params: [idParam('id', 'Student'), { name: 'domain', in: 'query', schema: { type: 'string', enum: DOMAINS } }, ...pageParams],
        res: { 200: ok(page('Assessment')) },
      }),
      post: op({
        summary: 'Record an assessment',
        tags: ['Assessments'],
        roles: 'ADMIN, assigned EDUCATOR',
        params: [idParam('id', 'Student')],
        body: body({
          type: 'object',
          required: ['type', 'domain', 'scores'],
          properties: {
            type: { type: 'string', enum: ASSESSMENT_TYPES },
            domain: { type: 'string', enum: DOMAINS },
            scores: { type: 'object', additionalProperties: { type: 'integer', minimum: 1, maximum: 5 } },
            observations: str,
            date: { type: 'string', format: 'date' },
          },
        }),
        res: { 201: ok(wrap('assessment', 'Assessment'), 'Created') },
      }),
    },
    '/students/{id}/ieps/generate': {
      post: op({
        summary: 'AI-draft an IEP (saved as DRAFT, never auto-approved)',
        tags: ['IEPs'],
        roles: 'ADMIN, assigned EDUCATOR. The student’s name is never sent to the AI.',
        params: [idParam('id', 'Student')],
        body: { ...json({ type: 'object', properties: { language: lang, startDate: { type: 'string', format: 'date' }, focusDomains: { type: 'array', items: { type: 'string', enum: DOMAINS } } } }) },
        res: { 201: ok(wrap('iep', 'Iep'), 'Created') },
        errs: [400, 401, 403, 404, 502],
      }),
    },
    '/students/{id}/ieps': {
      get: op({
        summary: 'List IEPs for a student (parents see APPROVED/ARCHIVED only)',
        tags: ['IEPs'],
        params: [idParam('id', 'Student'), { name: 'status', in: 'query', schema: { type: 'string', enum: IEP_STATUSES } }, ...pageParams],
        res: { 200: ok(page('Iep')) },
      }),
    },
    '/ieps': {
      get: op({
        summary: 'IEPs across your caseload (e.g. ?status=APPROVED&dueWithinDays=30); studentId is populated with name',
        tags: ['IEPs'],
        params: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: IEP_STATUSES } },
          { name: 'dueWithinDays', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 365 } },
          ...pageParams,
        ],
        res: { 200: ok(page('Iep')) },
      }),
    },
    '/progress/recent': {
      get: op({
        summary: 'Latest progress entries across your caseload, with student name and goal text',
        tags: ['Goals'],
        params: [{ name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50, default: 10 } }],
        res: { 200: ok({ type: 'object', properties: { data: { type: 'array', items: ref('ProgressEntry') } } }) },
      }),
    },
    '/ieps/{id}': {
      get: op({ summary: 'Get IEP', tags: ['IEPs'], params: [idParam('id', 'IEP')], res: { 200: ok(wrap('iep', 'Iep')) } }),
      patch: op({
        summary: 'Edit IEP (not ARCHIVED). Pass goal `id` to keep a goal and its progress history.',
        tags: ['IEPs'],
        roles: 'ADMIN, assigned EDUCATOR',
        params: [idParam('id', 'IEP')],
        body: body({
          type: 'object',
          properties: {
            presentLevels: str,
            startDate: { type: 'string', format: 'date' },
            reviewDate: { type: 'string', format: 'date' },
            language: lang,
            goals: { type: 'array', items: Goal },
          },
        }),
        res: { 200: ok(wrap('iep', 'Iep')) },
        errs: [400, 401, 403, 404, 409],
      }),
    },
    '/ieps/{id}/approve': {
      post: op({
        summary: 'Approve a DRAFT IEP; archives the previous APPROVED one (transaction)',
        tags: ['IEPs'],
        roles: 'ADMIN, assigned EDUCATOR',
        params: [idParam('id', 'IEP')],
        res: { 200: ok(wrap('iep', 'Iep')) },
        errs: [400, 401, 403, 404, 409],
      }),
    },
    '/ieps/{id}/pdf': { get: op({ summary: 'Download IEP as PDF', tags: ['IEPs'], params: [idParam('id', 'IEP')], res: { 200: pdf } }) },
    '/goals/{id}': {
      patch: op({
        summary: 'Update one goal (positional update on goals._id)',
        tags: ['Goals'],
        roles: 'ADMIN, assigned EDUCATOR',
        params: [idParam('id', 'Goal')],
        body: body({ ...Goal, properties: { ...(Goal.properties as Obj), id: undefined } }),
        res: { 200: ok(wrap('goal', 'Goal')) },
        errs: [400, 401, 403, 404, 409],
      }),
    },
    '/goals/{id}/progress': {
      post: op({
        summary: 'Record progress (APPROVED IEPs only)',
        tags: ['Goals'],
        roles: 'ADMIN, assigned EDUCATOR',
        params: [idParam('id', 'Goal')],
        body: body({ type: 'object', required: ['value'], properties: { value: { type: 'number', minimum: 0, maximum: 100 }, note: str, date: { type: 'string', format: 'date' } } }),
        res: { 201: ok(wrap('progress', 'ProgressEntry'), 'Created') },
        errs: [400, 401, 403, 404, 409],
      }),
      get: op({ summary: 'Progress history (oldest first)', tags: ['Goals'], params: [idParam('id', 'Goal'), ...pageParams], res: { 200: ok(page('ProgressEntry')) } }),
    },
    '/students/{id}/worksheets/generate': {
      post: op({
        summary: 'AI-generate a worksheet for the student’s level and goal',
        tags: ['Worksheets'],
        roles: 'ADMIN, assigned EDUCATOR',
        params: [idParam('id', 'Student')],
        body: body({
          type: 'object',
          required: ['subject', 'topic'],
          properties: { subject: str, topic: str, goalId: id, adaptations: { type: 'array', items: { type: 'string', enum: ADAPTATIONS } }, language: lang },
        }),
        res: { 201: ok(wrap('worksheet', 'Worksheet'), 'Created') },
        errs: [400, 401, 403, 404, 502],
      }),
    },
    '/students/{id}/worksheets': {
      get: op({ summary: 'List worksheets for a student', tags: ['Worksheets'], params: [idParam('id', 'Student'), ...pageParams], res: { 200: ok(page('Worksheet')) } }),
    },
    '/worksheets/adapt': {
      post: op({
        summary: 'Rewrite existing worksheet text for a learner profile',
        tags: ['Worksheets'],
        roles: 'ADMIN, EDUCATOR',
        body: body({
          type: 'object',
          required: ['sourceText', 'adaptations'],
          properties: { sourceText: str, adaptations: { type: 'array', items: { type: 'string', enum: ADAPTATIONS } }, language: lang, studentId: id, subject: str },
        }),
        res: { 201: ok(wrap('worksheet', 'Worksheet'), 'Created') },
        errs: [400, 401, 403, 404, 502],
      }),
    },
    '/worksheets/{id}': {
      get: op({ summary: 'Get worksheet', tags: ['Worksheets'], params: [idParam('id', 'Worksheet')], res: { 200: ok(wrap('worksheet', 'Worksheet')) } }),
      patch: op({
        summary: 'Edit a worksheet (title, level, adaptations, content) before printing or sharing',
        tags: ['Worksheets'],
        roles: 'ADMIN, EDUCATOR (with access to the student)',
        params: [idParam('id', 'Worksheet')],
        body: body({ type: 'object', properties: { title: str, level: str, adaptations: { type: 'array', items: { type: 'string', enum: ADAPTATIONS } }, content: { type: 'object' } } }),
        res: { 200: ok(wrap('worksheet', 'Worksheet')) },
      }),
    },
    '/worksheets/{id}/pdf': {
      get: op({
        summary: 'Download worksheet PDF (applies dyslexia font, large print, spacing, contrast, chunking, visual boxes)',
        tags: ['Worksheets'],
        params: [idParam('id', 'Worksheet')],
        res: { 200: pdf },
      }),
    },
    '/students/{id}/messages': {
      get: op({ summary: 'Message thread (oldest first)', tags: ['Messages'], params: [idParam('id', 'Student'), ...pageParams], res: { 200: ok(page('Message')) } }),
      post: op({
        summary: 'Post a message (staff and linked parents)',
        tags: ['Messages'],
        params: [idParam('id', 'Student')],
        body: body({ type: 'object', required: ['body'], properties: { body: str, attachmentWorksheetId: id } }),
        res: { 201: ok(wrap('message', 'Message'), 'Created') },
      }),
    },
    '/messages/{id}/read': {
      post: op({ summary: 'Mark message as read (idempotent)', tags: ['Messages'], params: [idParam('id', 'Message')], res: { 200: ok(wrap('message', 'Message')) } }),
    },
    '/analytics/school': {
      get: op({
        summary: 'School dashboard (aggregation pipelines)',
        tags: ['Analytics'],
        roles: 'ADMIN',
        res: {
          200: ok({
            type: 'object',
            properties: {
              totalStudents: { type: 'integer' },
              studentsByDisabilityCategory: { type: 'array', items: { type: 'object', properties: { category: str, count: { type: 'integer' } } } },
              approvedIep: { type: 'object', properties: { students: { type: 'integer' }, percentage: { type: 'number' } } },
              iepsDueForReview: { type: 'object', properties: { within30Days: { type: 'integer' }, items: { type: 'array', items: { type: 'object' } } } },
              goalStatusBreakdown: { type: 'array', items: { type: 'object', properties: { status: str, count: { type: 'integer' } } } },
              averageProgressByDomain: { type: 'array', items: { type: 'object', properties: { domain: str, averageProgress: { type: 'number' }, goals: { type: 'integer' } } } },
              educatorActivityLast30Days: { type: 'array', items: { type: 'object' } },
            },
          }),
        },
        errs: [401, 403],
      }),
    },
    '/analytics/students/{id}': {
      get: op({
        summary: 'Goal progress over time for a student',
        tags: ['Analytics'],
        roles: 'ADMIN, assigned EDUCATOR, linked PARENT',
        params: [idParam('id', 'Student')],
        res: { 200: ok({ type: 'object', properties: { studentId: id, goals: { type: 'array', items: { type: 'object' } }, assessmentTrend: { type: 'array', items: { type: 'object' } } } }) },
      }),
    },
  },
};
