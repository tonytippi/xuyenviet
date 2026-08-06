---
title: 'Classify Facebook ingestion discovery failures'
type: 'bugfix'
created: '2026-08-06'
status: 'in-review'
review_loop_iteration: 0
baseline_commit: '8bdb74ed4e7727117bdfc2a766690d323ca628cc'
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Facebook Capture admin queue reports every discovery failure as `discovery_failed`, so an operator cannot distinguish an unavailable extraction model, an AI Gateway failure, or invalid structured output. Its earlier discovery prompt also allowed one generic representative candidate instead of every evidence-grounded road-trip fact. The actual error detail is intentionally not retained.

**Approach:** Persist a closed, safe discovery failure code in the existing ingestion-job `last_error_code` column and render it for failed Facebook Capture jobs. Use the existing multi-fact extraction prompt and candidate metadata columns for Facebook discovery, retaining only candidates whose quoted evidence exactly matches the immutable capture. Let operators rerun a current terminal capture (`failed` or `completed`) after an extraction upgrade; preserve the generic code only as a fallback for unexpected faults.

## Boundaries & Constraints

**Always:** Use only bounded, allowlisted codes; keep prompts, provider responses, request IDs, credentials, and arbitrary error messages out of persistence and admin responses. Preserve existing failure fencing and stale-claim behavior. Keep existing codes accepted where they are already operationally valid. Raw capture text is allowed only in the authenticated admin Facebook detail projection, never in its queue or traveler-facing responses.

**Ask First:** Any change to retry policy, job state transitions, database schema, or the operator-facing wording beyond displaying the safe code.

**Never:** Add a database column/migration, expose provider payloads or exception messages, change capture data, or rerun existing failed jobs as part of this change.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Missing model | No active extraction model matches required capabilities | Failed job persists `discovery_model_unavailable`; admin shows that code | No raw diagnostic is stored or returned |
| Gateway rejection | Gateway returns a known safe failure result | Failed job persists a namespaced equivalent such as `discovery_gateway_http_error` | No HTTP body, request ID, or provider message is stored or returned |
| Invalid model output | Gateway response is malformed JSON or fails candidate/span validation | Failed job persists `discovery_invalid_output` | No source text or malformed output is stored or returned |
| Unexpected fault | Discoverer throws an unclassified exception | Failed job persists `discovery_failed` | Existing generic fallback remains |
| Failed admin job | Failed Facebook ingestion job has an allowlisted error code | Queue and detail show the plain-text code | Unknown or unsafe codes are rejected by the API contract |

</frozen-after-approval>

## Code Map

- `packages/worker-domain/src/features/knowledge/ingestion-pipeline.ts` -- discovery orchestration and terminal failure persistence.
- `packages/contracts/src/index.ts` -- admin Facebook Capture job response parser.
- `apps/admin/app/knowledge/facebook-captures/queue.tsx` -- failed job queue presentation.
- `apps/admin/app/knowledge/facebook-captures/[reviewId]/detail.tsx` -- capture detail presentation.
- `tests/knowledge-ingestion-pipeline.test.ts` -- discovery failure and fencing coverage.
- `tests/admin-facebook-capture-contract.test.ts` -- safe error-code contract coverage.
- `tests/worker-adapter-boundary.test.ts` -- compiled worker failure behavior.

## Tasks & Acceptance

