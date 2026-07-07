---
title: 'Story 5.0: Manage AI Gateway Models And Pricing'
type: 'feature'
created: '2026-07-07'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: 'e9c38c4b2a82c71b912841e7bd288da9f9da318e'
final_revision: 'f1bfa1eeb6d00451925d1b768c71e9dded9d5d82'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-07-ai-gateway-models-streaming-multimodal.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** AI Gateway model selection is currently a hard-coded chat constant, and usage events store tokens without pricing or model-capability context. Upcoming streaming, image input, retrieval, extraction, and evaluation work need a managed catalog so model capabilities and cost estimates are consistent instead of scattered through feature code.

**Approach:** Add a DB-backed AI Gateway model catalog with capability flags, purpose assignments, pricing metadata, and a seed record for the current chat model. Resolve AI Ask model calls through the catalog, snapshot estimated usage cost when provider token metadata is available, and expose minimal admin/operator server actions for catalog maintenance without adding billing behavior.

## Boundaries & Constraints

**Always:** Use Drizzle schema and migrations; keep provider calls behind the AI Gateway adapter; preserve authenticated AI Ask behavior; select models by purpose and required capabilities; store usage cost as nullable integer micro-units with pricing snapshot metadata; allow missing pricing or missing token metadata without blocking answer generation; audit admin/operator catalog mutations; keep current Vietnamese traveler UX unchanged.

**Block If:** Implementing this requires a credit ledger, payment flow, user-facing balances, request blocking for insufficient funds, direct provider APIs, a separate service, or a production-only seed process not represented in migrations/code.

**Never:** Do not scatter new hard-coded model strings across feature code; do not calculate money with floating-point values; do not rewrite completed Epic 2 story artifacts; do not add image upload, streaming transport, retrieval, provenance UI, or web search in this story; do not expose secrets or provider payloads in audit/usage records.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Catalog seed | Migrations run on an empty DB | Current `cx/gpt-5.5` chat model exists with active status, purpose, text capability, streaming/image capability fields, currency, unit prices, pricing unit, and effective timestamp/version | Migration must be deterministic and not require provider credentials |
| Model selection | AI Ask prepares a chat call | Server resolves the active default model for `ai_ask_initial_answer` requiring text input, then passes that model to the Gateway adapter | If no matching active model exists, return a safe AI failure and record failure usage without provider call |
| Usage pricing | Gateway returns token usage and the selected model has pricing | Usage event stores token counts plus input/output/total cost micro-units, currency, pricing unit, and model pricing reference/version snapshot | If tokens or pricing are missing, cost fields remain null and answer generation still succeeds |
| Capability mismatch | A caller asks for image input, streaming, extraction, embeddings, or evaluation capability | Selection only returns models configured for the requested purpose and capabilities | If unsupported, the caller gets a typed no-model result before provider call |
| Admin mutation | Admin/operator creates, updates, archives, or sets default model/pricing | Mutation is authorized server-side and writes an audit event | Traveler/unauthenticated users are denied before mutation side effects |

</intent-contract>

## Code Map

- `src/db/schema.ts` -- add AI Gateway model catalog, purpose assignment/pricing fields, and usage cost snapshot columns using existing check-constraint style.
- `drizzle/migrations/*` -- generated SQL migration and metadata for new catalog tables, seed row, constraints, indexes, and usage columns.
- `src/features/ai/models.ts` -- new server-only catalog repository/selection module for purpose/capability constrained model lookup and cost calculation inputs.
- `src/features/ai/prompts.ts` -- keep purpose and prompt version constants, remove the exported hard-coded model as the orchestration source of truth.
- `src/features/ai/gateway.ts` -- accept selected model from the caller instead of importing a model constant directly.
- `src/features/ai/ask-gate.ts` -- resolve the AI Ask model before provider call, pass it to the Gateway, and route selected pricing metadata into usage recording.
- `src/features/usage/events.ts` -- extend usage writer to store nullable cost/pricing snapshot fields while preserving existing append-only behavior.
- `src/features/admin/actions.ts` -- add minimal audited admin/operator server actions for creating/updating/archiving model records and setting defaults.
- `.env.example` -- document `AI_GATEWAY_TIMEOUT_MS` since Gateway already supports it; avoid adding model-selection envs when DB catalog owns selection.
- `tests/ai-ask-shell.test.ts` -- update AI Ask tests for DB-selected model, usage pricing snapshots, no-model failure, and gateway request body.
- `tests/ai-models.test.ts` -- add catalog selection, capability, pricing, constraint, and admin-action tests.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- mark Story 5.0 in progress and done only as implementation advances.

