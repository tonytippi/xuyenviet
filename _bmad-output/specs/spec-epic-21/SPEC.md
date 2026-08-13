---
id: SPEC-epic-21
companions:
  - story-contracts.md
  - ../../project-context.md
  - ../../planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md
  - ../../planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/contracts.md
  - ../../planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md
  - ../../planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/evaluation-and-release-gates.md
  - ../../planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents referenced inside the companions remain the owners of their detailed architecture, UX, fixture, and release-gate rules.

# Epic 21: Context-Complete, Trip-Aware Planning And Conversion

## Why

Travelers need XuyenViet to complete material planning context without leaking values between scopes, distinguish saved Trip authority from exploration, ground route-sensitive guidance in applicable evidence, and convert useful chat context into a reviewable Trip without copying the transcript or mutating the applied plan prematurely. The mandate is to replace legacy card-count retrieval behavior safely while preserving rollback, privacy, provenance, and operational control.

## Capabilities

- **CAP-1 — Versioned planning-context profiles**
  - **intent:** The system can define the material fields and scope rules for each typed planning deliverable.
  - **success:** Readiness is evaluated per deliverable instance and pinned profile version, with deterministic ancestry and precedence and no cross-scope leakage.
- **CAP-2 — Durable scoped clarification**
  - **intent:** Travelers can accumulate valid clarification answers across turns without losing or silently replacing them.
  - **success:** State advances monotonically behind content and attempt fences, and stale, foreign, deleted, or incomparable values cannot become current.
- **CAP-3 — Bounded clarification preflight**
  - **intent:** The system can ask only unresolved material questions before producing a main answer.
  - **success:** A profiled turn performs at most one planning attempt and one extraction attempt; a blocked turn terminalizes replayably without retrieval, web, main-answer, prompt-render, or answer-provenance artifacts.
- **CAP-4 — Explicit planning modes and authority**
  - **intent:** Travelers can distinguish the applied current plan from hypothetical changes, pending proposals, validation, and unscoped questions.
  - **success:** Mode resolution is deterministic, applied Trip state remains the only current-plan authority, and only the owner Apply command changes it.
- **CAP-5 — Canonical route paths and coverage**
  - **intent:** Route guidance can rely on an owner-selected path or an explicit product coverage projection.
  - **success:** Free text and model output never create durable route authority; stale, partial, ambiguous, and unsupported paths fail safely with traveler-visible limitations.
- **CAP-6 — Required-need evidence packing**
  - **intent:** Retrieval can cover consequential planning needs instead of optimizing for related-card volume.
  - **success:** Scope-first candidate generation, fact-level contributions, bounded prioritization, and final-render coverage keep missing needs visible even when duplicate or unrelated evidence exists.
- **CAP-7 — Replayable scoped web verification**
  - **intent:** Freshness-sensitive or conflicted needs can be verified for the exact relevant place, route, and time.
  - **success:** Queries minimize private context, decisions pin replay dependencies and scope, and provider failure preserves the uncovered need rather than manufacturing live authority.
- **CAP-8 — Atomic answer finalization**
  - **intent:** The system can publish one internally consistent terminal result for each AI Ask command.
  - **success:** Prepared artifacts, Usage, messages, provenance, retrieval state, and failure outcomes finalize through one fence and owner transactions with no partial or competing state.
- **CAP-9 — Persistent chat-to-Trip opportunity**
  - **intent:** Travelers can keep one current `Chuyển thành chuyến đi` opportunity available across navigation until they act or the context changes.
  - **success:** The server owns a stable opportunity and latest eligible manifest; newer pending turns disable conversion, and only explicit dismissal records a decline fence.
- **CAP-10 — Reviewable Trip conversion**
  - **intent:** Travelers can convert the latest eligible ordinary-chat planning context into a Trip proposal for review.
  - **success:** Conversion creates a separate Trip, primary conversation, and pending typed proposal without transcript or provider-content copying and without pre-Apply mutation.
- **CAP-11 — Deletion invalidation**
  - **intent:** Deleting a conversation or Trip can stop its planning material from influencing future behavior.
  - **success:** All reconstructable owner-derived state is synchronously invalidated while any retained audit or evaluation data is bounded and non-reconstructable.
