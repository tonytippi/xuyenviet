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

This repository now contains the public MVP web app foundation.

Requirements:

- Node.js 20.19 or newer
- pnpm 10.x
- PostgreSQL connection string for database migration commands
- OpenAI-compatible AI Gateway URL and API key for future AI provider calls

Setup:

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

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

Docker Compose runs the web application plus the long-running knowledge extraction and indexing workers. PostgreSQL remains external and must be reachable through the `DATABASE_URL` set in the deployment environment file.

1. Create a production environment file, for example `production.env`, from `.env.example`. Set `APP_ENV="production"`, a TLS-enabled non-localhost `DATABASE_URL` required by the selected Postgres provider, `AUTH_URL` to the public HTTPS Cloudflare Tunnel hostname, and real provider/authentication secrets.
2. Run migrations once for each release that includes database changes:

   ```bash
   ENV_FILE=production.env docker compose --profile migrate run --rm migrate
   ```

3. Build and start the application:

   ```bash
   ENV_FILE=production.env docker compose up -d --build
   ```

The application binds to `127.0.0.1:3000` only. Configure the Cloudflare Tunnel origin as `http://localhost:3000`; no public inbound port needs to be exposed by the server. The container readiness check at `/api/health` validates its production environment and external database connection. The `knowledge-extractor` and `knowledge-indexing` services run continuously and restart independently. Use the same `ENV_FILE` value with `docker compose logs -f app`, `docker compose logs -f knowledge-extractor`, and `docker compose down`.

Database scripts:

```bash
pnpm db:generate
pnpm db:migrate
```

`db:generate` and `db:migrate` use `drizzle.config.ts` and `DATABASE_URL`. Story 1.1 intentionally configures Drizzle without adding domain tables.

Operations scripts:

```bash
pnpm facebook:capture --limit 5
pnpm youtube:capture --limit 5
pnpm capture-cache:migrate
pnpm knowledge:extraction-worker
pnpm knowledge:extraction-worker --once
pnpm knowledge:indexing-worker
pnpm knowledge:indexing-worker --once
```

`facebook:capture` reads queued Facebook source links from PostgreSQL and saves visible captured text for later operator review. Scheduled runs use a configured service audit actor; see `docs/facebook-capture-operations.md`.

Capture commands use two databases: `DATABASE_URL` is the application database reached through the protected operator tunnel, while `CAPTURE_CACHE_DATABASE_URL` is a separate local PostgreSQL archive. Run `pnpm capture-cache:migrate` once before capture. The commands fail closed if either URL is invalid, the targets are the same, or the archive schema is absent. Back up the local archive with encrypted, tested restores; it contains durable validated capture artifacts and is required to replay after an application database reset. Never commit either URL, Gemini keys, browser profiles, or backups.

`knowledge:extraction-worker` runs queued AI knowledge extraction jobs outside the admin request path. Use the default long-running mode for production worker processes, or `--once` for local/debug runs. The worker uses PostgreSQL job state, retries transient provider failures, and requeues stale `running` jobs after `KNOWLEDGE_EXTRACTION_WORKER_STALE_MS`.

`knowledge:indexing-worker` continuously indexes approved, source-linked knowledge cards into active search documents for AI Ask retrieval. Use `--once` to backfill the next batch locally/debug. Tune polling with `KNOWLEDGE_INDEXING_WORKER_POLL_MS` and batch size with `KNOWLEDGE_INDEXING_WORKER_BATCH_SIZE`.

## Public launch safety

Before public user onboarding, verify each environment separately:

- `APP_ENV` is set to `local`, `staging`, or `production`; staging and production do not share databases, OAuth clients, provider keys, or secret stores.
- Production `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_URL`, `AI_GATEWAY_BASE_URL`, `AI_GATEWAY_API_KEY`, and `TAVILY_API_KEY` are real values, not `.env.example` placeholders.
- Production database URLs do not point to localhost or a shared development database.
- Google OAuth callback URLs are configured for the deployed host, including `/api/auth/callback/google`.
- At least one initial admin/operator user role is created in PostgreSQL before operator workflows are needed.
- AI Gateway, search provider, and any model/provider privacy settings are checked so project data is not used for provider training where configurable.
- PostgreSQL backup and restore expectations are documented for the chosen hosted database, including who can restore and how restore is verified.
- Local bypasses or development-only shortcuts are not enabled in production defaults.