## Tasks & Acceptance

**Execution:**
- [x] `src/db/schema.ts` and `drizzle/migrations/*` -- add catalog tables/columns, constraints, indexes, and seed the current active chat model -- make model capabilities and pricing durable.
- [x] `src/features/ai/models.ts` -- implement active model selection by purpose/capability and cost-estimation helpers using integer micro-units -- centralize model/cost rules.
- [x] `src/features/ai/gateway.ts`, `src/features/ai/prompts.ts`, and `src/features/ai/ask-gate.ts` -- replace scattered hard-coded model selection with catalog resolution while preserving current AI Ask response/failure semantics -- keep chat behavior stable.
- [x] `src/features/usage/events.ts` -- persist nullable cost and pricing snapshot metadata on usage events -- make cost observable without billing.
- [x] `src/features/admin/actions.ts` -- add audited admin/operator mutation seams for model catalog maintenance -- satisfy manageability without building a large UI.
- [x] `.env.example` -- document existing `AI_GATEWAY_TIMEOUT_MS` behavior -- keep Gateway config discoverable.
- [x] `tests/ai-ask-shell.test.ts` and `tests/ai-models.test.ts` -- cover matrix scenarios, no-model fail-closed behavior, capability filtering, cost snapshots, admin authorization/audit, and schema constraints -- verify Story 5.0 behavior.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- update Story 5.0 workflow status -- keep BMad tracking aligned.

### Review Findings

- [x] [Review][Patch] Model selection can silently fall back to non-default active models [src/features/ai/models.ts:59]
- [x] [Review][Patch] Usage rows do not persist enough immutable pricing snapshot metadata [src/features/usage/events.ts:56]
- [x] [Review][Patch] Gateway usage token parser accepts values larger than PostgreSQL integer columns [src/features/ai/gateway.ts:221]
- [x] [Review][Patch] Cached prompt tokens can exceed prompt tokens and overstate cache-read cost [src/features/ai/models.ts:100]
- [x] [Review][Patch] Configured cache-write pricing is never usable because cache-write tokens are not parsed or stored [src/features/ai/models.ts:107]
- [x] [Review][Patch] Admin actions allow monetary prices without a currency [src/features/admin/actions.ts:182]
- [x] [Review][Patch] Default model mutations do not validate purpose-required capabilities [src/features/admin/actions.ts:55]
- [x] [Review][Patch] Total estimated cost treats missing priced components as zero [src/features/ai/models.ts:108]

**Acceptance Criteria:**
- Given AI Gateway access is configured, when catalog rows are seeded or managed, then each active model can store gateway model name, display label, intended purposes, capability flags, active status, pricing currency, input/output/cache pricing fields when supported, pricing unit, and effective timestamp or version.
- Given AI orchestration prepares a call, when it selects a model for chat, extraction, embeddings, evaluation, streaming, or image input, then selection is constrained by configured purpose and capability flags and feature code does not scatter direct hard-coded model strings.
- Given provider usage metadata is available, when a usage event is recorded, then the Usage module estimates cost from the selected model pricing record and safely records missing pricing when unavailable.
- Given future billing is out of MVP scope, when model pricing exists, then the system does not show balances, charge users, enforce credits, or create payment obligations.

## Spec Change Log

## Review Triage Log

### 2026-07-07 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 7: (high 3, medium 3, low 1)
- defer: 0
- reject: 1
- addressed_findings:
  - `[high]` `[patch]` Default model purpose updates could leave duplicate or misplaced defaults; added DB unique default-per-purpose constraint and updated mutation logic to clear peers based on merged next state.
  - `[high]` `[patch]` Inactive rows could remain default; added DB check constraint and admin validation so default models must be active.
  - `[medium]` `[patch]` Cached prompt token metadata was discarded; parsed `prompt_tokens_details.cached_tokens`, stored it on usage events, and tested the snapshot.
  - `[medium]` `[patch]` Cached prompt tokens would be double-counted; cost estimation now subtracts cached tokens from billable input tokens and guards invalid token counts.
  - `[medium]` `[patch]` Admin tests missed update/default invariant paths; added coverage for purpose moves, inactive-default rejection, and multiple-default DB rejection.
  - `[low]` `[patch]` Usage writer could receive invalid token counts from future callers; normalized token inputs before cost estimation.

