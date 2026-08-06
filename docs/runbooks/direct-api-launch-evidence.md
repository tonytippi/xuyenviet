# Direct API Launch Evidence Gate

This is the canonical fail-closed execution record for a public direct-API launch. It is not infrastructure configuration, an approval substitute, or proof that a deployment occurred. Repository checks are repository-only evidence and cannot approve a public launch.

## Status And Record Rules

Every platform gate starts `BLOCKED`. Mark a gate `PASSED` only after its required proof was executed in the named environment by its accountable role and the complete safe evidence record is retained. Missing, stale, unverifiable, or secret-bearing evidence leaves the gate `BLOCKED`.

Use one record per gate and environment with only these safe fields:

| Field | Required value |
| --- | --- |
| Gate ID and environment | Stable gate ID and `staging` or `production` |
| Status | `BLOCKED` or `PASSED` |
| Accountable role | Release operator, API owner, database operator, Worker operator, or incident commander as named below |
| Deployed revision | Immutable revision or release identifier |
| Timestamp | UTC execution time |
| Safe evidence reference | Redacted log/query/export location or ticket URL |
| Safe outcome | Redacted result, measured value where required, and correlation/request ID when applicable |

Never record cookies, OAuth codes or tokens, CSRF proofs, credentials, database URLs, raw provider payloads, or unredacted request headers in this runbook or its evidence references. Store sensitive operational material only in the approved secret-safe system.

## Required Platform Gates

All entries below are currently `BLOCKED` because platform execution evidence has not been supplied. A local test, source inspection, or integration result may be linked as repository-only context, but cannot change a platform gate to `PASSED`.

| Gate ID | Default platform status | Accountable role | Execute in staging, then production | Pass only when | Block / no-go when |
| --- | --- | --- | --- | --- | --- |
| `GATE-INGRESS-TOPOLOGY` | `BLOCKED` | Release operator | Verify the selected public topology routes browser `/v1/*` and `/auth/*` traffic only to the deployed NestJS API revision; retain redacted probe outcomes and request IDs. | Both origins reach the selected deployed API revision and no legacy/BFF owner receives direct-browser traffic. | Selected topology, target, revision, or safe probes are absent; any legacy/BFF route remains live. |
| `GATE-OAUTH-SESSION-ORIGIN-CSRF` | `BLOCKED` | API owner | Run approved login, authenticated protected-read, logout, allowed-origin command, denied-origin command, and invalid-CSRF smoke checks against the deployed revision. | Opaque browser sessions admit only valid current principals; allowed origins and valid CSRF succeed; denied or invalid requests fail safely. | OAuth/session/origin/CSRF smoke is missing, unsafe, or not tied to the deployed revision. |
| `GATE-MIGRATION-WRITER` | `BLOCKED` | Database operator | Before dependent traffic, run the forward Drizzle migration under the target advisory lock and retain the safe command outcome. | The intended migration completed before dependent traffic, the selected writer is recorded, and no down migration or dual write is proposed. | Migration order, selected writer, or safe migration outcome is missing; a down migration or dual write is proposed. |
| `GATE-LEGACY-RETIREMENT` | `BLOCKED` | Release operator | Verify deployed legacy Auth.js, BFF, route-handler, and retired transport owners are not serving traffic after the direct API cutover. | Inventory and redacted probes show no live legacy owner for a migrated capability. | A live legacy owner, fallback, shadow writer, or incomplete inventory is found. |
| `GATE-ROLLBACK-DRILL` | `BLOCKED` | Incident commander | Execute the approved compatible rollback drill without a down migration or destructive cleanup; retain the measured recovery and selected compatible binary revision. | The drill switches traffic to one selected writer, keeps `dualWrite: false`, proves the replaced writer accepts no commands, and restores the compatible service path within its approved threshold while preserving forward-only schema/data constraints. | The drill is unexecuted, exceeds its threshold, requires a down migration, has no safe retained result, leaves more than one writer active, or uses an unapproved fallback. |
| `GATE-API-WORKER-READINESS` | `BLOCKED` | API owner and Worker operator | Verify deployed API health/version/protected capability and Worker live/ready, drain, and replacement readiness. | API and Worker readiness are healthy on the deployed revision; Worker loops are ready and the controlled drain/restart outcome is retained. | Any readiness endpoint, Worker loop, drain, or recovery proof is missing or failing. |
| `GATE-MONITORING-ALERTS` | `BLOCKED` | Worker operator | Verify deployed API and Worker dashboards, alert routes, correlation-safe telemetry, and on-call receipt using a controlled safe signal. | Required panels and alerts are visible, alert delivery is acknowledged, and telemetry contains only approved safe fields. | Dashboard, alert route, on-call acknowledgement, or safe telemetry proof is unavailable. |
| `GATE-BACKUP-RESTORE` | `BLOCKED` | Database operator | Run the approved backup and restore exercise for the production-compatible target and record measured recovery against the approved objective. | Backup integrity and restore recovery meet the approved threshold without exposing database connection material. | The exercise is absent, stale, fails, exceeds its threshold, or retains sensitive connection material. |
| `GATE-AI-STREAM-CONCURRENCY` | `BLOCKED` | API owner | Run controlled concurrent direct AI-stream traffic against the deployed revision; verify ordering, terminal persistence, abort/retry behavior, and capacity threshold. | Measured concurrent streams remain within the approved capacity/error threshold and retain safe correlation IDs and redacted outcomes. | The drill is unexecuted, has no approved threshold, loses terminal/persistence behavior, or exceeds the threshold. |

## Execution Order

1. Select the staging target, accountable release operator, and immutable deployed revision. If any is unavailable, stop with every staging gate `BLOCKED`.
2. Execute `GATE-MIGRATION-WRITER` in staging before routing dependent API, OAuth, browser, or Worker traffic. Record only the safe fields above.
3. Execute the remaining required staging gates in the table order. Resolve failures and rerun the failed staging gate; do not promote its result.
4. Do not execute production gates unless every required staging gate is `PASSED` for the candidate revision or an explicitly approved equivalent release.
5. Select the production target and deployed revision. Reconfirm the migration-before-traffic plan and selected writer before production traffic, then execute `GATE-MIGRATION-WRITER` before every dependent production gate.
6. Execute the remaining required production gates in the table order. Staging success is prerequisite context, not production proof.
7. The incident commander evaluates the complete staging and production records. **Public launch is NO-GO unless every required staging and production gate is `PASSED`.** Any `BLOCKED` gate, missing safe field, missing accountable role, missing deployed revision, missing timestamp, missing safe evidence reference, or missing safe outcome is a public-launch no-go.

## Repository-Only Context

Run `pnpm vitest run --project unit tests/direct-api-launch-evidence.test.ts` to verify this gate's checked-in contract. This verifies documentation structure only. It does not prove deployed ingress, OAuth/session/origin/CSRF behavior, migration ordering, writer selection, legacy retirement, rollback, API/Worker readiness, monitoring, backup/restore, or AI-stream capacity, and it is not public-launch approval.

Use `README.md` for the forward Drizzle migration procedure and `docs/runbooks/worker-operations.md` for Worker readiness, drain, telemetry, and alert controls.
