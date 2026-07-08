---
title: 'Story 4.2: AI Extracts Knowledge Drafts From Source'
type: 'feature'
created: '2026-07-08'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: 'dee7d4eed6448a26d50be3e2eeda85eddf5945ec'
final_revision: 'dee7d4eed6448a26d50be3e2eeda85eddf5945ec-uncommitted'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-1-submit-travel-source-for-ai-reading.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Operators can submit travel sources, but the system cannot yet ask the AI Gateway to convert source material into structured, reviewable knowledge drafts. Without this step, Epic 4 cannot scale curated Hanoi-to-HCMC corridor knowledge while preserving human approval and raw-source privacy.

**Approach:** Add knowledge-owned draft persistence, a protected extraction service/action, prompt instructions, and tests that turn a source plus operator-only raw material into one or more draft knowledge cards linked to the source. The extraction must record AI usage/audit metadata safely, never approve drafts, and fail closed when auth, model capability, provider output, or source material is invalid.

## Boundaries & Constraints

**Always:** Gate extraction server-side to operator/admin roles before validation, model selection, provider calls, usage writes, draft inserts, or audit side effects; load raw source material only inside server-only knowledge code; create only `draft`/review-needed knowledge records linked to normalized `sources`; preserve confidence and freshness-sensitive labels; use the AI Gateway extraction model and prompt version; record provider usage success/failure when a provider call occurs; keep audit summaries and action responses free of raw source text, raw metadata, provider payloads, and screenshot file names.

**Block If:** Extraction requires a real file upload/storage reader for screenshots instead of the metadata-only Story 4.1 path; the current AI Gateway adapter cannot represent the needed request; Drizzle migration generation cannot represent the durable draft/link schema safely.

**Never:** Do not approve, publish, embed, retrieve, or traveler-display extracted drafts; do not mutate existing approved cards; do not call AI for unauthenticated/traveler users, invalid source IDs, or sources without usable text material; do not treat Facebook/community material as official or partner based on model output; do not persist raw provider responses or raw source snippets in safe draft/source/audit fields.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Operator extracts pasted travel text | Operator selects a source with linked raw text and an active text extraction model | AI Gateway is called once, one or more draft knowledge cards are stored as `draft`, each draft links to the source, usage success and safe audit are recorded | No error expected |
| Place review output | Model returns a place-oriented draft with title, type, location/route, summary, practical tips, warnings, cost/parking/kid notes, tags, confidence, freshness flag | Draft stores normalized fields and structured details for later review without approval or retrieval eligibility | Invalid enum/oversized/missing required fields reject the extraction transaction |
| Completed trip output | Model returns multiple route/food/activity/warning/cost drafts from one trip report | Multiple draft cards are stored and all link to the same source as primary support | If every draft is invalid, no drafts are stored and a safe recoverable error is returned |
| Provider failure | Active model exists but the gateway request fails | No drafts are stored; usage failure is recorded with safe error metadata; operator sees a generic recoverable failure | No raw provider payload is exposed or persisted |
| No active capable model | No active/default extraction model supports required text extraction capability | No provider call, no drafts, no usage/audit side effects except safe action failure behavior | Return a safe recoverable model-unavailable error |
| Screenshot-only source | Source has only screenshot/file metadata and no readable raw text/image URL backend | No provider call and no drafts because Story 4.1 stores metadata only | Return a safe recoverable unsupported-material error |
| Unauthorized caller | Traveler or unauthenticated user invokes extraction | Authorization rejects before source lookup, model selection, provider call, usage, draft insert, or audit | Throw existing admin authorization error safely |

</intent-contract>

## Code Map

