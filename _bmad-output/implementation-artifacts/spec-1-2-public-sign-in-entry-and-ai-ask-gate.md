---
title: 'Story 1.2: Public Sign-In Entry And AI Ask Gate'
type: 'feature'
created: '2026-07-06'
status: 'done'
baseline_revision: 'fa3fbe6954720327344fdb87267154ff0049b7d3'
final_revision: 'fa3fbe6954720327344fdb87267154ff0049b7d3'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** The public MVP entry exists, but it only has placeholder anchors. Travelers need a visible Google sign-in path to AI Ask, and AI Ask must fail closed server-side until real Auth.js login arrives in Story 1.3.

**Approach:** Add a public sign-in presentation route, a protected AI Ask route that resolves auth server-side, and a guarded AI Ask submission seam that authenticates before any future conversation, context, retrieval, or AI work.

## Boundaries & Constraints

**Always:** Keep `/` and `/sign-in` public. Keep `/ai-ask` and AI Ask submission checks server-side. Use existing `getAuthenticatedSession()` as the only auth seam. Preserve Vietnamese-first copy, map-paper visual direction, and accessible focus/touch targets. Keep protected paths fail-closed while the session stub returns `null`.

**Block If:** Implementation requires real OAuth, an email allowlist decision, DB auth/session tables, fake test login bypasses, or a persistent conversation/context schema to satisfy the story.

**Never:** Do not add Auth.js, Google OAuth handlers, OAuth callbacks, provider secrets, user/account/session tables, chat/trip persistence, retrieval calls, AI provider calls, usage recording, referral rewards, booking/payment/maps UI, query-param auth bypasses, or local-only production bypasses.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Public entry | Unauthenticated visitor opens `/` | Page loads and presents Google sign-in as the path to AI Ask | No auth lookup or error required |
| Sign-in presentation | Visitor opens `/sign-in` | Public page explains Google sign-in path and clearly says real Google login is coming in Story 1.3 | No OAuth attempt or secret/provider details |
| AI Ask route blocked | `getAuthenticatedSession()` returns `null` on `/ai-ask` | Route redirects or blocks before chat/context/retrieval/AI work | Safe Vietnamese gate via `/sign-in?next=/ai-ask` |
| AI Ask route future-ready | `getAuthenticatedSession()` later returns a user | Route renders minimal authenticated AI Ask placeholder and can reference the resolved user safely | No provider call or persistence yet |
| AI Ask submit blocked | Unauthenticated submit calls guarded server entrypoint | Throws or rejects before protected action body runs | No conversation, context, retrieval, or AI side effect |

</intent-contract>

## Code Map

