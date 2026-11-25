# AbleSprout API

The web frontend is in the sibling `ablesprout-ui` folder/repo.

Backend for **AbleSprout**, an AI-powered Inclusive Education OS for Indian schools. It helps special educators, general teachers and therapists support children with learning disabilities, ADHD, autism, low vision and intellectual disabilities: student profiles, assessments, AI-drafted IEPs, progress tracking, accessible worksheets, parent messaging and school analytics.

**Stack:** Node.js + TypeScript + Express 4 · MongoDB/Mongoose 8 · JWT (access + revocable refresh) · Zod · Anthropic or OpenAI behind one interface · pdfkit · pino · Jest + supertest + mongodb-memory-server.

---

## Quick start

### Option A: Docker (API + MongoDB replica set)

```bash
cp .env.example .env
```

Edit `.env` and set the two `JWT_*_SECRET` values and `LLM_API_KEY`. Then start the stack:

```bash
docker compose up --build -d
```

Load the demo data:

```bash
docker compose exec api node dist/scripts/seed.js
```

- API: http://localhost:4000/api/v1
- Swagger UI: http://localhost:4000/api/docs (raw spec: `/api/docs.json`)
- Health: http://localhost:4000/health

The compose file runs MongoDB as a single-node replica set (`rs0`), which multi-document transactions need. To connect from your host machine (Compass, mongosh), use `mongodb://localhost:27017/ablesprout?directConnection=true`.

### Option B: Deploy on Vercel (serverless) + MongoDB Atlas

`vercel.json` routes every request to `api/index.ts`, a serverless Express handler that caches the Mongo connection between warm invocations. Import the repo into Vercel and set these environment variables:

- `MONGODB_URI` (Atlas; allow Vercel in Network Access)
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
- `LLM_PROVIDER`, `LLM_API_KEY`
- `FRONTEND_URL`: comma-separated, `*` wildcard allowed, e.g. `https://ablesprout-ui.vercel.app,https://ablesprout-ui-*.vercel.app`
- `PROXY_SHARED_SECRET`: same value as the UI's

AI calls can take up to a minute, so `maxDuration` is set to 120s. Plans with a lower function limit cap it. Vercel has no system fonts: to get the OpenDyslexic and Hindi PDF fonts there, add the font files to `fonts/` (see `fonts/README.md`). Seed once from your machine with `MONGODB_URI=… npm run seed`.

### Option C: Local Node with MongoDB Atlas (or your own replica set)

Requires Node 20+.

```bash
npm install
```

```bash
cp .env.example .env
```

Set `MONGODB_URI` to your Atlas connection string, plus the JWT secrets and `LLM_API_KEY`. Then:

```bash
npm run seed
```

```bash
npm run dev
```

> Transactions (`register-school`, IEP approval, student erasure) need a replica set. Atlas clusters are replica sets by default. A standalone local `mongod` will fail on those routes.

### Tests

```bash
npm test
```

Tests start an in-memory MongoDB **replica set**, so transactions run for real. The LLM is mocked. Nothing needs to be running and no API key is used. The first run downloads a MongoDB binary.

---

## Demo logins (after seeding)

Every demo account uses the password **`Demo@12345`**.

| Role | Name | Email | Sees |
|---|---|---|---|
| ADMIN | Priya Deshpande | `admin@sunrise.example` | Whole school + analytics |
| EDUCATOR | Kavya Iyer (special educator) | `kavya@sunrise.example` | Aarav, Zoya, Vihaan, Meher |
| EDUCATOR | Rohan Mehta (therapist) | `rohan@sunrise.example` | Zoya, Ananya, Arjun, Meher |
| PARENT | Sunita Sharma (Hindi preferred) | `sunita@parent.example` | Aarav only |
| PARENT | Imran Khan | `imran@parent.example` | Zoya only |

What the seed creates: 1 school (Sunrise Inclusive Public School, Pune, CBSE), 6 students with a mix of needs (SLD/dyslexia, autism, ADHD, low vision, intellectual disability, SLD + speech-language), 10 assessments, an **APPROVED** IEP for Aarav with 14 weekly progress entries, a **DRAFT** AI IEP for Zoya, 3 worksheets (English, Hindi, large-print maths), and a teacher–parent message thread with a worksheet attached.

