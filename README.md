# XUYENVIET

XUYENVIET is a travel planning platform for road trips across Vietnam. The initial product is a web app, with a mobile app planned later.

## Purpose

More people in Vietnam are traveling by car, which creates a growing need for better trip planning and more reliable travel information. Existing information is often scattered across social groups and outdated by the time someone finds it.

This project aims to make trip planning easier by collecting travel data from multiple sources and using AI as an assistant and agent that helps users plan, prepare, and manage every part of a road trip.

## What it should help with

- Building trip plans, including destinations, routes, and trip duration
- Helping users find hotels, sightseeing spots, charging stations, rest stops, and other useful places
- Acting as a trip assistant that can suggest, organize, and adapt plans based on user needs
- Collecting and organizing shared travel knowledge in one place
- Keeping travel information easier to search and more up to date

## Product direction

The long-term idea is for the AI assistant and agent to combine:

- information gathered from the internet
- curated data stored in the database
- user preferences and trip context

This should create a more personalized travel experience than searching through scattered posts or static lists, while helping users throughout the full road trip workflow from inspiration to planning to on-the-road decisions.

## Vision

XUYENVIET should become a practical AI trip companion for people traveling through Vietnam by car, helping them plan smarter, adapt faster, and discover better options with less effort.

## Local development

This repository is a pnpm workspace with four independently runnable workloads:

- traveler web: the root Next.js application on port `3000`
- public HTTPS API: `apps/api`, a NestJS application on port `3001`
- worker: `apps/worker` on port `3002`
- admin presentation: `apps/admin`, a separate Next.js application on port `3003`

Requirements:

- Node.js 20.19 or newer
- pnpm 10.x
- PostgreSQL connection string for database migration commands
- OpenAI-compatible AI Gateway URL and API key for future AI provider calls

Setup:

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
pnpm dev
```

`pnpm dev` starts only the traveler web application. It does not start the Nest API, Worker, or admin presentation application.

Run the local workloads through the root shortcuts:

```bash
pnpm api dev
pnpm admin dev
pnpm worker
```

API and admin run in watch mode. Worker builds once and then starts because its supervisor executes independently bundled child adapters; rerun `pnpm worker` after changing Worker code.

### Admin Google sign-in

The public Nest API owns Google OAuth, opaque browser sessions, and CSRF. Deployment uses HTTPS and the `__Host-xuyenviet-session` cookie; `APP_ENV=local` permits exact HTTP loopback origins only. Configure Google with the API-host callback in `XV_BROWSER_GOOGLE_CALLBACK_URL`, for example `https://api.xuyenviet.app/auth/google/callback`. `apps/admin` starts OAuth at that API and supplies only exact, configured admin return URLs.

1. Start the API and admin in separate terminals:

   ```bash
   pnpm api dev
   pnpm admin dev
   ```

2. Ensure the Google account is represented in the local database and has the `operator` or `admin` role.

3. Open an admin page such as `http://localhost:3003/`; an unauthenticated direct API call begins OAuth.

### Run the Nest API locally

The API is a separate process and requires an API-only environment file. Do not give this file to the web, worker, or admin processes.

1. Create `apps/api/.env.local` from `apps/api/.env.example`, then add the API runtime variables below from the deployment secret store or an approved local-development secret set.
2. Set `DATABASE_URL` and the `XV_BROWSER_*` OAuth/session/CSRF variables.
4. Build and start the API:

```bash
pnpm --filter @xuyenviet/api build
pnpm api dev
```

The API listens on `PORT`, defaulting to `3001`. Deployment is browser-facing over public HTTPS with credentialed CORS restricted to exact origins in `XV_BROWSER_ALLOWED_ORIGINS`. Local development may instead use exact HTTP loopback origins. Never use wildcard or prefix origins/return URLs.

Use these endpoints to verify a local API process:

```bash
curl http://127.0.0.1:3001/health/live
curl http://127.0.0.1:3001/openapi.json
```

Run `pnpm db:migrate` against the intended `DATABASE_URL` before starting workloads that use the changed schema.

### Other local workloads

```bash
# Build and run the continuous worker.
pnpm worker

# Build and run the separate admin presentation application.
pnpm admin dev
```

