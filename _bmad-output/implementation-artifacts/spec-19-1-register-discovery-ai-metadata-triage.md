---
title: 'Register Discovery AI Metadata Triage'
type: 'feature'
created: '2026-08-10'
status: 'done'
baseline_revision: 'a02dd92'
review_loop_iteration: 0
followup_review_recommended: true
implementation_revision: 'ccdb538'
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-19-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Discovery has safe canonical candidates and enrichment, but no governed, attributable AI metadata assessment to support later deterministic candidate review. A model/provider shortcut would violate the existing AI Gateway, privacy, run-fence, and Discovery-to-Knowledge ownership boundaries.

**Approach:** Add a versioned `youtube_discovery_triage` AI Gateway purpose, a bounded Discovery-owned triage assessment, and a fenced Worker stage after enrichment. Persist only validated score/signal assessments and safe usage attribution; leave recommendations and operator decisions to later stories.

## Boundaries & Constraints

**Always:** Use the existing AI Gateway catalog, completion seam, `writeAiUsageEvent`, system executor `system-youtube-discovery`, Worker lease/deadline/retry behavior, and Discovery guarded persistence. Triage input consists solely of bounded safe candidate/channel metadata, current-run query/policy provenance, and sanitized derived signals. Enforce a stable `(candidate, run, promptVersion)` key, strict closed output shape, and atomic triage/Usage persistence under the active claim. Retain generic Usage events independently while deleting triage records before their candidate graph.

**Block If:** The existing Gateway/Usage or Discovery write seams cannot express required run linkage, selected-model attribution, or atomic fenced persistence without a direct Knowledge-table write, a raw provider payload, a new credential/configuration, or a second migration. Halt and record the architectural evidence.

**Never:** Use Gemini or `youtube:capture`; create Knowledge state; query/link Knowledge tables beyond the existing opaque eligibility port; persist recommendations, explanations, queue rank, operator state, free text, arbitrary JSON, raw comments/source material/prompts/responses/provider data/transcripts/media/cookies/credentials/evidence/traveler data; or start triage when the remaining execution deadline cannot accommodate its bounded timeout.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Valid assessment | Claimed active run, eligible extraction model, schema-valid bounded response | One succeeded triage row with five `0..1` scores, allowed deduplicated signals, model/prompt/run/Usage attribution | No raw request/response is retained |
| No eligible model | Active claim but no active default model with text input and extraction | One `no_eligible_model` failure triage plus Usage with unavailable provider/model and null model/pricing | No Gateway call or success assessment |
| Gateway or invalid output | Selected model returns failure, malformed/unknown/free-text/duplicate/oversized/non-finite output | Empty `gateway_failed` or `invalid_output` triage with safe selected-model Usage attribution | Existing bounded run retry/terminal policy applies |
| Retry or fence loss | Successful invocation key exists, or policy/proposal/lease changes before/after call | Existing success skips provider; cancelled writes only existing terminal audit; contended writes nothing | Discard in-memory response and never create Knowledge state |
| Candidate retention | Expired candidate graph | Triage deletes before candidate; unrelated generic Usage remains | No unrelated row deletion |

</intent-contract>

## Code Map

- `packages/database/src/schema.ts` -- governed model vocabulary, Usage/run linkage, and Discovery-owned triage table.
- `drizzle/migrations/0054_*.sql` and `drizzle/migrations/meta/_journal.json` -- single forward schema migration after `0053`.
- `packages/database/src/models.ts` and `packages/database/src/index.ts` -- active model selection and default-model capability validation.
- `packages/database/src/usage-constants.ts`, `packages/database/src/usage.ts`, and `packages/database/src/gateway.ts` -- shared prompt/usage vocabulary, sole Usage writer, and non-streaming Gateway completion seam.
- `packages/database/src/youtube-discovery/index.ts` -- bounded bundle reader, successful invocation lookup, public pre-call fence, transactional guarded writer, and retention ordering.
- `packages/worker-domain/src/features/youtube-discovery/execution.ts` -- finite post-enrichment triage stage and DB-free injectable completion seam.
- `apps/worker/src/adapters.ts` -- existing Worker composition only; no Discovery-specific credential.
- `tests/youtube-discovery-triage.test.ts` and `tests/youtube-discovery-triage.integration.test.ts` -- contract, privacy, fencing, idempotency, persistence, and retention coverage.

## Tasks & Acceptance