Re-running the seed replaces only the demo school. Other schools are left alone.

```bash
# Try it
curl -s localhost:4000/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"kavya@sunrise.example","password":"Demo@12345"}'
```

---

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `MONGODB_URI` | `mongodb://localhost:27017/ablesprout` | Atlas or a replica set |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | (required) | 32+ characters each. Generate with `openssl rand -hex 48` |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL_DAYS` | `1h` / `7` | |
| `FRONTEND_URL` | `http://localhost:5173` | CORS allow-list. Comma-separate multiple origins |
| `LLM_PROVIDER` | `anthropic` | `anthropic`, `openai`, or `mock`. `mock` gives offline canned drafts for demos and E2E tests only |
| `LLM_API_KEY` | (none) | Provider API key |
| `LLM_MODEL` | `claude-opus-5-5` for Anthropic | Required when `LLM_PROVIDER=openai` |
| `DYSLEXIA_FONT_PATH` / `HINDI_FONT_PATH` | Debian font paths | Set in the Docker image. Locally, point these at OpenDyslexic / Noto Sans Devanagari files, or leave them unset to fall back to Helvetica |
| `LOG_LEVEL` | `info` | pino level |
| `PROXY_SHARED_SECRET` | (none) | Shared with the UI's auth proxy. When it matches, rate limits use the forwarded `X-Client-IP` |
| `API_RATE_LIMIT` | `600` | All API requests per IP per 15 minutes (raise if a school shares one IP) |
| `AUTH_RATE_LIMIT` | `20` | Logins/refreshes per IP per 15 minutes |

---

## Architecture

```
src/
  config/        env (Zod-validated), pino logger
  db/            connection, withTransaction helper
  models/        Mongoose schemas + toJSON plugin (id instead of _id, no __v/secrets)
  validators/    Zod request schemas
  middleware/    auth + requireRole, validate, ObjectId param guard, rate limits, error handler
  routes/ -> controllers/ -> services/ -> models/
  ai/
    llm/         LLMProvider interface, Anthropic + OpenAI implementations
    prompts/     system prompts + prompt builders (IEP, worksheet, adapt)
    schemas.ts   Zod schemas for model output
    generate.ts  JSON extraction, validation, single retry, token-usage logging
    anonymize.ts strips student names/contact details before LLM calls, restores after
  services/pdf.service.ts   IEP + accessible worksheet PDFs
  docs/openapi.ts           OpenAPI 3.1 spec served by swagger-ui
scripts/seed.ts
tests/
```

### Security and privacy

- **Tenant isolation.** `schoolId` always comes from the verified JWT. `tenantFilter()` applies it *last*, so a client-supplied filter can never override it. Every query in the services goes through it.
- **Row-level scoping.** `getAccessibleStudent()` enforces admin = whole school, educator = assigned students, parent = own child, and `write` blocks parents. A record you can't access returns **404, not 403**, so the API never reveals whether a record exists in another school.
- **Refresh tokens.** Stored as SHA-256 hashes, rotated on every use and consumed atomically. Reusing a token revokes all of that user's sessions. Changing the password also signs out everywhere. At most 10 concurrent sessions per user.
- **Input hardening.** Helmet, CORS allow-list, `express-mongo-sanitize`, strict Zod schemas (unknown keys rejected on PATCH), a 256 KB body limit, and rate limits (global, auth, and per-user on AI endpoints).
- **DPDP Act 2023.** `auditLogs` records CREATE, UPDATE, APPROVE, DELETE, GENERATE and EXPORT on students, assessments and IEPs (plus users and worksheets). Entries store field names only, never values. `DELETE /students/:id` (ADMIN) erases a student and every linked record in one transaction and keeps the audit entry.
- **IDs.** Malformed or unknown ids return 404 through a router-level param guard plus CastError → 404 mapping.

### AI behaviour