- `src/db/schema.ts` -- add durable draft knowledge card and card-source link tables/enums/checks/indexes while preserving safe-vs-raw source boundary.
- `drizzle/migrations/` -- generate migration and snapshot metadata for the new draft/link tables.
- `src/features/ai/prompts.ts` -- add strict JSON extraction prompt, purpose, and prompt-version constants for source-to-draft extraction.
- `src/features/ai/gateway.ts` -- existing non-streaming OpenAI-compatible extraction call reused for provider requests.
- `src/features/ai/models.ts` -- existing active model selection reused for extraction capability checks.
- `src/features/usage/events.ts` -- existing AI usage persistence reused for provider success/failure metadata.
- `src/features/knowledge/actions.ts` -- add protected extraction action/form wrapper returning only safe counts and IDs.
- `src/features/knowledge/extraction.ts` -- add server-only extraction orchestration, model output parsing, validation, draft inserts, source linking, usage, and safe audit behavior.
- `src/app/admin/knowledge/intake/page.tsx` -- minimally expose the next extraction step after intake and a source-id extraction form for operators.
- `tests/knowledge-draft-extraction.test.ts` -- cover extraction success, failures, authorization, provider behavior, and safe persistence boundaries.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- move Story 4.2 through implementation statuses.

## Tasks & Acceptance

**Execution:**
- [x] `src/db/schema.ts` -- add knowledge draft card lifecycle fields, card-source linkage, type/confidence/support enums, safe field limits, draft-only defaults, and indexes -- create the durable review queue foundation without retrieval eligibility.
- [x] `drizzle/migrations/` -- generate the schema migration and metadata -- keep Drizzle migration state authoritative.
- [x] `src/features/ai/prompts.ts` -- add source-to-knowledge-draft extraction prompt and version -- make model requests deterministic, structured, and provenance/freshness aware.
- [x] `src/features/knowledge/extraction.ts` -- implement server-only extraction orchestration, source/raw loading, model selection, gateway call, JSON validation, sanitized draft persistence, source linking, usage writes, and safe audit summaries -- keep AI behavior inside the knowledge boundary.
- [x] `src/features/knowledge/actions.ts` -- expose `extractKnowledgeDraftsFromSource` plus a form action that preserves admin authorization semantics and safe recoverable errors -- let admin UI trigger extraction without raw data leakage.
- [x] `src/app/admin/knowledge/intake/page.tsx` -- add an operator extraction form or success follow-up path for a submitted source ID -- make Story 4.2 reachable without building the full Story 4.3 review queue.
- [x] `tests/knowledge-draft-extraction.test.ts` -- cover the I/O matrix, model capability selection, usage/audit behavior, unauthorized denial before side effects, malformed output rollback, and screenshot-only safe failure -- prevent security and workflow regressions.
- [x] `_bmad-output/implementation-artifacts/spec-4-2-ai-extracts-knowledge-drafts-from-source.md` -- update status, task checkboxes, verification, notes, and file list as implementation progresses -- keep BMad artifacts aligned.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- move Story 4.2 to the appropriate terminal status after implementation/review -- keep sprint tracking aligned.

**Acceptance Criteria:**
- Given an operator extracts a source with usable raw text and a capable active extraction model, when the AI Gateway returns valid draft JSON, then the system stores one or more draft knowledge cards linked to the source and records safe usage/audit metadata.
- Given extracted content contains place review or completed trip facts, when drafts are stored, then each draft preserves type, route/location, summary, structured practical details, tags, confidence label, freshness-sensitive flag, and review-needed draft status.
- Given source material is Facebook-derived or copied community content, when the model returns confidence or source claims, then stored drafts remain no higher than community/unverified unless the normalized source already allows a stronger operator-controlled label.
- Given extraction fails because auth, model availability, source material, provider response, or model JSON is invalid, when the action returns or throws, then no approved knowledge, embeddings, retrieval records, raw provider payloads, or raw source leaks are created.
- Given a traveler or unauthenticated user invokes extraction, when authorization runs, then denial happens before validation, model selection, provider calls, usage writes, draft inserts, or audit side effects.

## Spec Change Log

- 2026-07-08: Implemented Story 4.2 draft knowledge extraction persistence, prompt, protected service/actions, minimal admin trigger, migration, and focused tests. No commit created per user instruction.

## Review Triage Log

