---
baseline_commit: ee80c40ed72f8db67234312876eea12deca51b57
---

# Story 4.3: Assemble State-Aware Knowledge Source Bundles

Status: review

## Story

As a traveler,
I want the assistant to receive the conditions and limits of community knowledge,
so that its answer can use local observations without overstating certainty.

## Acceptance Criteria

1. Given retrieval selects eligible knowledge, when the source bundle is assembled before generation, each item includes card identity/version, fact, type, location/route, conditions, confidence, freshness, knowledge/verification state, use policy, and bounded traveler-safe evidence/source metadata.
2. Given a source or evidence record is raw, private, operator-only, or lacks display permission, when bundle and provenance snapshots are assembled, raw text, copied body, image/OCR notes, provider payload, audit metadata, and hidden quote/link are excluded without invented substitutes.
3. Given trip context, chat context, active knowledge, web results, and general reasoning exist, when prompt context is ordered, the priority remains trip, chat, active knowledge, web fallback, then general reasoning. Source data is non-instructional and cannot override this contract.
4. Given source-bundle inputs exceed their bounded prompt budget, when the bundle is serialized, it includes no more than 30 allowlisted chat/trip facts, five web results, 280 characters per knowledge field, and 5,000 characters total; excess data is omitted rather than re-prioritized or summarized from raw/private fields.

## Tasks / Subtasks

- [x] Replace the approved-only knowledge bundle adapter with a state-aware contract (AC: 1)
   - [x] Update `src/features/knowledge/search.ts`, `src/features/retrieval/approved-knowledge.ts`, and `source-bundle.ts` so Story 4.1's typed retrieval result owns the source-bound, retrieval-effective evidence projection consumed by the bundle; the bundle must not re-query evidence or infer its policy.
   - [x] Carry policy/state/version/conditions and bounded safe evidence metadata forward; do not re-query or infer policy from prose.
   - [x] Rename prompt-facing terminology from “approved knowledge” to active state-aware XuyenViet knowledge.
   - [x] Define one typed `StateAwareKnowledgeBundleItem` projection. Include `cardId`, `contentVersion`, fact/summary, type, location/route, conditions, confidence, freshness flag, knowledge/verification state, and use policy. Project only retrieval-effective evidence records, each bound to its source and limited to evidence/source ID, support level, source label/type/verification/official/partner flags, collected/observed date, and a safe HTTP URL.
   - [x] Enforce evidence display policy in that projection: `traveler_visible` may include its bounded quote and safe HTTP link when the source is accessible, short/relevant, and free of PII/sensitive content; `fact_only` may support the fact but exposes neither quote nor link; `operator_only` exposes neither evidence content nor link. Raw Facebook material and every URL not permitted by this policy stay absent even if legacy source fields accidentally contain them.
- [x] Harden prompt and snapshot privacy boundaries (AC: 1, 2)
   - [x] Retain and name the current bounded serialization contract: at most 30 allowlisted chat/trip facts, five web results, 280 characters per knowledge field, and 5,000 characters total, with deterministic compaction that preserves source priority.
   - [x] Allow chat/trip context only for the travel-planning fields in AD-12: start city, traveler count, child age range, travel preferences, prior trips, avoided/repeated places, budget range, hotel style, driving tolerance, vehicle/EV needs, food/activity preferences, itinerary constraints, and current trip details. Exclude all other context fields rather than serializing arbitrary JSON.
   - [x] Apply the 30-fact cap across the complete chat/trip contribution to one prompt, selecting trip before chat deterministically. Conflict and family guidance must consume this same budget and must not duplicate fact values. Cap every serialized knowledge value, including each practical-detail value and `ordered_stops`, at 280 characters. The 5,000-character cap includes delimiters, instructions, every context section, and the general marker.
   - [x] Serialize `practicalDetails` only through a typed allowlist: `tips`, `warnings`, `cost_notes`, `parking_notes`, `kid_notes`, and `ordered_stops`. Each permitted value must be a normalized string or string array; omit unknown keys, nested objects, non-string values, raw/provider/audit fields, and contacts. Preserve `ordered_stops` order and intentional repeated labels, with at most 40 short labels, while applying the same 280-character serialized-field cap.
   - [x] Preserve structured serialization and prompt-injection delimiters/instructions; source values are data and cannot alter priority or policy.
   - [x] Allow only safe source projection fields and an explicitly permitted bounded evidence display projection. Hide raw Facebook material and every URL not permitted by the evidence display policy regardless of accidental legacy fields.
   - [x] In `src/features/retrieval/provenance.ts`, create a bounded state-aware provenance-input snapshot from each typed bundle item, never raw source/capture/audit rows. Include `knowledgeCardId`, `contentVersion`, knowledge/verification states, use policy, conditions, confidence, freshness flag, and the identical safe evidence/source projection supplied to the prompt. Defer persistence schema and traveler rendering changes to Stories 4.5 and 4.6.
