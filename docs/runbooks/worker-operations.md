# Worker Operations Runbook

## Admission And Health

Run the migration release job before routing traffic or starting `pnpm worker`. It records the sole authoritative `release_schema_versions` row after Drizzle migrations succeed. Web, API, and Worker readiness require that one canonical version to be inside the workload's declared compatibility range.

- `GET /health/live` proves only that the Worker process runs.
- `GET /health/ready` requires configuration, PostgreSQL, schema compatibility, and all four loop states. It returns only safe reasons, including `schema_incompatible`.
- A schema-incompatible Worker does not admit future polls. Already admitted work follows its existing persisted lease and recovery protocol.

## Safe Telemetry

Events contain only these keys: `correlationId`, `capability`, `principalClass`, `resultCode`, `latencyMs`, and where applicable `durableId`, `jobLagMs`, `retryCount`, `leaseRecovery`, `leaseRecoveryCount`, or `providerRequestId`. Worker events may expose only an existing job, card, command, or outbox ID. Requests and synchronous provider events retain the accepted request ID; each Worker lifecycle or poll event uses a new UUID. `jobLagMs` is a bounded age derived from the durable record timestamp, not a clock or queue estimate.

Never emit database URLs, credentials, cookies, headers, SQL, prompts, answers, source material, image data, fencing tokens, or raw provider payloads. A telemetry sink failure must never affect acknowledgement, retry, terminal failure, or command results.

## Dashboard And Alerts

Use these JSON-log panel definitions in the deployed query backend (replace `{service="xuyenviet-worker"}` with the deployment selector):

```logql
# Worker readiness / schema denial count, 5m
sum by (resultCode) (count_over_time({service="xuyenviet-worker"} | json | capability="worker.schema" [5m]))
# P95 poll lag, 15m, by feature capability
quantile_over_time(0.95, {service="xuyenviet-worker"} | json | capability=~"knowledge\\.(extraction|ingestion|indexing)|ai_ask\\.outbox" | unwrap jobLagMs [15m]) by (capability)
# Retry and recovered lease totals, 15m
sum by (capability) (sum_over_time({service="xuyenviet-worker"} | json | unwrap retryCount [15m]))
sum by (capability) (sum_over_time({service="xuyenviet-worker"} | json | unwrap leaseRecoveryCount [15m]))
# Poll outcomes and duplicate-poller contention, 15m
sum by (capability, resultCode) (count_over_time({service="xuyenviet-worker"} | json | capability=~"knowledge\\.(extraction|ingestion|indexing)|ai_ask\\.outbox" [15m]))
```

Alert on sustained `schema_incompatible`, `database_unavailable`, `loop_failed`, rising lag, rising retries, or repeated recovery/contended outcomes.

For duplicate-poller symptoms, inspect the second poll's `no_work` or `contended` result together with the first durable lease; `SKIP LOCKED` intentionally reports an already-claimed row as no-work rather than exposing a lock holder. Do not add a second continuous Worker. For a controlled restart, verify ready, send `SIGTERM` or `SIGINT`, observe draining, wait for exit, and verify the replacement becomes ready. For lease expiry, allow feature-owned stale recovery to reclaim the durable record; never manually acknowledge or alter fences.

Before retiring a legacy loop, retain evidence of stable lag, retry behavior, duplicate-poller contention, controlled restart/drain, and lease-expiry recovery. This repository provides local proof only; Epic 14 owns deployed dashboards, alert routing, on-call, Railway evidence, and final legacy retirement.

```sh
DATABASE_URL_TEST=... pnpm vitest run tests/schema-compatibility.test.ts tests/web-schema-compatibility.test.ts tests/operational-telemetry.test.ts tests/worker-runtime.test.ts tests/worker-adapter-boundary.test.ts tests/knowledge-extraction-worker.test.ts tests/knowledge-ingestion-jobs.test.ts tests/knowledge-indexing-worker.test.ts tests/domain-outbox.test.ts tests/trip-proposal-expiry-worker.test.ts tests/api-platform-contract.test.ts tests/ai-ask-bff-api.integration.test.ts --maxWorkers=1 --no-file-parallelism
```

Repository evidence, recorded 2026-07-31: the serial `DATABASE_URL_TEST` matrix completed with 12 files and 108 tests, including compiled duplicate-poller `SKIP LOCKED` evidence, persisted retry/lag, drain/no-new-claim, and lease recovery. This is local repository proof only. Retain the release command output with the release record; deployed panel and alert evidence remains Epic 14 work.