- **CAP-12 — Qualification infrastructure**
  - **intent:** Feedback, evaluation, and release actors can qualify retrieval versions using durable profiles, runs, policies, and cutover records.
  - **success:** Infrastructure supports reproducible qualification and controlled transitions without collecting approval evidence or activating production reads implicitly.
- **CAP-13 — Comparable shadow evidence**
  - **intent:** Product owners can decide on v6 activation from an exact, reviewed, non-authoritative evidence window.
  - **success:** A persisted comparable report satisfies duration and count requirements and receives the designated Feedback or Eval and Product Owner approvals without changing production authority.
- **CAP-14 — Qualified read-policy cutover**
  - **intent:** Authorized operators can activate v6 retrieval for an explicitly named target only after qualification.
  - **success:** A target-specific compare-and-set transition binds the approved report, actor, policy, environment, and runnable rollback; failed preflight leaves the prior authority unchanged.
- **CAP-15 — Behavioral retirement of card count**
  - **intent:** Web verification can respond to missing or changing needs rather than a legacy number of cards.
  - **success:** Required-need behavior becomes authoritative only after COMP-01 through COMP-06 and the executable closure evidence receive the required retirement approval.
- **CAP-16 — Physical compatibility cleanup**
  - **intent:** Operators can remove expired legacy compatibility after it is no longer needed for safe rollback.
  - **success:** Cleanup occurs only after the rollback window, passing cleanup report, no unresolved incident, Product Owner approval, and a persisted transition to a qualified v6 rollback target.

## Constraints

- Follow the exact per-story Given/When/Then criteria, tasks, paths, commands, dependency checks, and `Block If` rules in `story-contracts.md`; story descriptions in `stories.yaml` are dispatch inventory, not substitutes for those contracts.
- Execute stories only in this order: `21-1 → 21-2 → 21-3 → 21-4 → 21-5 → 21-6 → 21-7 → 21-8 → 21-9 → 21-10 → 21-13 → 21-11 → 21-14 → 21-15 → 21-12 → 21-16`.
- Pin every relevant profile, policy, comparator, schema, content, Trip, proposal, route-registry, retrieval, parser, resolver, prompt, model, and evaluator identity, or record its explicit absence.
- Use the existing modular-monolith ownership, PostgreSQL and forward-only Drizzle migrations, NestJS admission, Worker runtime, AI Gateway purposes, and owner ports. Add no parallel endpoint, service, queue, cache, feature flag, model purpose, or environment authority.
- Only applied Trip state and owner-confirmed canonical paths are current authority. Prose, confidence, identifiers, text similarity, model output, pending proposals, and card counts cannot manufacture authority.
- Prepared and terminal AI Ask state share one command fence and owner transaction boundaries; stale, retried, deleted, or failed work cannot become visible.
- External evidence, human approvals, actor authorization, target identity, and rollback-window expiry are genuine fail-closed gates. Local fixtures or passing code cannot substitute for them.
- Use `pnpm test:unit` for infrastructure-free tests and serial `pnpm test:integration` for PostgreSQL-backed tests. Tests needing clean tables call `resetTestDatabase()` locally; baseline verification is `pnpm lint`, `pnpm typecheck`, and `pnpm build`.
- `sprint-status.yaml` remains the sprint-level tracker. `stories.yaml` contains no status, and each generated story spec under `stories/` owns only that build-auto run's execution state and evidence.

## Non-goals

- Running multiple Epic 21 stories concurrently or bypassing predecessor completion.
- Treating local tests, fixtures, simulated evidence, or implementation assignment as production approval, actor authorization, target selection, or elapsed rollback time.
- Creating a second chat-to-Trip endpoint, a second proposal contract, a new service boundary, or a new environment-based retrieval authority.
- Copying ordinary-chat transcript or provider content into a Trip, or applying proposal values before owner confirmation.
- Making `stories.yaml` a second sprint tracker or pre-marking all stories `ready-for-dev` merely because they are dispatchable.

## Success signal

All sixteen stories complete sequentially through folder-plus-ID dispatch, with every automated and gated acceptance criterion evidenced in its generated story spec, `sprint-status.yaml` synchronized without regression, v6 retrieval activated only from an approved persisted policy, and legacy compatibility removed only after its safe-cleanup gates pass.