- Prompts are in `src/ai/prompts`. They set the Indian classroom context, align with NEP 2020 and the RPwD Act 2016, require strengths-based person-first language, forbid diagnosis or medical advice, and demand strict JSON.
- Output is validated with Zod. On invalid JSON or a schema mismatch the model is re-prompted **once** with the validation errors, then the API returns `502 AI_INVALID_OUTPUT`.
- **Names never reach the LLM.** The student's full name and each part of it (including possessives) are replaced with "the student". Phone, email and Aadhaar-like numbers are masked. The first name is put back into the saved document afterwards.
- `language: "en" | "hi"` switches output to English or Hindi (Devanagari). Hindi PDFs use Noto Sans Devanagari.
- Token usage is logged for every attempt: `{ ai: { task, provider, model, attempt, inputTokens, outputTokens, ms } }`.
- AI IEPs are always saved as **DRAFT** and need an explicit `POST /ieps/:id/approve`.
- Anthropic: defaults to `claude-opus-5-5` at effort `medium`. Server-side refusal fallback (`fallbacks: "default"`) is enabled for models that support it. A refusal that still stands returns `422 AI_REFUSED`.

### Accessible worksheet PDFs

| Adaptation | PDF effect |
|---|---|
| `dyslexia_font` | OpenDyslexic, cream background, extra letter and line spacing, left-aligned |
| `large_print` | 18 pt body / 24 pt headings, bigger answer areas |
| `extra_spacing` | Larger line and paragraph gaps |
| `high_contrast` | Pure black on white, thicker lines |
| `chunked_steps` | Instructions split into numbered "Step n" lines |
| `visual_supports` | `[picture: …]` cues become labelled boxes to draw or paste into |
| `simplified_language` | Applied by the AI when it writes the text |

---

## API overview

Everything is under `/api/v1`. Errors look like `{ "error": { "code", "message", "details?" } }`. List endpoints take `?page=&limit=` (max 100) and return `{ data, pagination }`. The full contract is in Swagger at `/api/docs`.

| Area | Endpoints | Roles |
|---|---|---|
| Auth | `POST /auth/register-school`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `GET /auth/me` | public / any |
| Users | `POST /users`, `GET /users?role=`, `PATCH /users/:id` | ADMIN (list: + EDUCATOR; patch: self too) |
| Students | `GET/POST /students` (`?search=&category=&grade=`), `GET /students/:id` returns `{ student, team }`, `GET/PATCH/DELETE /students/:id`, `POST /students/:id/educators`, `POST /students/:id/parents` | scoped by role |
| Assessments | `GET/POST /students/:id/assessments` | write: staff |
| IEPs | `GET /ieps?status=&dueWithinDays=` (caseload-scoped), `POST /students/:id/ieps/generate`, `GET /students/:id/ieps`, `GET/PATCH /ieps/:id`, `POST /ieps/:id/approve`, `GET /ieps/:id/pdf` | write: staff; parents see approved/archived only |
| Goals | `PATCH /goals/:id`, `POST/GET /goals/:id/progress`, `GET /progress/recent` | write: staff |
| Worksheets | `POST /students/:id/worksheets/generate`, `POST /worksheets/adapt`, `GET /students/:id/worksheets`, `GET/PATCH /worksheets/:id`, `GET /worksheets/:id/pdf` | write: staff |
| Messages | `GET/POST /students/:id/messages`, `POST /messages/:id/read` | anyone linked to the student |
| Analytics | `GET /analytics/school`, `GET /analytics/students/:id` | school: ADMIN; student: anyone with access |

### Design notes

- **Disability categories** are the 21 RPwD Act 2016 categories plus `ADHD`. ADHD is not a separate RPwD category but schools commonly support it.
- **One approved IEP per student** is guaranteed by a partial unique index as well as the approval transaction, so concurrent approvals can't produce two.
- **Progress entries** live in their own collection (unbounded growth) and can only be recorded on APPROVED IEPs. The first entry moves a goal from `NOT_STARTED` to `IN_PROGRESS`.
- **Editing goals.** `PATCH /ieps/:id` with a `goals` array replaces the goals. Include each goal's `id` to keep it and its progress history. `PATCH /goals/:id` updates one goal in place with the positional operator.
- **Analytics** run as MongoDB aggregation pipelines: `$facet`, `$unwind` + `$group`, `$lookup` with sub-pipelines (latest progress per goal), and `$unionWith` across four collections for educator activity.
- **Invites.** `POST /users` without a `password` returns a one-time `temporaryPassword`. There is no email service yet.
# ablesprout-api