### 2026-07-08 — Initial implementation inspection
- intent_gap: 0
- bad_spec: 0
- patch: 1: (high 0, medium 1, low 0)
- defer: 0
- reject: 0
- addressed_findings:
  - `[medium]` `[patch]` Successful provider calls with malformed draft JSON initially rejected before usage persistence; moved success usage write ahead of model-output validation so every provider call is recorded while draft/audit persistence still fails closed.

### 2026-07-08 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 5: (high 1, medium 4, low 0)
- defer: 0
- reject: 0
- addressed_findings:
  - `[high]` `[patch]` Added server-side raw-overlap rejection so model output cannot persist long verbatim raw source snippets in safe draft fields.
  - `[medium]` `[patch]` Clamped unverified curated sources to `unverified` confidence unless a stronger operator-controlled verification signal exists.
  - `[medium]` `[patch]` Added a same-source existing-draft guard so double-submit/retry does not create duplicate draft cards or duplicate provider calls.
  - `[medium]` `[patch]` Rejected non-boolean `freshness_sensitive` values instead of silently coercing them to false.
  - `[medium]` `[patch]` Redirected source submission with `sourceId` and prefilled the extraction form so newly submitted sources are reachable from the Story 4.2 UI.

### 2026-07-08 — Follow-up Review Findings
- [x] [Review][Patch] Make same-source duplicate extraction protection atomic before the provider call [`src/features/knowledge/extraction.ts:91`] -- fixed with a transaction-scoped advisory lock covering the active-draft check, provider call, and draft insert.
- [x] [Review][Patch] Tighten raw-source leak protection for short snippets and practical details [`src/features/knowledge/extraction.ts:265`] -- fixed with lower verbatim-overlap threshold and phone/email-like value rejection across safe draft fields.
- [x] [Review][Patch] Block only active review-needed drafts when checking same-source extraction state [`src/features/knowledge/extraction.ts:187`] -- fixed by joining `knowledge_cards` and blocking only `draft` or `needs_review` linked cards.
- [x] [Review][Patch] Require extracted drafts to carry either location or route segment [`src/features/knowledge/extraction.ts:260`] -- fixed by rejecting drafts where both normalized fields are absent.
- [x] [Review][Patch] Add database JSON-shape checks for knowledge card details and tags [`src/db/schema.ts:557`] -- fixed with PostgreSQL `jsonb_typeof` checks and generated migration `0017_tiny_rattler.sql`.

## Design Notes

Story 4.2 intentionally supports raw-text extraction first. Story 4.1 screenshot intake stores metadata only, with no upload or readable image URL; screenshot-only extraction must therefore fail safely until a later story introduces a real storage reader. This still preserves the AI Gateway image-capability boundary for future use without pretending metadata is image content.

## Verification

**Commands:**
- `pnpm db:generate` -- expected: migration generated from the updated Drizzle schema.
- `pnpm test:run tests/knowledge-draft-extraction.test.ts` -- expected: focused Story 4.2 coverage passes.
- `pnpm test:run tests/knowledge-source-intake.test.ts` -- expected: Story 4.1 source/raw boundary remains intact.
- `pnpm lint` -- expected: no ESLint errors.
- `pnpm typecheck` -- expected: TypeScript strict checks pass.
- `pnpm test:run` -- expected: full Vitest suite passes.
- `pnpm build` -- expected: production build succeeds.