- [x] Preserve orchestration ordering and add bundle tests (AC: 2, 3)
   - [x] Keep trip and chat context loading, active knowledge selection, fallback decision, and general marker in their current server-owned ordering.
   - [x] Preserve the shared bundle path in both `src/app/api/ai-ask/stream/route.ts` and `src/features/ai/evaluation-answer.ts`; do not create an evaluation-only bundle or provenance contract.
   - [x] Prove every disallowed raw/private field is absent from prompt sections and source-bundle snapshots.
    - [x] Prove conditions, states, verification, and policy survive into the structured prompt input without being model instructions.
    - [x] Prove `traveler_visible`, `fact_only`, and `operator_only` evidence behavior in prompt sections and persisted provenance snapshots, including that a Facebook link is present only when the explicit traveler-visible policy and safe-URL requirements permit it.
     - [x] Prove over-budget context is deterministically compacted within the combined fact, per-field, web-result, and total-section limits; it preserves trip/chat/knowledge/web/general priority and cannot introduce unallowlisted or raw/private fields.

### Review Findings

- [x] [Review][Patch] Block Facebook and sensitive traveler-visible evidence from bundle projection [src/features/knowledge/search.ts:303] — The retrieval query accepts Facebook sources and `toKnowledgeSearchEvidence` copies any traveler-visible HTTP(S) URL and quote without checking source kind, quote safety, or the story's explicit Facebook restriction. A legacy/misclassified Facebook row or sensitive quote can reach the prompt and provenance snapshot, violating AC 2.
- [x] [Review][Patch] Bound the serialized combined conditions field [src/features/retrieval/approved-knowledge.ts:44] — Conditions are capped individually but joined without a 280-character cap. A valid item can exceed the 2,400-character knowledge section and be omitted entirely instead of deterministically compacted, violating AC 4.
- [x] [Review][Patch] Make retrieval-effective evidence selection deterministic [src/features/knowledge/search.ts:320] — The active evidence query has no stable ordering before the bundle takes its first three records. PostgreSQL can return a different subset on equivalent requests, making prompt/provenance snapshots nondeterministic and omitting higher-priority evidence.
- [x] [Review][Patch] Use state-aware terminology in every prompt priority contract [src/features/retrieval/source-bundle.ts:421] — The full, compacted, and minimal priority instructions still describe active knowledge as `kiến thức Xuyên Việt đã duyệt`, contradicting the state-aware knowledge section and the required prompt-facing terminology rename.
- [x] [Review][Patch] Preserve the knowledge verification state in the provenance row [src/features/retrieval/provenance.ts:138] — Every knowledge provenance row is marked `verified` even when its bundle item and evidence are unverified. Downstream provenance consumers can present community observations as verified despite the stored snapshot state.
- [x] [Review][Patch] Block Facebook alias URLs from traveler-visible evidence [src/features/retrieval/approved-knowledge.ts:158] — `isFacebookUrl` permits aliases such as `www.fb.com`, `m.fb.com`, and `www.fb.watch`. A legacy or misclassified Facebook source with one of those URLs can retain its quote and link in the prompt and provenance snapshot, violating the raw Facebook exclusion.
- [x] [Review][Patch] Redact spaced provider-payload markers from traveler-visible evidence [src/features/retrieval/approved-knowledge.ts:168] — The sensitive-text guard matches `provider_payload` and `provider-payload`, but not `provider payload`. A traveler-visible quote with the spaced marker can reach the prompt and provenance snapshot.
- [x] [Review][Patch] Derive knowledge provenance verification from projected evidence [src/features/retrieval/provenance.ts:138] — Provenance marks every knowledge card whose `verificationState` is not `required` as `verified`, even if all selected evidence has `verificationStatus: "unverified"`. The traveler-facing provenance row can therefore overstate an unverified community source.
- [x] [Review][Patch] Reject credential-bearing traveler-visible evidence URLs [src/features/knowledge/search.ts:375] — `safeHttpUrl` now rejects HTTP(S) URLs with a username or password before evidence reaches bundle/provenance projection; regression coverage verifies the evidence projection is fact-only with no credentials.
- [x] [Review][Patch] Block Facebook short-link aliases from evidence projection [src/features/retrieval/approved-knowledge.ts:158] — The Facebook URL guard now includes `fb.me`, preventing short-link evidence quotes and links from surviving bundle projection.
- [x] [Review][Patch] Remove contact data from allowlisted practical details [src/features/retrieval/approved-knowledge.ts:125] — Practical-detail values now use the traveler-safe privacy filter before serialization, excluding phone numbers, email addresses, and raw/provider markers.
- [x] [Review][Patch] Sanitize sensitive evidence source labels [src/features/retrieval/approved-knowledge.ts:58] — Source labels now use the traveler-safe privacy filter before prompt and provenance projection, including `fact_only` evidence.
- [x] [Review][Patch] Preserve source priority in the over-budget minimal fallback [src/features/retrieval/source-bundle.ts:469] — Minimal compaction retains selected trip, chat, and active knowledge context before adding web content only when it still fits the total budget.

## Dev Notes

