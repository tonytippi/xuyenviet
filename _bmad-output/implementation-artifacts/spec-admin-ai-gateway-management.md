---
title: 'Admin AI Gateway management'
type: 'feature'
created: '2026-07-26'
status: 'done'
review_loop_iteration: 0
baseline_commit: 'fec21174a13bc8ad659dc1544560129cf5256078'
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The application persists AI Gateway model capabilities, default selection, and token-price snapshots, but administrators have no interface for viewing or maintaining that catalog. Model routing and usage-cost estimates therefore require direct database manipulation, which is error-prone and not auditable through the normal admin workflow.

**Approach:** Add a protected admin page where an administrator can inspect the model catalog and submit server-side forms to create model entries, update their configuration and token prices per 1,000,000 tokens, set an eligible active model as the default for its purpose, or archive a model. Reuse the existing audited server actions and current `ai_gateway_models` storage rather than creating new persistence.

## Boundaries & Constraints

**Always:** Keep access enforced server-side through the existing admin layout, feature queries, and audited admin mutations. Preserve Vietnamese-first, responsive, accessible UI. Show model name, display label, purpose, active/default state, declared capabilities, current token prices, pricing currency, version, and effective timestamp. Every displayed and editable token price is per 1,000,000 tokens; the pricing unit is fixed to `1_000_000` on every create/update. Admins enter a non-negative decimal monetary amount for each 1M-token price and the server converts it exactly to the existing integer-micros representation before calling the audited actions. Submit data only through existing `createAiGatewayModel`, `updateAiGatewayModel`, `setDefaultAiGatewayModel`, and `archiveAiGatewayModel` actions. Revalidate the page after mutations so the catalog shown matches the persisted state.

**Ask First:** Adding a new AI Gateway provider, storing credentials/base URLs in the database, changing model routing behavior beyond current default selection, changing the schema or migrations, importing live provider catalogs/prices, supporting a token-pricing unit other than 1,000,000, or revising the persisted micros representation.

**Never:** Expose `AI_GATEWAY_API_KEY`, provider request payloads, raw source material, or other secrets in the admin UI. Do not make browser-side calls to a gateway. Do not hard-delete model records because historic usage and knowledge rows may reference them. Do not add a client-side state library or a second model-management API.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Initial catalog | Admin opens `/admin/ai-gateway` | Server renders all model rows ordered predictably, with no secret configuration. | Empty catalog explains how to add the first model. |
| Create model | Valid metadata, purpose, capabilities, optional prices | A new active/non-default model is saved and appears after redirect/revalidation. | Existing action rejects empty names, invalid prices, or priced rows without currency. |
| Default selection | Active model satisfying purpose capability requirements | Model becomes the sole default for its purpose and previous default is cleared atomically. | Existing action rejects an ineligible model without changing the catalog. |
| Pricing update | Non-negative decimal amount per 1M tokens, currency, version, and effective time | Current model pricing snapshot is saved as integer micros with `pricingUnitTokens = 1_000_000`. | Blank optional prices remain null; more than six decimal places, invalid numbers, or values outside integer-micros bounds are rejected before mutation. |
| Archive | Existing model | Model becomes inactive and non-default while historic references remain intact. | Missing ID receives the existing safe action error. |

</frozen-after-approval>

## Code Map