**Results:**
- `pnpm db:generate` -- passed; generated `drizzle/migrations/0016_robust_zemo.sql` and `drizzle/migrations/meta/0016_snapshot.json`.
- `pnpm test:run tests/knowledge-draft-extraction.test.ts` -- initially failed 1/7 because malformed successful provider output did not record usage; fixed usage ordering, reran, passed 7 tests. After review fixes, reran and passed 10 tests.
- `pnpm test:run tests/knowledge-source-intake.test.ts` -- passed; 8 tests passed.
- `pnpm typecheck` -- initially failed on two strict insert typing issues in `src/features/knowledge/extraction.ts`; fixed typed support level and draft insert shape, reran, passed.
- `pnpm lint` -- passed.
- `pnpm test:run` -- passed; 12 files / 177 tests passed.
- `pnpm build` -- passed.
- Review fix verification: `pnpm typecheck` -- passed.
- Review fix verification: `pnpm lint` -- passed.
- Review fix verification: `pnpm test:run tests/knowledge-source-intake.test.ts` -- passed; 8 tests passed.
- Review fix verification: `pnpm test:run` -- passed; 12 files / 180 tests passed.
- Review fix verification: `pnpm build` -- passed.
- Follow-up review fix verification: `pnpm db:generate` -- passed; generated `drizzle/migrations/0017_tiny_rattler.sql` and `drizzle/migrations/meta/0017_snapshot.json`.
- Follow-up review fix verification: `pnpm test:run tests/knowledge-draft-extraction.test.ts` -- initially failed while aligning durable usage writes and stricter raw-overlap fixtures; fixed, reran, passed 13 tests.
- Follow-up review fix verification: `pnpm typecheck` -- passed.
- Follow-up review fix verification: `pnpm lint` -- passed.
- Follow-up review fix verification: `pnpm test:run` -- passed; 12 files / 183 tests passed.
- Follow-up review fix verification: `pnpm build` -- passed.

## Implementation Notes

- Added `knowledge_cards` and `knowledge_card_sources` as the durable review queue foundation with draft defaults, review-needed invariant, card type/confidence/support constraints, source linkage, and no retrieval/embedding behavior.
- Added `source_knowledge_draft_extraction_v1` prompt construction for strict JSON drafts that preserve provenance/freshness labels and keep Facebook/community confidence constrained.
- Added `extractKnowledgeDraftsFromSource` service/action that authorizes operator/admin access before source validation, model selection, provider calls, usage writes, draft inserts, or audit side effects.
- Raw source text is loaded only inside server-only knowledge extraction code and sent only to the AI Gateway extraction call; action results and audit summaries return safe IDs/counts only.
- Provider failures record safe usage failure rows without draft/audit persistence; malformed successful provider output records usage but creates no drafts or audit rows.
- Screenshot-only sources fail safely because Story 4.1 stores metadata only; no file reader, approvals, retrieval, embeddings, or traveler display behavior was added.
- Review fixes reject long verbatim raw-source overlap, require boolean freshness flags, prevent same-source duplicate extraction, clamp unverified curated source confidence, and pass the saved `sourceId` into the extraction form.
- Follow-up review fixes make same-source extraction locking atomic, block only active review-needed linked cards, require route/location on drafts, reject shorter raw snippets and phone/email-like values, and add DB JSON-shape constraints for practical details and tags.

## Auto Run Result

Status: done

Summary: Implemented Story 4.2 AI extraction from raw text sources into review-needed draft knowledge cards linked to normalized sources, with safe usage/audit behavior and a minimal admin intake trigger.

Review findings breakdown: 11 patch findings fixed across implementation inspection, review, and follow-up review, 0 deferred, 0 rejected. Follow-up review recommended: false.

Verification performed: `pnpm db:generate`, focused Story 4.2 and Story 4.1 tests, `pnpm typecheck`, `pnpm lint`, full `pnpm test:run`, and `pnpm build` all passed after the noted fixes. After review patches, focused Story 4.2 tests passed with 13 tests, and typecheck/lint/full tests/build were rerun and passed.

Residual risks: This story intentionally supports raw-text extraction only; screenshot/image extraction still requires a later storage/file-reader story. No git commit was created per user instruction.

## File List

- `_bmad-output/implementation-artifacts/spec-4-2-ai-extracts-knowledge-drafts-from-source.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `drizzle/migrations/0016_robust_zemo.sql`
- `drizzle/migrations/0017_tiny_rattler.sql`
- `drizzle/migrations/meta/0016_snapshot.json`
- `drizzle/migrations/meta/0017_snapshot.json`
- `drizzle/migrations/meta/_journal.json`
- `src/app/admin/knowledge/intake/page.tsx`
- `src/db/schema.ts`
- `src/features/ai/prompts.ts`
- `src/features/knowledge/actions.ts`
- `src/features/knowledge/extraction.ts`
- `src/features/usage/events.ts`
- `tests/knowledge-draft-extraction.test.ts`
