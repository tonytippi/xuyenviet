# Story 6.1 Knowledge Pipeline Operational Validation Report

**Validation timestamp (UTC):** 2026-07-24T18:29:00Z
**Environment:** repository-controlled test environment and deployment-configuration review only
**Overall operational disposition:** `blocked` - **not ready for public evaluation**
**Owner review:** pending. This ledger is evidence for Story 6.2 aggregation, not a public-MVP go/no-go.

## Evidence Handling

- Evidence references below identify only repository paths, test commands, safe service names, revisions, and check IDs.
- This report contains no source/capture text, evidence quotes, URLs, provider payloads, credentials, traveler identities, chat/trip content, browser-profile data, or secret-bearing configuration values.
- Missing, unavailable, partial, stale, or unrepeatable operational proof is `blocked`. Passing repository regression does not substitute for deployment, provider, privacy, or recovery evidence.

## Evidence Ledger

| Check ID | Scope / environment | UTC timestamp | Safe evidence reference | Observed result | Owner | Disposition | Exact blocker | Safe remediation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OP-01 Canonical runtime supervision | Deployment configuration review | 2026-07-24T18:29:00Z | `compose.yaml`; `README.md`; `docs/facebook-capture-operations.md`; revision `dce526a` | Compose restarts `knowledge-extractor` and `knowledge-indexing`; canonical `knowledge-ingestion-worker` is not a Compose service, and its script processes one job then exits. No deployed identity, revision attestation, supervisor log, or restart exercise was supplied. | Tony | `blocked` | Canonical ingestion is neither evidenced as continuously deployed nor separately supervised. Legacy extraction supervision is not canonical ingestion proof. | Deploy and continuously supervise canonical ingestion separately; record service identity, revision, restart policy, safe log reference, health evidence, and controlled non-production restart exercise. |
| OP-02 Ingestion recovery and fencing | `DATABASE_URL_TEST` repository regression | 2026-07-24T18:29:00Z | `pnpm test:run tests/knowledge-ingestion-jobs.test.ts` (14 passed); `pnpm test:run tests/knowledge-ingestion-pipeline.test.ts` (37 passed) | Repository tests pass for claims, retries, checkpoints, expired leases, and stale-fence protections. No controlled deployed synthetic-fixture execution, worker log, or supervisor recovery proof was supplied. | Amelia | `blocked` | Required controlled non-production operational exercise is absent and cannot be inferred from tests. | Run supported synthetic fixture through retry, expired-lease recovery, checkpoint preservation, exhausted safe failure, and stale-worker rejection; attach safe identifiers/statuses only. |
| OP-03 Index safety and traveler fail-closed retrieval | `DATABASE_URL_TEST` repository regression | 2026-07-24T18:29:00Z | `pnpm test:run tests/knowledge-indexing-worker.test.ts` (5 passed); `pnpm test:run tests/knowledge-search.test.ts` (42 passed); `pnpm test:run tests/answer-context.test.ts` (92 passed) | Repository tests pass for idempotent projection work, disabling ineligible projections, and eligibility-aware traveler retrieval. No controlled deployed rebuild/disable/stale-work exercise was supplied. | Amelia | `blocked` | Required operational fixture evidence for production-like indexing and retrieval recheck is absent. | Run supported non-production fixture through queue, idempotent rebuild, withdrawal/suppression, transactional disable, dirty work, stale-work resistance, and traveler-safe bundle rendering; retain identifiers/statuses only. |
| OP-04 Protected operations and audit integrity | `DATABASE_URL_TEST` repository regression | 2026-07-24T18:29:00Z | `pnpm test:run tests/knowledge-source-removal-action.test.ts` (2 passed); `pnpm test:run tests/knowledge-source-removal.test.ts` (5 passed) | New entrypoint regression proves anonymous and traveler sessions fail before removal and an authorized operator actor is forwarded. Removal regression proves idempotent removal, evidence removal, projection disablement, dirty work, and concise audit creation. Representative deployed audit inspection and authorized operations-evidence access proof were not supplied. | Amelia | `blocked` | No deployment audit sample review or role-gated operations-evidence access proof is available. | Inspect representative non-production pipeline, removal, retention, and indexing audit records with authorized and unauthorized roles; record audit IDs, transition codes, and pass/fail only. |
| OP-05 Environment separation and restore readiness | Deployment / provider evidence | 2026-07-24T18:29:00Z | `README.md` launch-prerequisite documentation; no external attestation supplied | Repository documentation requires separate environments and two database archives. It does not prove actual distinct databases, OAuth clients, provider keys, secret stores, backup schedules, encryption, restore authority, application-database restore, capture-archive restore, or replay. | Tony | `blocked` | Current authoritative deployment evidence is missing for environment separation and both application and capture-archive backup/restore paths. | Provide current safe attestation references for each environment separation control, provider-specific backup schedule and retention, restore authority, encrypted backup, tested application database restore, and tested capture-archive restore/replay. |
| OP-06 Provider processing and privacy notice | Provider / privacy evidence | 2026-07-24T18:29:00Z | `README.md` launch-prerequisite documentation; no external attestation supplied | Repository guidance requires approved no-training/data-processing settings and a current privacy notice. No safe provider configuration identifier, approval attestation, or privacy-notice currency evidence was supplied. | Tony | `blocked` | No verifiable current external proof exists for every configured AI/search provider or the applicable public privacy notice. | Record provider/configuration identifiers and privacy-attestation references only; verify each configured provider's approved data-processing/no-training setting and privacy notice currency. |
| OP-07 Capture boundary and scheduled actor | Repository configuration and script review | 2026-07-24T18:29:00Z | `scripts/facebook-capture.ts`; `tests/facebook-capture-script.test.ts` (3 passed); `docs/facebook-capture-operations.md` | Capture is documented as operator-controlled and tests cover visible-DOM selection and safety stops. `--yes` actor resolution verifies only matching user ID/email; it does not enforce persisted `admin` or `operator` role before persistence. No live controlled confirmation or decline exercise was supplied. | Amelia | `blocked` | Safety-blocking role enforcement is absent for scheduled `--yes`; a matching non-privileged user can satisfy the current actor lookup. | Plan a separate hardening story to enforce persisted `admin`/`operator` authorization before capture persistence, add regression coverage for rejection and authorized scheduled actor, then run controlled confirmation/decline evidence. |
| OP-08 Retention and removal | `DATABASE_URL_TEST` repository regression | 2026-07-24T18:29:00Z | `pnpm test:run tests/knowledge-source-capture-retention.test.ts` (7 passed); `pnpm test:run tests/knowledge-source-removal.test.ts` (5 passed) | Repository tests pass for 179/180-day selection, dependency blocking, authorized retention, tombstoning, current-pointer clearing, idempotence, retryable removal, re-evaluation, projection disablement, and dirty indexing work. Controlled execute is not permitted before restore evidence; no operational dry-run or execute evidence was supplied. | Amelia | `blocked` | Required authorized non-production dry-run/controlled tombstone and source-withdrawal evidence is absent; restore prerequisite is also blocked in OP-05. | After OP-05 is complete, run authorized retention dry-run and approved controlled execute against supported fixtures; record identifiers, eligibility/statuses, dependency disposition, and restore reference only. |
| OP-09 Traveler non-exposure | `DATABASE_URL_TEST` repository regression | 2026-07-24T18:29:00Z | `pnpm test:run tests/ai-ask-shell.test.ts` (79 passed); `pnpm test:run tests/knowledge-search.test.ts` (42 passed); `pnpm test:run tests/answer-context.test.ts` (92 passed) | Repository regressions pass for persisted trust rendering and exclusion of raw/operator-only capture material from traveler surfaces. No controlled deployed before/after retention or removal rendering evidence was supplied. | Amelia | `blocked` | Required operational proof across deployed retrieval and persisted trust surfaces before and after retention/removal is unavailable. | Run safe fixture rendering/retrieval verification before and after retention/removal; capture only expected exclusion statuses and approved safe projection identifiers. |