The worker reads `apps/worker/.env.local`, which should be created from `apps/worker/.env.example`. It receives `DATABASE_URL` and only the provider credentials needed by its assigned loops. The admin application reads `apps/admin/.env.local` and needs only `NEXT_PUBLIC_API_ORIGIN`; it must not receive database, OAuth, bearer, or private-service secrets.

Quality checks:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

Testing:

```bash
pnpm test
pnpm test:run
```

The integration test suite uses `DATABASE_URL_TEST`, not `DATABASE_URL`. Create a separate local test database before running the suite, for example:

```sql
CREATE DATABASE xuyenviet_test;
```

Set `DATABASE_URL_TEST` in `.env` or `.env.local` so it points to that test database. The Vitest global setup runs Drizzle migrations against the test database automatically. Tests use fake OAuth, AI Gateway, and Tavily values and must not require real provider credentials.

DB-backed tests share this database and reset its tables between tests. Run focused suites sequentially, never in parallel with another Vitest command, and run the baseline checks in this order after tests:

```bash
DATABASE_URL_TEST='postgres://...' pnpm test:run -- tests/knowledge-search.test.ts
DATABASE_URL_TEST='postgres://...' pnpm test:run -- tests/knowledge-source-removal.test.ts
DATABASE_URL_TEST='postgres://...' pnpm test:run -- tests/knowledge-ingestion-pipeline.test.ts
DATABASE_URL_TEST='postgres://...' pnpm test:run -- tests/answer-context.test.ts tests/web-search-adapter.test.ts tests/ai-ask-shell.test.ts
pnpm lint
pnpm typecheck
pnpm build
```

Do not use `pnpm db:reset` for test verification: Vitest owns only `DATABASE_URL_TEST`, while database scripts use `DATABASE_URL`.

## Server deployment

Docker Compose builds four separate workloads: traveler web (`app`), public Nest API (`api`), Worker (`worker`), and the optional admin presentation application (`admin`). PostgreSQL remains external. Run migrations before starting a workload that claims durable work or serves API traffic.

1. Create separate deployment environment files from `.env.example`: `.web.env`, `.api.env`, `.worker.env`, and `.admin.env`. Set `APP_ENV="production"`, a TLS-enabled non-localhost `DATABASE_URL` only for workloads that require it, and real provider/authentication secrets. Apply least privilege as described below; never pass the combined template to a workload. Compose defaults to the local API and admin files only when these overrides are omitted.
2. Run migrations once for each release that includes database changes:

   ```bash
   API_ENV_FILE=.api.env docker compose --profile migrate run --rm migrate
   ```

3. Build and start traveler web, API, and Worker:

   ```bash
   WEB_ENV_FILE=.web.env API_ENV_FILE=.api.env WORKER_ENV_FILE=.worker.env docker compose up -d --build app api worker
   ```

4. Build the admin image or run its Compose validation profile when needed:

   ```bash
   WEB_ENV_FILE=.web.env API_ENV_FILE=.api.env WORKER_ENV_FILE=.worker.env ADMIN_ENV_FILE=.admin.env docker compose --profile admin up -d --build admin
   ```

Compose binds traveler web to `127.0.0.1:8000`, Worker to `127.0.0.1:3002`, and admin to `127.0.0.1:8003`; the API has no host-published port. Its Compose healthcheck uses `GET /health/live` on its internal port `3001`. In deployment, publish the API over HTTPS and restrict credentialed CORS to exact browser origins; Google must redirect to the API-host callback, not an admin route.

The Worker `GET /health/live` endpoint is process liveness and `GET /health/ready` requires valid configuration, PostgreSQL, and all assigned loops to be poll-eligible. On `SIGTERM` or `SIGINT`, it becomes non-ready before it stops admitting new polls, then allows in-flight work to settle through the feature-owned durable protocol. Pass the same `*_ENV_FILE` variables to `docker compose logs -f app`, `docker compose logs -f api`, `docker compose logs -f worker`, and `docker compose down`.

Database scripts:

```bash
pnpm db:generate
pnpm db:migrate
```

`db:generate` and `db:migrate` use `drizzle.config.ts` and `DATABASE_URL`. The repository starts from the consolidated `0000_baseline` migration; all subsequent schema changes must be forward-only migrations.

