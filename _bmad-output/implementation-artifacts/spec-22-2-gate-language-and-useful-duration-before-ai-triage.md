---
title: 'Story 22.2: Chặn ngôn ngữ và thời lượng hữu ích trước AI triage'
type: 'feature'
created: '2026-08-14'
status: 'done'
baseline_commit: 'fa33a871f867c4638039910a506dece604a98cb0'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-22-context.md'
---

<frozen-after-approval reason="human-owned intent - do not modify unless human renegotiates">

## Intent

**Problem:** Candidate job hiện gọi channel enrichment, comment collection và AI triage trước khi có thể kết luận video có đủ thời lượng và phù hợp với người dùng Việt hay không. Điều này làm tốn downstream work và có thể đưa nội dung không đủ điều kiện vào luồng primary.

**Approach:** Với các run chính sách mới, đọc metadata video bounded trước, phân loại ngôn ngữ và duration bằng policy versioned, lưu quyết định an toàn theo appearance/run, rồi chỉ tiếp tục channel/comments/AI cho candidate primary-eligible. Sau khi các candidate của cùng run/query đã được phân loại, một finalization có fence chỉ đánh dấu foreign fallback khi không tồn tại candidate Vietnamese-qualified cùng normalized need; fallback không bao giờ vào primary ranking.

## Boundaries & Constraints

**Always:** Exact duration từ `contentDetails` là authoritative; ngưỡng policy khởi tạo là 180 giây. `languageFit` chỉ là `vi | likely_vi | unknown | non_vi`; metadata Vietnamese/audio Vietnamese rõ ràng ưu tiên, audio non-Vietnamese rõ ràng loại primary, còn lại classifier tất định có version chỉ dùng title/description/tags bounded. Persist dữ liệu/provenance mới trên appearance run-specific và policy version; không lưu provider payload, raw comments, transcript hay media. Gate failure phải hoàn tất candidate job qua lease/fence/audit hiện hữu nhưng không gọi channel/comments/AI, không tạo Usage, triage, score-band recommendation hay primary review. Finalization fallback chỉ đọc/classify các appearance của chính run/query, chạy sau khi candidate jobs của run terminal và dùng ownership/fence hiện hữu; `unknown` hoặc `non_vi` chỉ được gắn `foreign_fallback` nếu không có peer `vi`/`likely_vi` với exact duration đủ ngưỡng. `vi` hoặc `likely_vi` cùng duration đủ ngưỡng đi theo đúng đường triage/Knowledge hiện hữu.

**Ask First:** Dừng để hỏi nếu cần thêm provider, dependency, credential, biến môi trường, service/queue; thay đổi ngưỡng 180 giây; backfill/mutate dữ liệu Discovery lịch sử; hoặc đưa fallback vào primary ranking/primary review.

**Never:** Không dùng language-detection API/AI. Không coi search tranche `medium`/`long` là duration authoritative. Không thay đổi URL-only, Knowledge intake/manual `youtube:capture`, owner/audit/Usage, retry/fence/retention boundaries. Không reclassify, update hay đọc historical candidates, appearances, recommendations, review states hoặc operator decisions để backfill.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Primary eligible | Vietnamese audio/language or deterministic Vietnamese text; duration `>= 180` | Persist `vi`/`likely_vi`, eligible duration and safe `eligible_vietnamese`, then fetch channel/comments and run current triage flow | Existing fenced retry behavior remains |
| Duration gate | Exact duration `179`, missing, malformed, or out of bounds | Persist `too_short` or `duration_unknown`; complete job before downstream calls | No triage, Usage, recommendation, or review write |
| Language gate | Explicit foreign audio or unresolved bounded metadata/text | Persist `non_vietnamese` or `language_unknown`; complete primary job before downstream calls | No score/popularity/model override |
| Fallback | All candidate jobs for one run/query are terminal, no Vietnamese-qualified peer exists, and policy permits fallback | Fenced finalization marks bounded foreign candidates `foreign_fallback` with distinct provenance | Never interleave with primary ranking or its quality numerator |