- `src/app/page.tsx` -- existing public landing page and primary CTA.
- `src/app/sign-in/page.tsx` -- new public sign-in presentation route.
- `src/app/ai-ask/page.tsx` -- new server-rendered protected AI Ask route gate.
- `src/features/ai/ask-gate.ts` -- new server-only AI Ask submission seam for future chat implementation.
- `src/server/auth.ts` -- existing server-only session resolver stub, currently fail-closed.
- `src/server/mutations.ts` -- existing authenticated server mutation guard.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- story status tracking.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/page.tsx` -- Change the primary CTA to `/sign-in` and update MVP status copy to make Google sign-in the explicit path to AI Ask while preserving the public route and visual style.
- [x] `src/app/sign-in/page.tsx` -- Add a public Vietnamese-first sign-in presentation page with a non-functional Google sign-in control that clearly defers real OAuth to Story 1.3 and links to `/ai-ask` for the protected gate.
- [x] `src/app/ai-ask/page.tsx` -- Add a server component that calls `getAuthenticatedSession()` before rendering AI Ask; redirect unauthenticated users to `/sign-in?next=/ai-ask`, and render only a minimal future-ready authenticated placeholder when a session exists.
- [x] `src/features/ai/ask-gate.ts` -- Add a server-only guarded submit function using `runAuthenticatedMutation()` so unauthenticated submissions fail before any future AI Ask side effect.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Move Story 1.2 through `in-progress`/`review`/`done` as work completes.
- [x] `_bmad-output/implementation-artifacts/spec-1-2-public-sign-in-entry-and-ai-ask-gate.md` -- Record completion notes, verification results, review triage, and file list.

**Acceptance Criteria:**
- Given a user is not signed in, when they open the public app entry route, then it is accessible without email allowlist validation and presents Google sign-in as the path to AI Ask.
- Given a user is not signed in, when they attempt to open AI Ask or submit an AI question, then access is blocked or redirected to sign-in and no conversation, chat/trip context, retrieval, or AI provider call is created.
- Given a user is signed in with Google in a later story, when they open AI Ask, then the route can resolve the authenticated user server-side and render the AI Ask placeholder without adding client-only authorization.

## Spec Change Log

## Review Triage Log

### 2026-07-06 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 7: (high 1, medium 5, low 1)
- defer: 0
- reject: 3: (high 1, medium 1, low 1)
- addressed_findings:
  - `[high]` `[patch]` Preserved `ref` from `/` to `/sign-in`, from `/sign-in` to `/ai-ask`, and from `/ai-ask` redirects back to `/sign-in` so referral attribution is not dropped before Story 1.7.
  - `[medium]` `[patch]` Made `/sign-in` consume and validate `next=/ai-ask` enough to show a calm protected-route gate message after an unauthenticated AI Ask redirect.
  - `[medium]` `[patch]` Preserved `ref` when the sign-in page links to `/ai-ask`, avoiding parameter loss during the protected-gate loop.
  - `[medium]` `[patch]` Changed the non-functional Google control from `aria-disabled` only to a real disabled button.
  - `[medium]` `[patch]` Added basic guarded-submission validation for trimmed empty questions and questions longer than 2000 characters after authentication succeeds and before the future placeholder result.
  - `[medium]` `[patch]` Reran `pnpm lint`, `pnpm typecheck`, and `pnpm build` after review patches.
  - `[low]` `[patch]` Marked sprint status and spec completion bookkeeping done.
  - rejected: Untracked-file release risk is outside code correctness for this workflow because repository instructions prohibit staging/committing unless explicitly requested.
  - rejected: Missing auth-gate automated tests are not required in this repository yet because no test framework exists and project context says not to invent one casually.
  - rejected: Intermediate status mismatch existed only during the active review step and was resolved during finalization.

## Verification

**Commands:**
- `pnpm lint` -- passed with no ESLint errors.
- `pnpm typecheck` -- passed with strict TypeScript.
- `pnpm build` -- passed; production build succeeded for `/`, `/sign-in`, and `/ai-ask`.

## Auto Run Result

Status: done

Summary of implemented change:
- Implemented Story 1.2 public sign-in entry and AI Ask gate without adding real OAuth, persistence, retrieval, or AI provider behavior.
- `/` remains public and points travelers to `/sign-in`, preserving `ref` when present.
- `/sign-in` is a public Vietnamese-first Google sign-in presentation route with a real disabled placeholder button and blocked-AI-Ask feedback when redirected from `/ai-ask`.
- `/ai-ask` resolves auth server-side and redirects unauthenticated users to `/sign-in?next=/ai-ask`, preserving `ref` when present.
- `submitAiAsk()` is a server-only guarded submit seam that authenticates before validating and returning a future placeholder result.

Files changed:
- `src/app/page.tsx` -- Updated primary CTA/copy and preserved referral parameter into sign-in.
- `src/app/sign-in/page.tsx` -- Added public sign-in presentation, blocked-gate message, disabled Google placeholder, and referral-aware AI Ask link.
- `src/app/ai-ask/page.tsx` -- Added server-side AI Ask gate and unauthenticated redirect.
- `src/features/ai/ask-gate.ts` -- Added server-only authenticated submission seam with basic input validation.
- `_bmad-output/implementation-artifacts/epic-1-context.md` -- Added compiled Epic 1 context cache required by dev-auto.
- `_bmad-output/implementation-artifacts/spec-1-2-public-sign-in-entry-and-ai-ask-gate.md` -- Added dev-auto spec, review triage, verification, and result details.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Marked Story 1.2 done.

Review findings breakdown:
- Patches applied: 7.
- Items deferred: 0.
- Items rejected: 3.

Follow-up review recommendation: false.

Verification performed:
- `pnpm lint`: passed.
- `pnpm typecheck`: passed.
- `pnpm build`: passed.

Residual risks:
- Real Google OAuth, persisted sessions, and the reachable authenticated AI Ask branch still depend on Story 1.3.
- No automated route tests exist because this repository has no test framework yet.
- No commit was created because commits require explicit user request in this environment.
