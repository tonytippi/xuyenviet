# Epic 21 Context: Context-Complete, Trip-Aware Planning And Conversion

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Travelers refine itinerary, route, stay, food, and activity requests until each relevant scope is ready; receive route-aware answers that expose missing or freshness-sensitive guidance; and explicitly convert the latest eligible ordinary-chat context into a reviewable Trip proposal without copying chat content or mutating applied Trip state before proposal Apply.

## Stories

- Story 21.1: Define versioned planning-context profiles and scope rules
- Story 21.2: Persist scoped multi-turn clarification state safely
- Story 21.3: Run bounded preflight clarification before main answers
- Story 21.4: Preserve applied Trip authority across planning modes
- Story 21.5: Preserve canonical Trip paths and supported route coverage
- Story 21.6: Retrieve and pack evidence by required planning need
- Story 21.7: Verify fresh external facts through replayable web scope
- Story 21.8: Finalize planning evidence atomically
- Story 21.9: Keep a current chat-to-Trip opportunity available
- Story 21.10: Convert the latest eligible context into a reviewable Trip
- Story 21.13: Invalidate planning evidence on conversation and Trip deletion
- Story 21.11: Establish v6 retrieval qualification infrastructure
- Story 21.14: Collect and approve v6 shadow qualification evidence
- Story 21.15: Cut over v6 retrieval through qualified read policy
- Story 21.12: Retire the legacy card-count trigger behaviorally
- Story 21.16: Physically remove expired legacy card-count compatibility

## Requirements & Constraints

- Planning readiness is per typed deliverable instance and pinned version. It cannot be inferred from prose, confidence, a global completion flag, a Trip ID, or a conversation ID.
- Scoped values apply only through strict ancestry or declared precedence. Incomparable overlap remains ambiguous and must be clarified.
- A profiled AI Ask performs at most one bounded plan attempt and one bounded extraction attempt. A blocked turn terminalizes safely without retrieval, web, main-answer model usage, answer provenance, or prompt-render artifacts.
- Only the applied Trip snapshot is current-plan authority. Exploratory and pending proposal values remain visibly hypothetical or pending, and only the existing proposal Apply command mutates the Trip.
- Route authority comes only from an owner-confirmed selected path or a complete active registry projection. Free-text labels and model output never create a durable canonical route choice.
- Retrieval expands deterministic required-need keys before candidate generation, restricts lexical search to an owner-eligible scope-first allowlist, binds contributions at fact/need/scope level, and recomputes coverage from the final prompt-render manifest. Card count is not v6 authority.
- Web verification is admitted only for an uncovered, freshness-sensitive, conflicted, or explicitly current need. Queries minimize private context; fact decisions pin exact scope and replay dependencies; provider failure preserves the gap.
- Prepared and terminal AI Ask state use one command fence and owner ports. Terminal success/failure is atomic, and stale output cannot become visible.
- Chat-to-Trip conversion extends the existing recommendation aggregate and accept/decline API. It uses one stable opportunity, a server-owned latest manifest, and the existing proposal operation contract. Conversion creates a separate Trip, primary conversation, and pending proposal without copying transcript/provider content or applying values.
- Conversation and Trip deletion synchronously invalidate all reconstructable owner-derived planning material. Retained audit/evaluation data must be bounded and non-reconstructable.
- v6 shadow execution remains non-authoritative and side-effect-free. Production cutover is controlled only by the persisted PostgreSQL read-policy row after an exact passing evidence report and Product Owner approval.
- Behavioral retirement and physical cleanup are separate. Cleanup is gated by rollback-window expiry, COMP-06, a passing cleanup report, no unresolved rollback incident, Product Owner approval, and a changed qualified v6 rollback target.
- Use existing modular-monolith boundaries, PostgreSQL/Drizzle persistence, NestJS API admission, existing Worker runtime, and existing AI Gateway model purposes. Add no service, queue, cache, feature flag, model purpose, environment authority, or parallel endpoint.
- Use `pnpm test:unit` for database-free tests and serial `pnpm test:integration` for PostgreSQL-backed tests. A test needing clean tables calls `resetTestDatabase()` locally. Baseline verification is `pnpm lint`, `pnpm typecheck`, and `pnpm build`.

## Technical Decisions

- Retrieval owns reusable profile semantics, scope comparison, route registry/resolution, required needs, retrieval runs, web-scope decisions, and read policy. Chat/Trips owns conversation-bound clarification state, Trip authority, conversion opportunities, proposals, and deletion coordination. AI Orchestration owns plan/extraction attempt identity, prompt/provenance artifacts, and terminal coordination. Usage and Feedback/Eval retain their existing ownership.
- Durable changes use forward Drizzle migrations. Do not edit applied migrations or add a schema-version ledger/readiness gate.
- Every execution pins the relevant profile, policy, comparator, schema, content, Trip/proposal, route-registry, retrieval, parser/resolver, prompt/model, and evaluator identities or records explicit absence.
- Presentation consumes server projections and never derives planning mode, opportunity eligibility, or applied state locally.
- External evidence, authorization, approval, target-environment, and elapsed rollback-window conditions are real fail-closed gates. Local fixtures or code success cannot substitute for them.

## UX & Interaction Patterns

- Traveler copy is concise Vietnamese and describes practical effect and recovery without internal profile, model, state, provenance, audit, or policy terminology.
- Repeated clarification acknowledges resolved context calmly, asks only unresolved material questions, and returns focus to the composer.
- Route limitations, missing needs, verification status, hypothetical changes, pending proposals, and unavailable states remain visible and actionable on mobile and desktop.
- `Chuyển thành chuyến đi` is a persistent server opportunity across navigation, not a sticky banner. Pending newer turns render the action visible but disabled; only explicit dismissal records a decline fence.

## Cross-Story Dependencies

The authoritative sequence is `21.1 -> 21.2 -> 21.3 -> 21.4 -> 21.5 -> 21.6 -> 21.7 -> 21.8 -> 21.9 -> 21.10 -> 21.13 -> 21.11 -> 21.14 -> 21.15 -> 21.12 -> 21.16`. Validate and execute one story at a time. Story 21.14 additionally requires a real comparable evidence window and Feedback/Eval plus Product Owner sign-off; Story 21.15 requires its approved report and authorized target; Story 21.12 requires Product approval but can close before physical cleanup; Story 21.16 remains time- and evidence-gated even after all code is present and must change the runnable rollback target through the approved CAS before removing compatibility code.