</frozen-after-approval>

## Code Map

- `packages/domain/src/youtube-discovery/policy.ts` -- strict policy parser/default and current score policy; add validated duration, language-classifier, and bounded fallback contract plus pure fit evaluation.
- `packages/database/src/schema.ts` -- policy version, run, appearance, and candidate-job owners; appearance is run-specific and avoids rewriting canonical candidates or prior runs.
- `packages/database/src/youtube-discovery/index.ts` -- creates immutable policy snapshots, persists enrichment and controls triage/recommendation bundles; add fenced gate-result persistence plus run/query finalization without a historical scan.
- `packages/database/src/admin-youtube-discovery.ts` -- policy-copy command must retain new fields while enabled state changes create a version.
- `drizzle/migrations/0069_harden_discovery_run_query_snapshot.sql` -- latest numbered migration; add the next forward-only migration with nullable prospective appearance fields and closed database constraints.
- `packages/worker-domain/src/features/youtube-discovery/youtube-enrichment.ts` -- currently calls `videos`, `channels`, then comments in one function; split bounded video metadata from downstream channel/comment enrichment.
- `packages/worker-domain/src/features/youtube-discovery/execution.ts` -- `executeCandidateJob()` currently persists all enrichment then starts triage; insert gate persistence and terminal completion before downstream calls.
- `tests/youtube-discovery-enrichment.test.ts` -- existing bounded adapter test seam for endpoint-order and metadata parsing coverage.
- `tests/youtube-discovery-policy.test.ts` -- policy validation/ranking tests; add deterministic language and 179/180/missing-duration edges.
- `tests/youtube-discovery-enrichment.integration.test.ts`, `tests/youtube-discovery-execution.integration.test.ts`, `tests/youtube-discovery-triage.integration.test.ts` -- serial PostgreSQL evidence for run-scoped persistence, fence/retry behavior, and no downstream artifacts on gate failure.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/youtube-discovery/policy.ts` -- define validated versioned minimum-duration, language-classifier, fallback policy and pure closed-set gate classifier -- makes eligibility deterministic without a new dependency.
- [x] `packages/database/src/schema.ts`, `drizzle/migrations/0070_discovery_vietnamese_eligibility.sql`, `packages/database/src/youtube-discovery/index.ts`, `packages/database/src/admin-youtube-discovery.ts` -- persist policy and run-scoped safe language/duration/reason provenance behind existing fences, then finalise foreign fallback only after the run/query's candidate jobs are terminal; retain fields when policy is copied -- applies only prospectively.
- [x] `packages/worker-domain/src/features/youtube-discovery/youtube-enrichment.ts`, `packages/worker-domain/src/features/youtube-discovery/execution.ts` -- fetch video metadata first, persist gate outcome, terminalize primary failures, and defer channel/comments/AI until admission -- enforces ordering rather than merely filtering recommendations.
- [x] `tests/youtube-discovery-policy.test.ts`, `tests/youtube-discovery-enrichment.test.ts`, `tests/youtube-discovery-enrichment.integration.test.ts`, `tests/youtube-discovery-execution.integration.test.ts`, `tests/youtube-discovery-triage.integration.test.ts` -- prove classifier precedence, duration boundaries, endpoint suppression, no Usage/triage/recommendation writes, fallback finalization/isolation, fences and untouched history.

**Acceptance Criteria:**
- Given a new-policy candidate job receives bounded video metadata, when it is persisted, then applicable policy/query-builder/classifier versions and closed language/duration fits are recorded only on its appearance without provider payload retention.
- Given a failed language or duration gate, when the candidate job finishes, then channel enrichment, comment collection, AI triage, Usage, ranking, primary recommendation and primary review were never invoked.
- Given an eligible Vietnamese-fit video, when it meets exact duration, then the existing fenced downstream candidate-job flow remains authoritative.
- Given all candidate jobs for one new-policy run/query are terminal, when no Vietnamese-qualified peer exists and fallback is permitted, then only bounded foreign candidates are marked `foreign_fallback` with distinct run-scoped provenance and no primary ranking; when a qualified peer exists, none is marked fallback.
- Given mixed language and duration fixtures, when focused tests run, then classification, fallback isolation and no historical mutation are deterministic.

### Review Findings

- [x] [Review][Patch] Upgrade the current policy to classifier version 1 [drizzle/migrations/0070_discovery_vietnamese_eligibility.sql:1]
- [x] [Review][Patch] Snapshot query-builder version with run-scoped eligibility provenance [packages/database/src/youtube-discovery/index.ts:484]
- [x] [Review][Patch] Preserve an existing eligibility/fallback outcome on candidate-job retry [packages/database/src/youtube-discovery/index.ts:484]
- [x] [Review][Patch] Require the claimed candidate job's immutable policy version to remain current [packages/database/src/youtube-discovery/index.ts:668]
- [x] [Review][Patch] Bound all video metadata persisted before eligibility [packages/database/src/youtube-discovery/index.ts:499]
- [x] [Review][Patch] Prove language-rejected candidates suppress downstream worker artifacts [tests/youtube-discovery-execution.integration.test.ts:459]

## Design Notes

`youtube_discovery_appearances` is the persistence boundary because one canonical video may appear in multiple runs governed by distinct immutable policy versions. New nullable fields preserve old appearances exactly; new-policy rows are classified once during their job, rather than by any historical query. Fallback finalization is owned by the existing run/query provenance after all of that run's candidate jobs terminalize, avoiding a concurrent per-job decision that could incorrectly promote foreign content before a Vietnamese peer completes. It remains a distinct outcome, not a relaxed primary gate.

## Verification

**Commands:**
- `pnpm test:unit -- tests/youtube-discovery-policy.test.ts tests/youtube-discovery-enrichment.test.ts` -- expected: deterministic classifier, duration and provider-call-order tests pass without PostgreSQL.
- `pnpm test:integration -- tests/youtube-discovery-enrichment.integration.test.ts tests/youtube-discovery-execution.integration.test.ts tests/youtube-discovery-triage.integration.test.ts` -- expected: serial PostgreSQL gate, fence, downstream-suppression and historical-isolation tests pass.
- `pnpm lint` -- expected: no new ESLint errors.
- `pnpm typecheck` -- expected: strict TypeScript passes.
- `pnpm build` -- expected: production build passes.

## Suggested Review Order

**Gate And Fallback Flow**

- Classifies bounded metadata before downstream processing and finalizes foreign fallback safely.
  [`execution.ts:73`](../../../packages/worker-domain/src/features/youtube-discovery/execution.ts#L73)

- Separates video metadata from channel and comment calls so the gate can stop early.
  [`youtube-enrichment.ts:17`](../../../packages/worker-domain/src/features/youtube-discovery/youtube-enrichment.ts#L17)

- Serializes run-local fallback decisions only after all candidate jobs terminalize.
  [`index.ts:328`](../../../packages/database/src/youtube-discovery/index.ts#L328)

**Policy And Persistence**

- Defines deterministic language precedence, duration eligibility, and legacy policy compatibility.
  [`policy.ts:68`](../../../packages/domain/src/youtube-discovery/policy.ts#L68)

- Persists run-scoped eligibility with existing candidate-job fences.
  [`index.ts:484`](../../../packages/database/src/youtube-discovery/index.ts#L484)

- Enforces forward-only policy immutability and closed appearance outcomes in PostgreSQL.
  [`0070_discovery_vietnamese_eligibility.sql:1`](../../../drizzle/migrations/0070_discovery_vietnamese_eligibility.sql#L1)

**Evidence**

- Proves gate suppression, fallback isolation, and concurrent finalization behavior.
  [`youtube-discovery-execution.integration.test.ts:459`](../../../tests/youtube-discovery-execution.integration.test.ts#L459)

- Proves migration constraints and policy-version immutability contract.
  [`youtube-discovery-eligibility-migration.test.ts:1`](../../../tests/youtube-discovery-eligibility-migration.test.ts#L1)
