---
title: 'Complete admin direct API ownership'
type: 'feature'
created: '2026-08-03'
status: 'done'
baseline_revision: 'fdf5fc1f'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-14-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/planning-artifacts/epics.md'
warnings: [multiple-goals]
---

<intent-contract>

## Intent

**Problem:** Root `/admin` and the separately deployed `apps/admin` BFF still own operational reads and mutations through Auth.js, private bearer credentials, Next route handlers, and root direct-database feature modules. This violates Epic 14's direct browser API ownership model.

**Approach:** Move every operational capability to typed, admitted Nest `/v1/admin` APIs and make `apps/admin` a direct presentation client, then remove each matching root and BFF owner without dual writers, fallbacks, or raw operational-data disclosure.

## Boundaries & Constraints

**Always:** Nest owns direct-browser opaque sessions, CSRF, Origin admission, and `RequestPrincipal` creation. Preserve current authorization, exact server-side capability checks, safe API envelopes, state-machine/audit/transaction/concurrency behavior, and modular boundaries. Browser clients receive no bearer, BFF, service, database, or provider credentials. Every completed capability has exactly one transport writer and stable validated request/response contracts.

**Block If:** A remaining root operational capability has no reviewed package-owned direct API replacement, or removing its BFF/root owner would change existing operation semantics. The clean-break topology is approved: `apps/admin` uses the Nest browser session, configured allowed admin origin, Nest CSRF endpoint, and a new Nest OAuth session; legacy admin BFF sessions are not adopted.

**Never:** Do not preserve a root `/admin` server action, Next route-handler BFF, private bearer bridge, direct database import, transport selector, shadow read, fallback, or dual writer for a migrated capability. Do not expose raw source material, provider data, auth internals, or operator-only data beyond established safe projections.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|---------------------------|----------------|
| Direct operational command | Live Nest browser session, permitted current role, exact allowed Origin, valid session-bound CSRF, valid versioned request | Nest performs the single established owner-scoped operation and returns a validated safe projection | Missing/stale role, invalid Origin/CSRF, malformed input, or stale concurrency data fails before domain work without a legacy retry |
| Operational read | Permitted current role and bounded validated query | Nest returns a stable ordered, paginated, traveler-safe/operator-safe projection | Unauthorized, invalid, or expired input returns the safe API envelope without internal or raw data |
| Legacy ownership retirement | Direct replacement is admitted and verified | Matching root route/action/BFF owner is removed; `apps/admin` uses only the direct API | No compatibility bridge, dual writer, shadow-selected response, or fallback remains |

</intent-contract>

## Investigation Evidence

- `apps/admin` currently uses host-only BFF sessions, BFF CSRF, private handoff, short-lived `xuyenviet-admin-bff` bearer credentials, and Next API route handlers for workspace and user-role operations.
- `apps/api/src/auth/admin-capability.guard.ts` currently accepts only `bff_bearer` principals from `xuyenviet-admin-bff`; it rejects the Nest browser-session principal required by Epic 14.
- Nest currently exposes only the non-disclosing workspace bootstrap and exact-admin user-role governance APIs. It has no API contracts/controllers/package-owned ports for overview, AI model management, knowledge source/capture/review/recommendation/coverage operations, or quality projections.
- Root `/admin` remains the active domain owner for those capability families through Auth.js, Server Actions, root feature modules, and direct database access. `apps/api` and `apps/admin` may not import these root business modules.
- `packages/contracts/src/index.ts` defines only `admin.workspace.read`, `admin.role.governance`, and `admin.ai-model-catalog.write`. The existing root role behavior generally allows `operator | admin`, while user governance and model catalog are exact-admin; no authoritative per-operation role matrix exists.

## Partial Clean-Break Progress

- `apps/admin/app/users/user-roster.tsx` now calls Nest directly with credentialed browser requests: `/v1/admin/users` for reads, `/auth/csrf` for the session-bound proof, and direct role commands with `X-XuyenViet-CSRF`. Unauthenticated users start Nest OAuth and return to `/users`.
- `apps/api/src/auth/admin-capability.guard.ts` now admits a current Nest browser-session principal for `admin.role.governance`, while retaining BFF-only admission for capability families not yet migrated.
- Removed the corresponding `apps/admin` user BFF routes and `apps/admin/server/users.ts`, leaving no legacy route or private bearer adapter for roster and role commands.
- Focused direct cutover verification passed: 7 user-management tests, 29 browser-session API integration tests, API/admin typechecks, admin production build, and `git diff --check`.
- AI Gateway model catalog slice: package contracts define the safe catalog projection and mutation input; `@xuyenviet/domain` owns catalog policy through an `AdminAiModelCatalogPort`; the PostgreSQL adapter preserves live exact-admin verification, transactions, default replacement, archive semantics, and audit records.
- Nest now owns `GET/POST/PUT /v1/admin/ai-models` and `POST /v1/admin/ai-models/:id/default|archive` behind browser-session Origin/CSRF admission and exact `admin.ai-model-catalog.write` capability admission. `apps/admin/ai-models` calls that API directly and uses the Nest OAuth/CSRF conventions.
- Retired only the matching root catalog page and feature/action owners: `src/app/admin/ai-gateway/page.tsx`, `src/features/admin/ai-gateway.ts`, and `src/features/admin/actions.ts`. Root admin navigation no longer links to the retired catalog.
- Admin Overview slice: package contracts now define an aggregate-only overview projection; `@xuyenviet/domain` owns the read port; and the PostgreSQL adapter owns the existing overview aggregate and active-evidence-grounded coverage rules. The projection contains counts and bounded aggregate breakdowns only, never source/card IDs, URLs, raw material, or card text.
- Nest now owns `GET /v1/admin/overview` behind `admin.workspace.read`. Browser-session admission is narrowly enabled for this capability, so current `operator | admin` sessions may read it while the existing BFF transport remains available for unmigrated workspace/runtime paths.
- `apps/admin/` now renders the overview through a credentialed direct request to `NEXT_PUBLIC_API_ORIGIN`, validates the response contract, and starts Nest OAuth on `401`. Retired only the matching root overview owners: `src/app/admin/page.tsx` and `src/features/admin/overview.ts`.
- Knowledge intake/removal slice: `admin.knowledge.write` admits `operator | admin`; only `GET /v1/admin/knowledge/intake`, `POST /v1/admin/knowledge/seed-batches`, and `POST /v1/admin/knowledge/sources/:sourceId/removal` opt into Nest browser sessions. Package contracts strictly bound and parse safe source, batch, and removal projections without raw material, metadata, storage, provider, or credential fields.
- `@xuyenviet/domain` now owns the intake port and principal-based policies. `@xuyenviet/database` owns batch persistence and source removal, retaining transaction-coupled audit, provenance withdrawal, index invalidation/queue, source canonicalization, and payload scrub behavior. The list reads only source labels and redacted URLs; it never reads raw capture text or metadata for display.
- `apps/admin/knowledge/intake` is a direct credentialed browser client using Nest OAuth and `/auth/csrf`; its URL display is redacted client-contract data only. Retired the matching root intake page, modal, batch action, removal form action, and root navigation item. Root `batch-intake`, `sources`, and `source-removal` modules remain because quality/readiness, extraction-worker, and evidence-withdrawal workflows still use them.