**Execution:**
- [x] `packages/database/src/schema.ts`, `drizzle/migrations/0054_*.sql`, `drizzle/migrations/meta/_journal.json` -- add the triage purpose, run-linked safe Usage attribution, and constrained `youtube_discovery_triages` schema in exactly one forward migration -- database constraints must match the contract.
- [x] `packages/database/src/models.ts`, `packages/database/src/index.ts`, `packages/database/src/usage-constants.ts`, `packages/database/src/usage.ts`, `packages/database/src/gateway.ts` -- require text-input/extraction model capability, establish versioned purpose/prompt vocabulary, and support safe selected/no-model attribution through existing boundaries -- preserve governed model and Usage ownership.
- [x] `packages/database/src/youtube-discovery/index.ts` -- add safe current-run bundle/read/fence/idempotency/write operations and triage-first retention -- preserve lease/policy/proposal guards and Discovery isolation.
- [x] `packages/worker-domain/src/features/youtube-discovery/execution.ts` -- invoke bounded triage after enrichment with abort/deadline/fence/retry behavior and injectable completion -- provider work remains outside transactions and no new Worker capability is created.
- [x] `tests/youtube-discovery-triage.test.ts`, `tests/youtube-discovery-triage.integration.test.ts`, and relevant existing Discovery/Usage/ownership suites -- verify every matrix scenario, forbidden-data absence, model/admin constraints, atomic rollback, terminal audit behavior, and no Knowledge access -- prove privacy and operational safety.

**Acceptance Criteria:**
- Given Discovery triage selects a model, when the catalog and Usage contract are evaluated, then only an active default model supporting text input and extraction is valid and every attempt is attributed to `youtube_discovery_triage`, `youtube_discovery_triage_v1`, `system-youtube-discovery`, and its Discovery run.
- Given a Gateway response, when triage persists it, then only the five finite bounded scores and bounded deduplicated input-derived signal codes may exist on a successful row; all failure rows have no assessment values and no response can create a recommendation or Knowledge state.
- Given retry, revocation, contention, deadline exhaustion, or retention, when triage operates, then successful calls are idempotent, invalid/fenced work cannot persist, run/audit policy remains correct, and triage deletes before candidates without deleting generic Usage.

## Spec Change Log

## Review Triage Log

### 2026-08-10 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4 (high 2, medium 2, low 0)
- defer: 0
- reject: 0
- addressed_findings:
  - `[high] [patch]` Rejected empty signal arrays before persistence, so parser and database successful-assessment contracts agree.
  - `[high] [patch]` Added a bounded triage timeout and outer-deadline admission check, preventing a Gateway call when the finite run cannot accommodate it.
  - `[medium] [patch]` Verified the candidate appearance belongs to the active claimed run before Usage or triage persistence.
  - `[medium] [patch]` Validated succeeded persistence input at runtime and normalized malformed hostile success input to a safe `invalid_output` failure.

## Design Notes

The model is an untrusted metadata assessor, not a decision maker. The stable success key suppresses duplicate provider work; failures follow the existing claimed-run retry policy. The pre-call fence avoids unnecessary provider work after cancellation, while the guarded transactional writer makes a post-call loss harmless.

## Verification

**Commands:**
- `pnpm exec vitest run --project unit tests/youtube-discovery-triage.test.ts tests/youtube-discovery-ownership.test.ts tests/ai-usage-events.test.ts` -- bounded parsing, privacy, attribution, and no-provider failure behavior pass without database configuration.
- `pnpm exec vitest run --project integration tests/youtube-discovery-triage.integration.test.ts tests/youtube-discovery-enrichment.integration.test.ts tests/youtube-discovery-execution.integration.test.ts` -- serial PostgreSQL persistence, fencing, idempotency, retention, and audit behavior pass with local test reset.
- `pnpm lint` -- lint passes.
- `pnpm typecheck` -- strict TypeScript passes.
- `pnpm build` -- production build passes.
- `git diff --check` -- no whitespace errors.

## Auto Run Result

- Summary: Registered governed `youtube_discovery_triage` metadata assessment with strict bounded storage, safe Usage attribution, run fencing/idempotency, and finite Worker execution after enrichment.
- Files changed: model/Usage vocabulary and catalog validation, one forward `0054` Drizzle migration, Discovery triage repository and retention path, Worker Gateway seam, and focused unit/integration regressions.
- Review: 4 in-scope patches were applied; no items were deferred or rejected.
- Verification: `pnpm exec drizzle-kit migrate`; focused unit tests (11); focused integration tests (43); `pnpm lint` (0 errors, 45 existing warnings); `pnpm typecheck`; `pnpm build`; and `git diff --check` passed.
- Residual risk: A configured active AI Gateway model and Worker runtime credentials are required to exercise provider calls in a deployed environment; no provider call was made during verification.