## Repository Regression Record

The following sequential commands passed against `DATABASE_URL_TEST` during this validation. They are repository-behavior evidence only:

1. `pnpm test:run tests/knowledge-ingestion-jobs.test.ts` - 14 passed
2. `pnpm test:run tests/knowledge-ingestion-pipeline.test.ts` - 37 passed
3. `pnpm test:run tests/knowledge-indexing-worker.test.ts` - 5 passed
4. `pnpm test:run tests/knowledge-source-removal.test.ts` - 5 passed
5. `pnpm test:run tests/knowledge-source-capture-retention.test.ts` - 7 passed
6. `pnpm test:run tests/knowledge-search.test.ts` - 42 passed
7. `pnpm test:run tests/answer-context.test.ts` - 92 passed
8. `pnpm test:run tests/knowledge-source-removal-action.test.ts` - 2 passed
9. `pnpm test:run tests/ai-ask-shell.test.ts` - 79 passed
10. `pnpm test:run tests/facebook-capture-script.test.ts` - 3 passed

All commands emitted the existing Vite `vite-tsconfig-paths` deprecation warning and PostgreSQL migration idempotence notices; neither affected the pass result.

## Quality Check Record

1. `pnpm lint` - passed with three existing unused-variable warnings in `tests/knowledge-search.test.ts`.
2. `pnpm typecheck` - passed when run sequentially after build. An earlier concurrent invocation failed only because build regenerated `.next/types`; it was rerun after build and passed.
3. `pnpm build` - passed.
4. `pnpm test:run` - passed: 50 files and 746 tests.

## Disposition and Handoff

- Story 6.1 is operationally **not ready**. Every mandatory row remains `blocked`; no accepted risk is recorded.
- The primary safety-blocking repository finding is OP-07: scheduled Facebook `--yes` does not enforce an `admin` or `operator` role. This validation story intentionally does not change that behavior.
- Story 6.2 may aggregate this ledger with corpus, quality, retrieval, provider-readiness, and launch-prerequisite evidence. It must not treat any blocked row as a pass.