### 2026-07-07 — Follow-up code review pass
- decision_needed: 0
- patch: 8: fixed
- defer: 0
- dismiss: 0
- addressed_findings:
  - `[patch]` Required active defaults during model selection so AI Ask no longer silently falls back to non-default capable models.
  - `[patch]` Added durable usage snapshot fields for pricing effective date and per-token prices.
  - `[patch]` Bounded Gateway and usage token normalization to PostgreSQL integer-safe values.
  - `[patch]` Ignored impossible cached/cache-write token counts that exceed prompt tokens.
  - `[patch]` Parsed and stored cache-write prompt tokens from Gateway usage details.
  - `[patch]` Required pricing currency when any token price is configured, in admin actions and database constraints.
  - `[patch]` Validated default model capability requirements by purpose in admin mutations.
  - `[patch]` Kept total estimated cost nullable when present token components have missing prices.

## Design Notes

Prefer a small catalog implementation over an admin-heavy experience. A server-action maintenance seam plus DB seed is enough for Story 5.0 because later admin UX can grow when operators need frequent edits. Usage events should snapshot estimated costs; reports must not join mutable current pricing to old token counts and silently rewrite history.

## Verification

**Commands:**
- `pnpm db:generate` -- expected: migration generated for schema changes.
- `pnpm test:run tests/ai-models.test.ts tests/ai-ask-shell.test.ts` -- expected: targeted model/catalog and AI Ask tests pass.
- `pnpm test:run` -- expected: full test suite passes.
- `pnpm lint` -- expected: passes.
- `pnpm typecheck` -- expected: passes.
- `pnpm build` -- expected: passes.

## Auto Run Result

Status: done

Summary: Implemented Story 5.0. AI Gateway models are now managed through a DB-backed catalog with purpose/capability flags, active/default selection, pricing metadata, deterministic seed data, and usage cost snapshots. AI Ask resolves the selected chat model from the catalog before Gateway calls, records selected model/pricing details on usage events, and fails safely without provider calls when no capable model exists. Admin/operator server actions provide audited catalog maintenance seams without adding billing, credits, or a traveler-facing pricing UI.

Files changed:
- `.env.example` -- documented the existing `AI_GATEWAY_TIMEOUT_MS` option.
- `_bmad-output/implementation-artifacts/epic-5-context.md` -- compiled Epic 5 context for Story 5.0.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- marked Epic 5 in progress and Story 5.0 done.
- `_bmad-output/implementation-artifacts/spec-5-0-manage-ai-gateway-models-and-pricing.md` -- recorded spec, review triage, verification, and auto-run result.
- `drizzle/migrations/0006_cheerful_george_stacy.sql` and migration metadata -- added model catalog, seed row, and usage cost snapshot columns.
- `drizzle/migrations/0007_jittery_champions.sql` and migration metadata -- added default-model invariant constraints from review fixes.
- `drizzle/migrations/0008_sharp_pride.sql` and migration metadata -- added usage pricing snapshot fields, cache-write token metadata, and pricing currency constraints.
- `src/db/schema.ts` -- added AI Gateway model schema and usage cost snapshot fields.
- `src/features/admin/actions.ts` -- added audited admin/operator catalog mutation actions and invariant validation.
- `src/features/ai/ask-gate.ts` -- resolved AI Ask model selection from catalog and propagated pricing snapshots to usage events.
- `src/features/ai/gateway.ts` -- accepted selected model from caller and parsed cached prompt token metadata.
- `src/features/ai/models.ts` -- added server-only model selection and integer micro-unit cost estimation helpers.
- `src/features/ai/prompts.ts` -- removed hard-coded model export from orchestration path.
- `src/features/usage/events.ts` -- persisted catalog/pricing/cost snapshot fields on usage events.
- `tests/ai-ask-shell.test.ts` -- updated AI Ask flow tests for catalog-selected model and cost snapshots.
- `tests/ai-models.test.ts` -- added catalog, pricing, constraints, admin action, and invariant tests.

Verification performed:
- `pnpm db:generate` -- passed; generated migrations `0006_cheerful_george_stacy.sql`, `0007_jittery_champions.sql`, and `0008_sharp_pride.sql` during implementation/review fixes.
- `pnpm test:run tests/ai-models.test.ts tests/ai-ask-shell.test.ts` -- passed, 39 tests.
- `pnpm test:run` -- passed, 6 test files, 88 tests.
- `pnpm lint` -- passed.
- `pnpm typecheck` -- passed.
- `pnpm build` -- passed.

Review findings breakdown: 15 patch findings fixed across initial and follow-up review passes, 0 deferred, 1 rejected as duplicate/noise.

Follow-up review recommendation: false.

Residual risks:
- Pricing seed values are zero-cost placeholders for the current Gateway model until verified provider pricing is entered through the catalog.