- `src/app/admin/layout.tsx` -- protected navigation shell; requires a new gateway-management entry.
- `src/app/admin/ai-gateway/page.tsx` -- new server-rendered admin catalog and form surface.
- `src/features/admin/ai-gateway.ts` -- server-only catalog query and form adapters, owning page reads, decimal-per-million price conversion, and request parsing.
- `src/features/admin/actions.ts` -- audited create/update/default/archive mutation boundary already owning model validation.
- `src/db/schema.ts` -- existing `aiGatewayModels` catalog, capabilities, constraints, and pricing fields; no schema change required.
- `src/features/ai/models.ts` -- runtime selector and cost-estimation consumer of maintained catalog data.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/admin/ai-gateway.ts` -- added an exact-admin, server-only catalog reader and form adapters that parse booleans, UTC timestamps, and decimal monetary prices per 1M tokens; valid decimals convert to micros and writes fix `pricingUnitTokens` to `1_000_000`.
- [x] `src/app/admin/ai-gateway/page.tsx` -- added the Vietnamese server-rendered management page with create/edit/default/archive flows, capability indicators, price details, success/error feedback, and safe read-only handling for legacy non-1M price records.
- [x] `src/app/admin/layout.tsx` -- added the AI Gateway route to primary admin navigation.
- [x] `src/features/admin/actions.ts` -- hardened catalog actions to use exact-admin audited transactions, reject archived models as defaults, and require text input for extraction/evaluation default models to match runtime selection.
- [x] `_bmad-output/implementation-artifacts/spec-admin-ai-gateway-management.md` -- recorded implementation, verification, review outcomes, and review order.

**Acceptance Criteria:**
- Given an unauthenticated or non-admin visitor, when requesting `/admin/ai-gateway` or submitting its forms, then existing server-side guards deny access before catalog data or mutations are available.
- Given an administrator, when opening `/admin/ai-gateway`, then they can identify every configured model's purpose, state, capabilities, and current price representation without seeing credentials.
- Given valid model inputs, when an administrator creates or updates a row, then the existing action validation and audit path are used and the refreshed page shows the saved values.
- Given a compatible active model, when it is made default, then exactly one default remains for that purpose; given an incompatible or archived model, the operation fails safely.
- Given an administrator enters a valid decimal price, when the form is saved, then its exact integer-micros equivalent is persisted with a pricing unit of 1,000,000 tokens and the page displays the same money amount per one million tokens.
- Given optional prices are blank, when the form is saved, then the corresponding persisted prices are null; given a supplied price has more than six decimal places, is negative, non-numeric, or overflows the supported micros integer, then no invalid catalog state is stored.
- Given an archived model, when the action completes, then it is inactive, not default, remains visible as archived, and is not deleted.

## Design Notes

`aiGatewayModels` already owns configuration, capability gates, pricing snapshots, database constraints, and audit-aware mutations. The page should use `<form action={...}>` on server components so the browser receives neither secret configuration nor a mutation protocol. Price inputs use a decimal monetary amount per 1,000,000 tokens, for example `2.50 USD / 1 triệu input token`. The form adapter parses the decimal string without floating-point arithmetic, multiplies it by 1,000,000 micros per currency unit, rejects precision beyond six decimal places or unsafe values, and persists the existing integer micros fields with `pricingUnitTokens: 1_000_000`.

## Verification

**Commands:**
- `pnpm typecheck` -- expected: no TypeScript errors.
- `pnpm lint` -- expected: no ESLint errors.
- `pnpm test:run` -- expected: existing test suite passes.
- `pnpm build` -- expected: production build validates the new protected route and server boundaries.

**Outcome:** `pnpm typecheck` and `pnpm build` pass. `pnpm lint` completes with three pre-existing unused-variable warnings in `tests/knowledge-search.test.ts`. `pnpm test:run` remains blocked by three pre-existing failing tests: two in `tests/facebook-capture-extraction-action.test.ts` and one in `tests/trip-change-proposals.test.ts`; the focused rerun also timed out after reporting the Facebook failures. No dedicated AI Gateway tests existed in the current suite.

## Spec Change Log

- Review findings: catalog mutations were operator-accessible, archived models could be reactivated through default selection, extraction/evaluation defaults could be incompatible with runtime selection, legacy pricing units could be silently reinterpreted, timestamps were timezone-ambiguous, and malformed IDs bypassed feedback. Amended implementation to use exact-admin transactions, reject archived defaults, align default capabilities with selectors, keep non-1M legacy rows read-only, define timestamp input as UTC, and redirect malformed action submissions. Avoids unauthorized routing/cost changes, revived archived configuration, broken default resolution, incorrect future cost estimates, shifted effective dates, and unhandled form failures. KEEP: maintain server-only form actions, decimal-to-micros parsing without floating point, and no secret configuration in the UI.

## Suggested Review Order

**Authorization and model safety**

- Exact-admin transactions protect application-wide routing and cost configuration.
  [`actions.ts:44`](../../../src/features/admin/actions.ts#L44)

- Default selection rejects archived records and verifies runtime-compatible capabilities.
  [`actions.ts:144`](../../../src/features/admin/actions.ts#L144)

**Price handling**

- Decimal per-million inputs become exact persisted micros without floating-point rounding.
  [`ai-gateway.ts:117`](../../../src/features/admin/ai-gateway.ts#L117)

- Legacy pricing units remain read-only instead of silently changing usage-cost estimates.
  [`page.tsx:112`](../../../src/app/admin/ai-gateway/page.tsx#L112)

**Admin workflow**

- Server-rendered catalog binds validated form actions to model management controls.
  [`page.tsx:36`](../../../src/app/admin/ai-gateway/page.tsx#L36)

- Navigation exposes the new protected operations surface.
  [`layout.tsx:14`](../../../src/app/admin/layout.tsx#L14)
