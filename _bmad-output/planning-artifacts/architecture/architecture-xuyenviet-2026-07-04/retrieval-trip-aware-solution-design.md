---
title: Retrieval And Trip-Aware Minimal Solution Design
status: final
updated: 2026-08-16
source_prd: ../../prds/prd-xuyenviet-2026-07-04/prd.md
source_addendum: ../../prds/prd-xuyenviet-2026-07-04/addendum.md
source_spine: ARCHITECTURE-SPINE.md
audience: developers and coding agents
---

# Retrieval And Trip-Aware Minimal Solution Design

## Decision

Epic 21 is a disposable-data clean break before production users exist. It delivers one
required-need retrieval path and reuses the current modular monolith. It adds one table,
one migration, and no runtime release machinery.

## Existing Owners Reused

| Owner | Reused responsibility | Epic 21 addition |
|---|---|---|
| Chat/Trips | conversations, messages, Trip aggregate, recommendation, proposal, delete commands | one flat planning-session JSON document |
| Retrieval/database | source bundle, knowledge search, retrieval decision | typed required needs, static route resolver, bounded snapshot |
| Search | existing `web-search.ts`, provider capture and Usage | minimized need/scope query inputs |
| AI Orchestration | existing AI Ask command and terminal transaction | clarification preflight and additional final fence checks |
| Presentation/API | existing controller, direct client and composer | clarification and conversion projections |

No new service, package, Worker workload, queue, cache, feature flag, environment mode,
runtime registry, evaluation subsystem, or release database is permitted.

## Data Shape

Migration `0077_clean_break_trip_aware_planning.sql` adds only
`planning_context_sessions`. The row belongs to one user/conversation and stores the
bounded `PlanningContextSessionPayload` from `contracts.md`. Existing
`assistant_retrieval_decisions.knowledgePolicySnapshot` stores the bounded required-need
snapshot. Existing count columns may remain diagnostic but have no behavior authority.

Profiles, required-need definitions, and route coverage are typed constants in the
modules that use them. They do not need tables or publishing lifecycles.

## Request Flow

1. Existing AI Ask admission authenticates the owner and persists the traveler message.
2. For a supported incomplete intent, clarification reduces explicit values into the
   flat session and returns one question. The turn stops there.
3. For a ready turn, the server resolves one of four planning modes and loads only the
   applied Trip/proposal state allowed by that mode.
4. The static route resolver determines selected, complete, partial, ambiguous,
   unsupported, or stale applicability.
5. Existing knowledge search returns eligible facts. A pure evaluator maps them to the
   small required-need list and produces four outcome kinds.
6. Existing web fallback runs only for missing/changing/conflicted/current needs and
   receives a minimized scoped query.
7. Existing AI Ask terminalization commits message, Usage, provenance, and the bounded
   retrieval snapshot consistently.
8. After an unscoped answer, existing recommendation state is recomputed from explicit
   supported values. Accept creates a Trip plus pending proposal; Apply remains separate.

## Clarification

The session is intentionally flat. Scope supports journey, leg, place, and stay only.
The reducer validates known slot keys, compatible values, source message identity, and
expected revision. A same-scope contradiction becomes missing and causes one correction
question. Intent change supersedes the session. There are no graph revisions, instance
claims, plan attempts, extraction attempts, or autonomous loops.

## Planning And Route Authority

`current_plan` uses only the exact applied Trip snapshot. `explore_change` and
`validate_proposal` may compare hypothetical/pending values but cannot write applied
state. `unscoped_answer` loads no selected private Trip.

Canonical path references change only through the existing owner proposal Apply command.
The route coverage constant is small and code-reviewed. Partial/ambiguous/unsupported/
stale results return limitations and never imply live navigation or nationwide coverage.

## Required Needs And Web

Each supported intent declares a small list of required and optional needs. Applicable
facts satisfy exact need IDs; source metadata does not. Selection uses the existing
prompt budget and prioritizes required needs. Final coverage is recomputed from rendered
evidence.

The historical fewer-than-three condition is deleted when required-need behavior lands.
One exact fact can be enough; many irrelevant cards are not enough. Web fallback is a
consequence of a need outcome, not a card count.

Web results remain external unverified evidence. Exact scope may support a need;
unresolved scope remains a verification lead; mismatched scope is excluded. Provider
failure preserves the gap. An old warning is not described as a live road condition.

## Chat-To-Trip

Conversion reuses the existing recommendation row and command. Its relevant states are
`eligible`, `accepted`, `dismissed`, and `invalidated`. Current explicit supported values
map to existing proposal operations and are validated by the database proposal command.
Accept is owner-scoped and idempotent and creates one Trip, its primary conversation,
and one pending proposal in one transaction.

No transcript, assistant prose, prompt, provider payload, ambiguous value, or assumption
is copied. No manifest history, suspension workflow, policy catalog, new endpoint, or
background refresh is introduced.

## Deletion

Use existing foreign-key cascades first. Add same-transaction cleanup only where an
integration test proves a remaining owner-derived row. Stale finalization/conversion is
rejected by existing owner/version fences. Retained audit is non-reconstructable.

## Migration And Verification

- Confirm the exact database is disposable before any reset.
- Story 21.1 creates and finalizes migration `0073`; later stories do not amend it.
- No later Epic 21 migration is added.
- Final verification does not automatically reset a database.
- Run focused tests per story, then the repository unit/integration/lint/typecheck/build commands.
- Use scoped `rg` to prove no count-decision branch or rollout-control authority remains; do not create a scanner.

Before durable data exists, recovery is code rollback followed by a separately
user-confirmed guarded reset/migrate/seed. Durable-data discovery stops this plan and
requires expand-migrate-contract design.

## Product Traceability

| Outcome | Story |
|---|---|
| Flat bounded clarification | 21.1–21.2 |
| Applied Trip authority | 21.3 |
| Canonical route limits | 21.4 |
| Required-need coverage and count removal | 21.5 |
| Scoped web and consistent answer persistence | 21.6 |
| Reviewable chat-to-Trip conversion | 21.7 |
| Deletion and final clean-break proof | 21.8 |
