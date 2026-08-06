# Epic 12 Context: Operable Worker and Migration Runtime

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Establish a separately deployable worker and migration runtime that executes durable background work safely and observably, so request-serving processes never claim jobs and deploys run required forward migrations before dependent workloads start.

## Stories

- Story 12.1: Bootstrap the Dedicated Worker and Bounded Sweep Runtime
- Story 12.2: Verify Worker Operations and Telemetry
- Story 12.3: Superseded schema-matrix gate

## Requirements & Constraints

- Continuous background work must run only in the dedicated worker service. Scheduled maintenance must run only as explicit, bounded `--once` commands; it must not become a persistent loop or use in-memory coordination.
- Workers must preserve the established PostgreSQL job protocols: transactional claiming, `FOR UPDATE SKIP LOCKED` where applicable, persisted leases and fencing tokens, expected-version compare-and-swap, and idempotency. Stale or duplicate workers must not apply a later write.
- Each independently deployed API, worker, traveler web, operator app, and migration workload needs least-privilege configuration and distinct liveness/readiness health contracts. Private web/admin-to-API and database traffic use isolated environment credentials and infrastructure.
- Liveness proves the process can run. Readiness proves assigned configuration, database, and critical dependencies are valid; worker readiness additionally proves its loop state. On shutdown, workers stop taking new claims and safely complete or release in-flight work through persisted lease rules.
- Propagate correlation IDs across BFF, API, worker, and provider operations when applicable. Emit safe structured telemetry for capability, principal class, safe result code, latency, job lag, retries, lease recovery, and only safe aggregate identifiers.
- The migration job runs once under its advisory lock and succeeds before dependent workloads receive traffic or work. Runtime readiness and worker admission do not depend on a global schema version, release matrix, or environment policy.
- A legacy worker loop cannot be retired until its replacement has a runbook and operational evidence covering stable lag, retries, lease recovery, duplicate pollers, restarts, and graceful shutdown.
- Clean-break migrations are allowed only when the target data is confirmed disposable and no runtime overlap exists. Durable data changes use forward migrations; any required old-data compatibility is implemented and tested in the owning migration/domain path. Rollback changes routing or compatible code, never destructively rolls back persisted schema.
- Preserve single-writer ownership during runtime and capability migration. A request routes to exactly one transport owner; no dual-write may affect messages, provenance, usage, trip state, knowledge state, or another aggregate.

## Technical Decisions

- The system remains one modular-monolith data plane: NestJS supplies API and worker bootstraps, while Next.js supplies presentation/BFF runtimes. API and worker code may import only extracted workspace packages and must not depend on Next.js, Auth.js, `server-only`, or server-action modules.
- PostgreSQL remains the sole product and job data plane, and Drizzle is the sole schema and migration owner. Persistent tables and indexes are introduced through reviewed migrations.
- Railway deploys `web`, `admin`, `api`, `worker`, and a one-shot migration release job as independently gated workloads with separate build/start commands, health contracts, and least-privilege secrets.
- Durable asynchronous work is represented by versioned, bounded transactional-outbox records with deterministic dedupe, expected owner fence, retry/lease/fencing state, and safe terminal failure codes. The dedicated worker claims and acknowledges these records transactionally; consumers validate the owner fence before every write.
- Worker entrypoints are adapters only: domain use cases own mutations, authorization, and audit behavior. Automated work constructs cataloged system actors directly while preserving any human requester or submitter separately.

## Cross-Story Dependencies

- Story 12.1 establishes the dedicated worker, bounded sweeps, health/readiness, and shutdown behavior required for Story 12.2 operational validation.
- Story 12.2 depends on the worker runtime and validates telemetry and loop-cutover evidence before legacy loops can be retired.
- Story 12.3 is superseded: migration ordering is now enforced by deployment sequencing, Drizzle's applied-migration ledger, and the existing migration advisory lock rather than a runtime compatibility gate.
- Epic 12 follows the API, AI Ask, and planning-context cutovers in Epics 9-11; it provides the runtime and release controls required before Epic 13 operator cutover and Epic 14 public-launch evidence.