## Completed Clean-Break Inventory

- Guides are now static presentation routes owned by `apps/admin`: `/guides`, `/guides/data-flow`, `/guides/data-states`, and `/guides/operating-routine`. Their operational links are same-origin admin routes, the root `/admin/guides` presentation tree is retired, and root navigation points to the deployed admin guide hub. No API replacement is required.
- Nest `/v1/admin/workspace` now explicitly permits the direct Nest browser session for current `operator | admin` roles. The admin BFF bearer issuer is removed from contracts, config parsing, resource admission, and capability guards.
- Retired `apps/admin` workspace, auth callback/CSRF/logout, sign-in route, BFF adapter, identity, CSRF, and cookie modules. The only retained admin API route is static `{ ready: true }` process health required by Compose.
- Retired API `AdminIdentityController`, service-token injection, admin OAuth/session handoff repository methods, admin issuer verifier configuration, and startup environment requirements. The retained web BFF issuer remains unchanged.
- Admin OAuth return URLs are static exact configured pages. Detail screens return to their corresponding queue/library route, never a dynamic identifier path.
- Facebook capture queue/detail slice is now package-owned: safe bounded contracts, the `AdminFacebookCapturePort`, PostgreSQL adapter, and direct Nest browser-session endpoints own queue/detail, canonical ingestion rerun, and recapture. The root queue/detail pages and those two root form writers are retired. The retained root Facebook review state machine continues to serve legacy reject/reopen callers only.
- Direct projections intentionally omit raw source text, AI discovery responses, raw metadata, storage fields, provider payloads, and browser artifacts. Queue membership, counts, and ordering remain canonical ingestion-job-stage led, while a missing job is projected as an explicit operational state.
- YouTube capture review queue/detail slice is now package-owned and read-only: safe bounded contracts, `AdminYoutubeCapturePort`, PostgreSQL evidence projection, and direct Nest browser-session endpoints replace the root queue/detail pages and `youtube-capture-review-admin.ts`. Queue eligibility retains the root requirement for a current YouTube capture using `gemini_youtube_url` with valid bounded evidence, including hydrate-before-pagination/count behavior. Capture and ingestion scripts/workers remain their existing external owners.
- Knowledge draft review and recommendation state semantics are now package-owned prerequisites for the remaining direct APIs. `@xuyenviet/database` owns the complete canonical review reads/mutations, index readiness, sampling/readiness evidence, recommendation queue/resolution, verification-promotion candidates/jobs, and high-severity cohort containment; `@xuyenviet/domain` owns the draft-review policy error. Root review/recommendation modules are temporary authorization/compatibility adapters only, with no duplicate persistence or state-machine implementation. The quality dashboard now imports sampling readiness directly from `@xuyenviet/database`.
- Draft review, approved-library, and recommendation queue/detail/resolve now have direct `apps/admin` browser-session clients and Nest `admin.knowledge.write` endpoints. Requests and responses use strict package contracts; browser projections exclude source captures, provider/prompt/storage/metadata/auth/audit data, and recommendation evidence remains bounded to four 500-character excerpts. The matching root pages and form-action callers have been retired, while root semantic modules remain only for non-admin workers and quality/readiness reads.

## Verification Status

Status: `done`

Verification completed 2026-08-03:

- Focused serial suites passed: `tests/bff-credentials.test.ts`, `tests/browser-identity.integration.test.ts`, `tests/admin-workspace-browser.integration.test.ts`, `tests/admin-boundary.test.ts`, and `tests/admin-user-management.test.ts` (47 tests).
- `pnpm typecheck` passed.
- `pnpm build` passed for root web, admin, API, and worker.
- `git diff --check` passed.
- Static inventory found no remaining admin BFF issuer, handoff/service token, admin session/OAuth repository flow, old Next route handler, admin server bridge import, or dynamic OAuth return URL. The retained web BFF issuer/credential path remains covered by `tests/bff-credentials.test.ts`.

Known non-blocking output: the admin production build reports two pre-existing `react-hooks/exhaustive-deps` warnings in `app/knowledge/review-client.tsx`. No global test suite was run because integration files share a single physical database; the focused integration suite was run serially.
