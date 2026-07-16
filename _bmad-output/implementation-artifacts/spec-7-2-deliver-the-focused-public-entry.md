---
title: 'Deliver the Focused Public Entry'
type: 'feature'
created: '2026-07-16'
status: 'done'
baseline_revision: '4d03d5f'
final_revision: '0cd3a75'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-7-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** The public landing route has the required sign-in gate and referral handoff, but its starter prompts and compact detail preview still use text-only visual markers rather than the shared Traveler UI icon boundary.

**Approach:** Refine only the public `/` surface into the focused, icon-led warm-paper entry defined for Epic 7 while preserving its server-rendered, no-side-effect GET transition into the established sign-in and referral flow.

## Boundaries & Constraints

**Always:** Keep `/` public and free of auth, database, AI, Chat/Trips, account, admin, conversation, and project reads. Preserve the GET form action, hidden `next=/ai-ask`, conditional raw `ref`, and `draft` input so sign-in can retain public input and silent referral attribution. Use only named icons from `@/components/ui/icons`, retain visible text labels for public controls, preserve Vietnamese-first copy, visible focus, and usable small-screen layout.

**Block If:** Retaining the existing form/referral contract would prevent the required public visual migration, or the change would require modifying sign-in, OAuth, referral capture, protected route behavior, persistence, or server data access.

**Never:** Do not add a client component, new endpoints, authentication lookup, database/provider call, starter-draft behavior, sidebar, account controls, admin navigation, private data, rewards, credits, rankings, payouts, points, interactive inspector behavior, or changes to `/ai-ask` or sign-in semantics.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Public entry | Visitor opens `/` without a referral | Centered Vietnamese warm-paper hero, sign-in CTA, icon-led starters, gated ask form, and static preview render without private shell content. | No auth or AI work occurs. |
| Gated submission | Visitor submits a draft and optional referral | Browser performs GET to `/sign-in` with hidden `next`, optional `ref`, and `draft`; existing sign-in flow owns all continuation. | No conversation, retrieval, usage, persistence, or provider call is made on `/`. |
| Referral query | Duplicate, whitespace-only, or non-empty `ref` values | First non-empty value is forwarded unchanged; whitespace-only values are omitted. | Referral validity remains a silent server-side concern. |

</intent-contract>

## Code Map

- `src/app/page.tsx` -- Server-rendered public landing route and existing sign-in/referral handoff.
- `src/components/ui/icons.tsx` -- Data-free named typed SVG icon boundary established by Story 7.1.
- `tests/auth-gate.test.ts` -- Static-render regression coverage for the public route's no-private-data and sign-in handoff contracts.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Sprint tracking for Epic 7 and Story 7.2.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/page.tsx` -- Replace public-route text-only starter and preview markers with decorative named icons from the shared UI boundary; retain the existing centered warm-paper layout, visible labels, non-interactive preview, and all sign-in/referral form behavior -- completes the focused public-entry migration without changing protected behavior.
- [x] `tests/auth-gate.test.ts` -- Assert icon-led public starters and static compact preview alongside existing no-private-shell, no-reward, referral, and hidden-form-input contracts -- protects the public route against visual-system and auth-handoff regressions.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Move Story 7.2 through implementation tracking only after verification and review -- keeps sprint state accurate.

**Acceptance Criteria:**
- Given an unauthenticated visitor opens `/`, when the route renders, then it presents the Vietnamese-first centered warm-paper hero, XuyenViet brand, Google sign-in CTA, icon-led starter prompts, compact gated ask box, and static detail-inspector preview without authenticated sidebar, account, admin, chat, or project content.
- Given a visitor submits the public ask form or selects a starter, when the interaction occurs, then it enters the established sign-in path before any protected work and preserves the existing silent referral continuation contract without reward-related UI.
- Given a keyboard or small-screen visitor uses the route, when they reach public controls, then controls retain visible focus, labels, reachable target sizing, and readable Vietnamese content without an authenticated sidebar.

## Spec Change Log

## Review Triage Log

### 2026-07-16 - Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 0
- defer: 0
- reject: 0
- addressed_findings:
  - none

## Design Notes

The public page deliberately remains a server component with simple links and a GET form. The hidden form inputs are necessary because query-only form actions do not reliably retain continuation state on submission; this story must preserve that behavior rather than replacing it with client navigation.

## Verification

**Commands:**
- `pnpm test:run -- tests/auth-gate.test.ts` -- expected: public entry and protected-gate contracts pass.
- `pnpm test:run -- tests/traveler-ui-foundation.test.ts` -- expected: shared icon/root UI contracts pass.
- `pnpm lint` -- expected: no ESLint errors.
- `pnpm typecheck` -- expected: strict TypeScript succeeds.
- `pnpm build` -- expected: production build succeeds.
- `git diff --check` -- expected: no whitespace errors.

**Manual checks:**
- Inspect `/` at normal and narrow widths, at 200% zoom, and with keyboard navigation: the hero remains centered and readable, starter labels and CTA have visible focus, the preview is non-interactive, and no sidebar/private content appears.

## Auto Run Result

**Summary:** Migrated the focused public entry to the shared icon boundary while retaining its public server-rendered sign-in gate, referral forwarding, and no-side-effect behavior.

**Files changed:**
- `src/app/page.tsx` -- Renders labeled starter prompts and static detail-preview rows with shared decorative SVG icons.
- `tests/auth-gate.test.ts` -- Covers public icon markers and confirms no admin/private shell content appears.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Marks Story 7.2 complete.

**Review:** Blind adversarial and edge-case reviews found no actionable findings. No patches were required, and no items were deferred or rejected.

**Verification:** `pnpm exec vitest run tests/auth-gate.test.ts tests/traveler-ui-foundation.test.ts` passed (25 tests); `pnpm lint`, `pnpm build`, `pnpm typecheck`, and `git diff --check` passed. The first typecheck attempt failed because the focused test run left stale `.next/types` references; `pnpm build` regenerated those files and the rerun passed.

**Residual risks:** Visual checks at mobile width, 200% zoom, and reduced-motion preference remain manual. Existing public starter links intentionally enter sign-in without pre-filling a prompt, preserving prior behavior.