Worker operations:

```bash
pnpm worker
pnpm trip-proposal-expiry --once
pnpm knowledge:assistant-provenance-withdrawal-backfill --execute
```

`pnpm worker` is the sole continuous owner for extraction, canonical ingestion, indexing, and AI Ask domain-outbox delivery. The Worker invokes package-owned work paths without changing their PostgreSQL claim, lease, fencing, CAS, or idempotency protocols. See [`docs/runbooks/worker-operations.md`](docs/runbooks/worker-operations.md) for safe telemetry, lifecycle checks, and repository proof.

`pnpm trip-proposal-expiry --once` is a finite scheduled-maintenance command. A scheduler may launch exactly this command, never a perpetual proposal-expiry process. It rejects every argument other than `--once`; source-retention and provenance-withdrawal commands remain explicit operator operations, and Facebook/YouTube capture remains external operator-controlled work.

### Admin Direct Browser API

`apps/admin` is an independent Next.js presentation deployment for `admin.xuyenviet.app`, not a domain runtime. It needs only `NEXT_PUBLIC_API_ORIGIN` and calls Nest with `credentials: "include"`. Its `GET /api/health` route is static process health only and never proxies identity or credentials.

The public API owns Google OAuth, state/PKCE, opaque browser sessions, role checks, and CSRF. Configure Google with the exact API callback from `XV_BROWSER_GOOGLE_CALLBACK_URL`, for example `https://api.xuyenviet.app/auth/google/callback`. Set `XV_BROWSER_ALLOWED_ORIGINS` to exact public HTTPS browser origins and enumerate every allowed return URL in `XV_BROWSER_ALLOWED_RETURN_URLS`; no wildcard or path-prefix entries are accepted. The admin application must not receive database, OAuth provider, bearer, or private-service credentials.

### Assistant provenance withdrawal backfill release procedure

`knowledge:assistant-provenance-withdrawal-backfill` is an explicit, one-time operator maintenance command. It is not a scheduled worker. It refuses to run without `--execute`, processes bounded batches of 1 through 500 rows, and continues synchronously until it reaches a terminal `completed` or `failed` result. Its output contains only the terminal status, batch count, scanned count, and safe failure code when applicable.

1. Put the deployment into a quiescent maintenance window. Stop the application and all workers that can create assistant provenance or withdraw sources/evidence. Do not deploy or run competing operator maintenance while the command is active.
2. Run `pnpm knowledge:assistant-provenance-withdrawal-backfill --execute`. Use `--batch-size=1..500` only to bound each transaction. Do not interrupt a progressing run.
3. If it reports `failed`, keep the deployment quiescent, repair the data indicated by its safe failure code through the operator workflow, then rerun with `--execute --retry-failed`. Do not release traffic while the state is failed.
4. Release the application and workers only after the command reports `completed`. The command is safe to invoke again after completion and reports zero new work.

## Public launch safety

Before public user onboarding, verify each environment separately:

- `APP_ENV` is set to `local`, `staging`, or `production`; staging and production do not share databases, OAuth clients, provider keys, or secret stores.
- Production `DATABASE_URL`, `XV_BROWSER_GOOGLE_CLIENT_ID`, `XV_BROWSER_GOOGLE_CLIENT_SECRET`, `XV_BROWSER_SESSION_LOOKUP_KEY`, `XV_BROWSER_CSRF_KEY`, `XV_BROWSER_OAUTH_TRANSACTION_PROTECTION_KEY`, `AI_GATEWAY_BASE_URL`, `AI_GATEWAY_API_KEY`, and `TAVILY_API_KEY` are real values, not `.env.example` placeholders.
- Production database URLs do not point to localhost or a shared development database.
- Google OAuth callback URLs are configured for the deployed API host, including `/auth/google/callback`.
- At least one initial admin/operator user role is created in PostgreSQL before operator workflows are needed.
- AI Gateway, search provider, and any model/provider privacy settings are checked so project data is not used for provider training where configurable.
- PostgreSQL backup and restore expectations are documented for the chosen hosted database, including who can restore and how restore is verified.
- Local bypasses or development-only shortcuts are not enabled in production defaults.