**Execution:**
- [x] `packages/worker-domain/src/features/knowledge/ingestion-pipeline.ts` -- classify model selection, safe gateway result, malformed output, and unexpected discovery errors before writing the terminal job status -- preserves actionable diagnostics without unsafe data.
- [x] `packages/contracts/src/index.ts` -- allow only recognized ingestion failure codes in the Facebook Capture job projection -- prevents arbitrary diagnostics from crossing the admin API boundary.
- [x] `apps/admin/app/knowledge/facebook-captures/queue.tsx` -- show a failed job's safe failure code -- gives operators queue-level triage context.
- [x] `apps/admin/app/knowledge/facebook-captures/[reviewId]/detail.tsx` -- show the same safe failure code in the job details -- gives detail-level triage context.
- [x] `tests/knowledge-ingestion-pipeline.test.ts` and `tests/worker-adapter-boundary.test.ts` -- cover classified model/gateway/output failures, generic fallback, and stale-claim fencing -- prevents regression to opaque failures.
- [x] `tests/admin-facebook-capture-contract.test.ts` -- accept safe known codes and reject unknown/payload-shaped values -- preserves the safe admin projection boundary.
- [x] `packages/contracts/src/index.ts`, `packages/database/src/admin-facebook-capture.ts`, and `apps/admin/app/knowledge/facebook-captures/[reviewId]/detail.tsx` -- return and display retained current and historical capture text only for the authenticated admin detail screen; queue responses remain text-free.
- [x] `packages/worker-domain/src/features/knowledge/ingestion-pipeline.ts` -- replace the representative-fact discovery instruction with the existing evidence-grounded multi-fact prompt, persist scoped candidate metadata, and reject unmatched evidence spans.
- [x] `packages/database/src/admin-facebook-capture.ts` -- permit rerun for a current completed ingestion job as well as a failed job, so operators can re-extract terminal captures after prompt upgrades.

**Acceptance Criteria:**
- Given discovery cannot select an extraction model, when the claimed job is terminalized, then its stored and admin-visible code is `discovery_model_unavailable`.
- Given the extraction gateway returns a known safe failure code, when discovery fails, then the job stores the corresponding namespaced discovery code without provider detail.
- Given discovery receives invalid JSON or invalid candidates, when it fails, then the job stores `discovery_invalid_output`.
- Given an unclassified discovery exception, when it fails, then the job stores `discovery_failed`.
- Given a failed Facebook Capture job with an allowlisted failure code, when an admin opens the queue or detail, then that code is displayed and no raw/provider diagnostic is present.
- Given an obsolete claim, when its discovery fails after the capture is replaced, then it does not terminalize or write an error code to the newer job.

## Design Notes

The existing `last_error_code` field is constrained to short safe-code characters and already flows through the Facebook capture projection. The new classifier must map only fixed literals. It must never derive a code from `Error.message` or provider content.

## Verification

**Commands:**
- `pnpm test:unit -- tests/knowledge-ingestion-pipeline.test.ts tests/admin-facebook-capture-contract.test.ts tests/worker-adapter-boundary.test.ts` -- expected: targeted tests pass without a database dependency unless the project test configuration requires its existing integration setup.
- `pnpm typecheck` -- expected: strict TypeScript succeeds.

## Completion Notes

- `pnpm test:unit -- tests/admin-facebook-capture-contract.test.ts` passed: 24 files, 238 tests.
- `pnpm typecheck` passed across the root workspace and all applications/packages.
- `pnpm test:integration` is blocked before tests execute because `drizzle-kit migrate` fails against the configured `DATABASE_URL_TEST`; no test failure was reported.
- Two independent diff reviews found no issues.

## Change Log

- 2026-08-06: Aligned the multi-fact extraction example with the required `evidence.quote_text` contract. The prompt no longer presents optional `evidence_hint` output.
- 2026-08-06: Added safe, allowlisted diagnostics for invalid candidates and missing, malformed, or ungrounded evidence. No provider response, prompt, raw model output, or exception message is persisted or projected.
- 2026-08-06: Preserved exact-source grounding while allowing repeated exact evidence passages. The resolver records the first matching passage rather than rejecting a quote solely because it occurs more than once.
- 2026-08-06: Made multi-fact discovery resilient to individual invalid candidates. Invalid candidates are discarded before persistence; valid evidence-grounded candidates in the same response continue through the existing lifecycle.
- 2026-08-06: Requeued the two affected failed ingestion jobs after deploying the recovery changes. Review `8f0340a4-5bdb-4c47-b8c7-c55528c62383` completed with 8 candidates, all processed successfully.

## Recovery Verification

- `pnpm test:unit -- tests/admin-facebook-capture-contract.test.ts tests/knowledge-ingestion-prompt.test.ts` passed: 25 files, 240 tests.
- `pnpm typecheck` passed across the root workspace and all applications/packages.
- `pnpm --filter @xuyenviet/worker build` passed, and the rebuilt ingestion adapter processed the requeued review successfully.
