# Story 4.3: Assemble State-Aware Knowledge Source Bundles

Status: ready-for-dev

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

- [ ] Replace the approved-only knowledge bundle adapter with a state-aware contract (AC: 1)
  - [ ] Update `src/features/retrieval/approved-knowledge.ts` and `source-bundle.ts` to consume Story 4.1's typed retrieval result.
  - [ ] Carry policy/state/version/conditions and bounded safe evidence metadata forward; do not re-query or infer policy from prose.
  - [ ] Rename prompt-facing terminology from “approved knowledge” to active state-aware XuyenViet knowledge.
- [ ] Harden prompt and snapshot privacy boundaries (AC: 1, 2)
   - [ ] Retain and name the current bounded serialization contract: at most 30 allowlisted chat/trip facts, five web results, 280 characters per knowledge field, and 5,000 characters total, with deterministic compaction that preserves source priority.
   - [ ] Allow chat/trip context only for the travel-planning fields in AD-12: start city, traveler count, child age range, travel preferences, prior trips, avoided/repeated places, budget range, hotel style, driving tolerance, vehicle/EV needs, food/activity preferences, itinerary constraints, and current trip details. Exclude all other context fields rather than serializing arbitrary JSON.
   - [ ] Preserve structured serialization and prompt-injection delimiters/instructions; source values are data and cannot alter priority or policy.
  - [ ] Allow only safe source projection fields and an explicitly permitted bounded evidence display projection. Hide Facebook URL and raw material regardless of accidental legacy fields.
  - [ ] Extend provenance snapshot inputs now, but defer persistence schema/UI rendering changes to Stories 4.5 and 4.6.
- [ ] Preserve orchestration ordering and add bundle tests (AC: 2, 3)
  - [ ] Keep trip and chat context loading, active knowledge selection, fallback decision, and general marker in their current server-owned ordering.
  - [ ] Prove every disallowed raw/private field is absent from prompt sections and source-bundle snapshots.
   - [ ] Prove conditions, states, verification, and policy survive into the structured prompt input without being model instructions.
   - [ ] Prove over-budget context is deterministically compacted within the stated limits, preserves trip/chat/knowledge/web/general priority, and cannot introduce unallowlisted or raw/private fields.

## Dev Notes

- The stream route already assembles its bundle before gateway streaming. Preserve that sequencing and do not move source assembly to the client or model tool calls.
- Use only Story 4.1 policy-evaluated candidates and Story 4.2 current projections. A bundle cannot make a policy decision, elevate confidence, or use an index row without a current owner/evidence recheck.
- Traveler-safe evidence metadata is not raw quote text by default. `traveler_visible` is an explicit display policy, while `fact_only` supports the fact but does not expose quote/link.
- General reasoning remains an explicit source category, not an untracked fallback.

### Project Structure Notes

- Retrieval owns the bundle: `src/features/retrieval/source-bundle.ts` and the legacy-named `approved-knowledge.ts` seam.
- Prompt formatting belongs in `src/features/ai/prompts.ts`; gateway/provider adapters remain unchanged.
- Preserve `src/app/api/ai-ask/stream/route.ts` authentication, validation, and pre-stream assembly behavior.
- Extend `tests/answer-context.test.ts` with privacy and state-policy assertions; retain existing knowledge search tests for source-level guards.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.3]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-8, AD-10, Retrieval Contract]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/community-knowledge-solution-design.md#Retrieval And AI Ask]
- [Source: src/features/retrieval/source-bundle.ts]
- [Source: src/features/retrieval/approved-knowledge.ts]

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra-review

### Debug Log References

- Implement after the policy and versioned-index stories. Do not use raw source records as a shortcut for richer prompts.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
