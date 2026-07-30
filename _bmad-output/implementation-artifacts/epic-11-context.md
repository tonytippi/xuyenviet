# Epic 11 Context: Explainable, Withdrawable Planning Context

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make planning-answer context and selectable details explainable, owner-safe, and safe over time. AI Ask must use the canonical structured Trip Project state rather than stale chat data, persist the exact context supplied to generation, expose only validated traveler-safe annotations, and remove source-derived details from historic answers when their source is withdrawn.

## Stories

- Story 11.1: Publish Canonical TripAnswerContext Snapshots
- Story 11.2: Withdraw Historical Provenance Safely
- Story 11.3: Validate Persisted Answer Annotations
- Story 11.4: Bind Annotation Details and Actions to Current Ownership
- Story 11.5: Serve Planning Context and Details Through the API Cutover

## Requirements & Constraints

- Protected planning-context, provenance, and detail reads are owner-scoped through a domain-neutral request principal. Responses use the stable safe-error contract and documented API behavior; they never reveal raw evidence, operator-only data, provider payloads, secrets, or cross-user resource existence.
- A selected Trip Project is represented only by `TripAnswerContext v1`: stable anchors, ordered plan items, structured constraints, primary-conversation ID, and bounded current-conversation facts. It must exclude raw transcripts, provider data, hidden proposals, dynamic/deferred data, and mutable aggregates owned by other modules.
- Structured anchors, plan items, and project constraints override legacy project fields and chat context. Project chat may fill absent structured fields; conflicting conversation chat becomes a typed conflict. Answers may request clarification for material conflict, but proposal drafting uses canonical structured state only.
- Persist an immutable source-bundle snapshot for trip context with context/aggregate versions, ordered included identifiers and versions, typed conflicts, deterministic bounded serialization, compacted exclusions and reasons, and final prompt-section SHA-256 digest. Provenance, usage, and evaluation must refer to this snapshot.
- Withdrawing/removing a source or evidence must atomically identify linked provenance, mark it withdrawn with safe metadata, redact traveler URL/quote/quick facts, and invalidate dependent annotations. The operation is idempotent and audit output contains only safe counts/identifiers.
- Historic provenance requires safe backfill before removal cutover. If any affected historic answer cannot be identified and redacted, source removal fails closed; source evidence is not hidden or deleted.
- Read models apply provenance availability at read time. Withdrawn provenance returns only a localized unavailable marker, never a URL, quote, derived fact, or executable action. An annotation whose final required provenance is withdrawn is omitted; a valid answer-local annotation may remain.
- Annotation ranges use non-overlapping, zero-based UTF-16 `{ start, end, text }` values against final persisted assistant content, with an exclusive end and exact slice match. Reject invalid, stale, duplicate, or mismatched descriptors before persistence and rendering.
- `source`, `place`, `hotel_area`, `route_segment`, and `cost` annotations require unique provenance rows owned by the same assistant message, conversation, and user. `warning` and `trip_fact` may be source-free only as non-navigable answer-local/owner-context guidance with no source-derived quick fact or action.
- Each API/BFF read cutover selects exactly one transport owner. Retire the matching legacy read only after safe verification; do not dual-read as public behavior or dual-write state.

## Technical Decisions

- Chat/Trips exclusively publishes `TripAnswerContext v1` at the Trip Project aggregate version. AI Orchestration stores immutable source-bundle snapshots; it does not construct competing trip context.
- `assistant_response_provenance` records `available` or `withdrawn`, withdrawal time, and safe reason. Withdrawal links by source, evidence, and card references and fences annotations and traveler detail projections.
- Detail panels are derived read models, not persisted mutable product state. Resolve project/context through Chat/Trips, source-backed data through Retrieval/Knowledge/Search, and answer source usage through AI Orchestration provenance.
- Persisted descriptor types are `source`, `warning`, `trip_fact`, `action`, `place`, `hotel_area`, `route_segment`, and `cost`. The client renders persisted descriptors only and never parses, normalizes, re-searches, or rematches Vietnamese answer prose.
- Safe descriptor detail may use only title, type, location name, route segment, confidence, freshness state, source type, verification status, checked date, and safe HTTP URL. Allow at most six trimmed `{ label, value }` quick facts, each at most 160 characters; never pass arbitrary source snapshots.
- An optional action persists a registered command, safe/answer-anchored label, and descriptive arguments only. The owning server read model derives the current descriptor-bound executable target/capability and validates typed input, ownership, authorization, and binding. Reject unknown commands, client routing, label-only actions, arbitrary target IDs, and withdrawn provenance.
- API contracts must state authorization, ownership, safe errors, and stable pagination/ordering where relevant. The browser remains behind the BFF rather than calling the private API.

## UX & Interaction Patterns

- Selectable persisted entities and source chips can open a contextual detail view only when selected; no empty detail panel is shown. Desktop panel and mobile sheet share one selected-detail state, with one interactive surface and focus restored on close.
- Detail views show only traveler-safe title, summary, quick facts, related details, authorized actions, and provenance. Source summaries remain compact; raw operator material is never rendered.
- Source, warning, and selectable controls that open details are keyboard-focusable. The selected state is exposed; `Esc` closes the detail surface and returns focus to its trigger. Maintain WCAG 2.2 AA behavior, visible focus, color-independent labels, and 44px mobile targets.
- Answers remain intact when optional annotation enrichment is delayed or fails; show only a non-blocking recoverable status. Persisted descriptors may legitimately be absent.

## Cross-Story Dependencies

- Story 11.1 establishes the canonical context and immutable source-bundle contract consumed by answer generation, provenance, proposal drafting, and evaluation.
- Story 11.2 establishes withdrawal/backfill availability rules that Stories 11.3 and 11.4 must honor when validating, resolving, and rendering annotations/details.
- Story 11.3 supplies validated persisted descriptors; Story 11.4 adds safe projection and server-bound action resolution on those descriptors.
- Story 11.5 migrates the context, provenance, and detail read models through the API/BFF path after the private API foundation and AI Ask cutover, preserving current availability and owner checks.