- The stream route already assembles its bundle before gateway streaming. Preserve that sequencing and do not move source assembly to the client or model tool calls.
- Use only Story 4.1 policy-evaluated candidates and Story 4.2 current projections. A bundle cannot make a policy decision, elevate confidence, or use an index row without a current owner/evidence recheck.
- Traveler-safe evidence metadata is not raw quote text by default. `traveler_visible` is an explicit display policy, while `fact_only` supports the fact but does not expose quote/link.
- General reasoning remains an explicit source category, not an untracked fallback.

### Project Structure Notes

- Retrieval owns the bundle: `src/features/knowledge/search.ts` supplies the policy-evaluated source-bound evidence projection, while `src/features/retrieval/source-bundle.ts` and the legacy-named `approved-knowledge.ts` seam serialize it without another evidence read.
- Prompt formatting belongs in `src/features/ai/prompts.ts`; gateway/provider adapters remain unchanged.
- Preserve `src/app/api/ai-ask/stream/route.ts` authentication, validation, and pre-stream assembly behavior.
- Snapshot construction belongs in `src/features/retrieval/provenance.ts`; it is the shared input to stored source provenance, not a second retrieval path.
- Extend `tests/answer-context.test.ts` with prompt and persisted-snapshot assertions for raw/copied/OCR/provider/audit exclusion, evidence display policy, state/policy/version survival, combined fact budget, per-field cap, practical-detail allowlisting, total-section cap, and the shared stream/evaluation behavior. Retain and extend knowledge-search tests to prove evidence is source-bound and retrieval-effective before it reaches the bundle.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.3]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-8, AD-10, Retrieval Contract]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/community-knowledge-solution-design.md#Retrieval And AI Ask]
- [Source: src/features/retrieval/source-bundle.ts]
- [Source: src/features/retrieval/approved-knowledge.ts]
- [Source: src/features/retrieval/provenance.ts]
- [Source: src/features/ai/evaluation-answer.ts]
- [Source: src/features/knowledge/search.ts]

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra-review

### Debug Log References

- Implement after the policy and versioned-index stories. Do not use raw source records as a shortcut for richer prompts.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Implemented retrieval-owned state-aware evidence projections and a typed `StateAwareKnowledgeBundleItem` for the prompt and provenance paths.
- Enforced bounded prompt serialization: active-knowledge terminology, safe evidence display policy, practical-detail allowlist, shared 30-fact trip-before-chat budget, five-result web cap, 280-character knowledge fields, and 5,000-character total section cap.
- Added prompt and persisted-provenance coverage for state/version/policy survival and traveler-visible versus fact-only evidence redaction.
- Verified: `pnpm test:run` (49 files, 660 tests), `pnpm typecheck`, `pnpm lint` (passes with 3 pre-existing unused-variable warnings in `tests/knowledge-search.test.ts`), and `pnpm build`.
- Resolved all five actionable review findings: traveler-visible Facebook/sensitive evidence is redacted, combined conditions are capped at 280 characters, evidence order is deterministic, prompt priority wording is state-aware, and provenance reflects unverified required verification state.
- Verified review fixes: `pnpm test:run` (49 files, 663 tests), `pnpm typecheck`, `pnpm lint` (passes with 3 pre-existing unused-variable warnings in `tests/knowledge-search.test.ts`), and `pnpm build`.
- Resolved High review finding: traveler-visible evidence now rejects Facebook aliases including `www.fb.com`, `m.fb.com`, and `www.fb.watch`; focused prompt regressions cover each alias.
- Resolved High review finding: sensitive evidence markers accept whitespace, underscores, and hyphens, preventing `provider payload` text from reaching prompt or provenance snapshots.
- Resolved High review finding: knowledge provenance is unverified when the card requires verification or any projected evidence is unverified; a focused persisted-row regression covers a not-required card with unverified evidence.
- Verified final repair attempt 2: `pnpm test:run tests/answer-context.test.ts` (63 tests) and `pnpm typecheck`.
- Resolved the remaining five assigned Epic 4 review findings: credential-bearing evidence URLs are rejected; `fb.me` is excluded; practical-detail values and evidence labels are privacy-filtered; and minimal compaction preserves trip/chat/active knowledge priority before web results.
- Verified review remediation: `pnpm test:run tests/answer-context.test.ts tests/knowledge-search.test.ts` (125 tests), `pnpm typecheck`, and `pnpm lint` (passes with 3 pre-existing unused-variable warnings in `tests/knowledge-search.test.ts`).

### File List

- `src/features/knowledge/search.ts`
- `src/features/retrieval/approved-knowledge.ts`
- `src/features/retrieval/source-bundle.ts`
- `src/features/retrieval/provenance.ts`
- `tests/answer-context.test.ts`
- `tests/knowledge-search.test.ts`

## Change Log

- 2026-07-23: Implemented state-aware knowledge source bundle assembly and marked ready for review.
- 2026-07-23: Addressed all five actionable review findings and retained review status.
- 2026-07-23: Addressed three final High review findings, added focused regressions, and retained review status.
- 2026-07-23: Marked done by explicit user direction with five final review findings accepted for follow-up.
- 2026-07-24: Resolved the five assigned final review findings and returned Story 4.3 to review.
