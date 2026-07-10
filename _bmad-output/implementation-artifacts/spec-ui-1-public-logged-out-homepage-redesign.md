---
title: 'Story UI.1: Public Logged-Out Homepage Redesign'
type: 'feature'
created: '2026-07-10'
status: 'ready-for-dev'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/mockups/home-logged-out.html'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/frontend-shell-implementation-notes.md'
warnings:
  - 'Artifact-only retrofit story. No application code has been changed yet.'
---

<intent-contract>

## Intent

**Problem:** The current root page is a functional MVP landing surface, but it predates the accepted logged-out homepage mockup and final UX direction. Public visitors need a simple ChatGPT/Gemini-like entry that explains XuyenViet's Vietnam road-trip AI value, exposes a sign-in-gated ask box, and preserves referral attribution without implying rewards or creating authenticated data.

**Approach:** Redesign `src/app/page.tsx` to match `home-logged-out.html`: a logged-out public homepage with focused value proposition, Google sign-in path, starter prompt chips, and a sign-in-gated ask box that redirects to authentication before any conversation, usage, retrieval, or provider work. Keep the route public and avoid loading authenticated sidebar/chat payload.

## Boundaries & Constraints

**Always:** Preserve `ref` query handling through sign-in. Keep `/` public and do not load authenticated conversations, trip projects, admin navigation, or protected data. Use Vietnamese-first copy with readable diacritics. Keep the accepted visual posture: simple public entry, familiar chat-style prompt surface, map-paper/travel trust cues, Route Green primary actions, Guide Amber guidance accents, no generic travel gradients. The ask box must be visibly gated by sign-in and must not create side effects before auth.

**Block If:** The redesign requires changing auth semantics, adding database tables, creating conversations from the public page, making provider calls, adding referral reward UI, or selecting a new design system.

**Never:** Do not create conversations, messages, retrieval rows, usage events, provider calls, web searches, source rows, reward/credit/booking/payment UI, or admin controls from the logged-out page. Do not imply public anonymous AI Ask is available.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|----------------------------|----------------|
| Public visit | `GET /` without session | Logged-out homepage renders without authenticated app sidebar or protected data | No auth lookup side effects beyond existing safe public behavior |
| Referral visit | `GET /?ref=abc` | Google sign-in CTA and gated ask submission preserve `ref=abc` through `/sign-in` | Invalid/empty ref continues normal sign-in path without visible reward UI |
| Ask box submit | Visitor enters a question and submits | User is routed to sign-in before AI Ask can continue | No conversation, usage event, retrieval, or provider call is created |
| Mobile public visit | Narrow viewport | Value proposition, sign-in CTA, ask box, and starter chips remain readable and reachable | No horizontal overflow or hidden primary action |

</intent-contract>

## Code Map

- `src/app/page.tsx` -- Update the public logged-out homepage and referral-preserving sign-in links.
- `src/app/sign-in/page.tsx` -- Verify current `next`/`ref` handling still supports homepage gated entry; change only if needed.
- `src/features/auth/redirects.ts` and `src/features/referrals/attribution.ts` -- Reference existing referral behavior; do not duplicate referral validation in UI.
- `src/app/globals.css` -- Add or adjust only minimal global tokens/typography needed by the accepted design.
- `tests/auth-gate.test.ts` and/or `tests/referral-attribution.test.ts` -- Extend public-entry/referral assertions if existing coverage applies.
- `tests/ai-ask-shell.test.ts` -- Add static rendering assertions only if the test utilities already cover public UI.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Keep UI.1 status aligned during implementation.

## Tasks & Acceptance

**Execution:**
- [ ] `src/app/page.tsx` -- Implement the accepted logged-out homepage with Vietnamese headline, sign-in CTA, starter prompts, and sign-in-gated ask box -- align root route to `home-logged-out.html`.
- [ ] `src/app/page.tsx` -- Preserve `ref` query in all sign-in entry points, including gated ask submission -- keep referral attribution silent and non-rewarding.
- [ ] `src/app/page.tsx` -- Ensure no authenticated sidebar, conversation history, trip projects, admin nav, or protected payload is requested or rendered -- preserve public boundary.
- [ ] `src/app/globals.css` -- Introduce only necessary typography/token refinements and preserve existing map-paper background unless the mockup requires a bounded replacement -- avoid design-system churn.
- [ ] Tests -- Add/adjust assertions for public logged-out rendering, referral-preserving sign-in path, and no public AI side effects where existing test seams allow -- protect auth/referral regressions.
- [ ] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Move UI.1 through `in-progress`, `review`, and `done` as work advances -- keep BMad tracking aligned.

**Acceptance Criteria:**
- Given a logged-out visitor opens `/`, when the page renders, then they see the accepted public homepage direction with Vietnamese value proposition, Google sign-in CTA, starter prompts, and a sign-in-gated ask box.
- Given a `ref` query is present, when the visitor chooses Google sign-in or submits the gated ask box, then the referral code is preserved silently through the auth path without showing reward, credit, ranking, or payout UI.
- Given the visitor is not authenticated, when they interact with the ask box, then the app routes them to sign-in before any conversation, retrieval, usage, or provider call is created.
- Given the page renders on mobile and desktop, when keyboard or touch navigation is used, then the primary sign-in and ask-box actions remain reachable with visible focus and readable Vietnamese text.

## Design Notes

Use the accepted `home-logged-out.html` mockup as the visual reference. The page should be a public entry, not the authenticated app shell. Avoid decorative map-first UI and avoid generic travel gradients. Make the ask box feel like the future composer while making the sign-in requirement explicit.

## Verification

**Commands:**
- `pnpm test:run` -- expected: existing tests plus any new public/referral assertions pass.
- `pnpm lint` -- expected: passes.
- `pnpm typecheck` -- expected: passes.
- `pnpm build` -- expected: passes.

## Dev Agent Record

### Completion Notes

- Pending implementation.

### Verification Results

- Pending implementation.

### File List

- `_bmad-output/implementation-artifacts/spec-ui-1-public-logged-out-homepage-redesign.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
