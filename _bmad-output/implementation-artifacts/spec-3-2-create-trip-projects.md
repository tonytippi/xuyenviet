---
title: 'Create Trip Projects'
type: 'feature'
created: '2026-07-07'
status: 'done'
review_loop_iteration: 1
followup_review_recommended: false
baseline_revision: '2573d0fbb22966884e4d8000b83d7ada37e28aa1'
final_revision: 'COMMITTED_BY_USER_REQUEST'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Travelers can keep separate chat sessions, but they cannot create a durable trip project that groups planning for one trip and establishes a visible project scope for future context extraction and retrieval.

**Approach:** Add an owner-scoped Trip Projects data model, server entrypoints for create/list/read, and an AI Ask project selector/create flow that links new project-scoped conversations to the selected project. Keep context extraction and context-aware answers for later stories.

## Boundaries & Constraints

**Always:**
- Every trip project read and mutation must resolve the authenticated user server-side and scope by `userId`; cross-user or missing projects return `null` or a safe validation error without exposing project data.
- Store the MVP basic trip fields as nullable text/date-ish fields: `title`, `origin`, `destination`, `startDate`, `endDate`, `travelers`, `notes`, plus owner and timestamps. Title is required and trimmed.
- Link related chat sessions through a nullable `conversations.tripProjectId` with an owner-scoped FK. A new chat created while a project is selected is linked to that project; unrelated existing chats are not auto-promoted into a project.
- Project creation is a protected audited mutation with non-sensitive audit summaries.
- UI copy is Vietnamese-first and must show when the user is planning in ordinary chat versus inside a selected trip project.

**Block If:**
- Implementing the owner-scoped project link requires deciding Story 3.7's linked-chat delete-vs-detach behavior beyond a nullable detach-friendly FK.
- The app cannot add a Drizzle migration for `trip_projects` and `conversations.trip_project_id`.

**Never:**
- No automatic context extraction, project-context memory updates, embeddings, retrieval, source/provenance changes, deletion flows, project editing, sharing, collaboration, booking, payments, rewards, or Google Maps.
- Do not attach an already-linked conversation to a different project or use a selected project owned by another user for provider calls.
- Do not create empty chat conversations when creating a project; conversation creation remains lazy on first AI Ask message.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Create project | Authenticated user submits title and optional basic fields | Project row is stored with owner, trimmed fields, timestamps, and audit event | Invalid title throws a safe validation error before insert |
| List/open own projects | Authenticated user has projects | User sees only their project list ordered by recent update and can select one as active scope | No error expected |
| Open another user's project | `tripProjectId` belongs to someone else | Page falls back to ordinary chat/new-chat state; no project data appears | Silent fallback, no data exposure |
| Ask inside selected project | User submits a new AI Ask message with own `tripProjectId` and no `conversationId` | Stream route validates project ownership before provider call and creates the new conversation linked to that project | Invalid/cross-user project returns stream error with no provider call or message |
| Continue linked chat | User submits follow-up in a conversation already linked to same project | Message continues in that conversation and project scope remains visible | No error expected |
| Project/conversation mismatch | User submits own `conversationId` linked to a different project with selected `tripProjectId` | Request is rejected before provider call to avoid cross-project hijacking | Stream error, no new message/provider call |

</intent-contract>

## Code Map

- `src/db/schema.ts` -- add `tripProjects` table and nullable `conversations.tripProjectId` with owner-scoped FK/indexes/checks.
- `drizzle/migrations/*` -- generated migration for the new project table and conversation link.
- `src/features/chat-trips/trip-projects.ts` -- new server-only owner-scoped create/list/read helpers and project summary formatting.
- `src/app/ai-ask/page.tsx` -- read `tripProjectId`, load own project/list, preserve auth redirect and cross-user fallback, pass project props to composer.
- `src/features/ai/ai-ask-composer.tsx` -- render project selector/create form, preserve pending-stream guards, include active `tripProjectId` in stream requests, and keep new-chat navigation inside selected project.
- `src/app/api/ai-ask/stream/route.ts` -- validate selected project ownership before side effects/provider call and link newly created conversations to that project; reject mismatches.
- `tests/trip-projects.test.ts` -- owner-scoped project create/list/read and audit coverage.
- `tests/ai-ask-shell.test.ts` -- stream/page coverage for selected project ownership, project-linked conversation creation, and cross-user rejection.

## Tasks & Acceptance

**Execution:**
- [x] `src/db/schema.ts` -- add `tripProjects` with owner/title/basic trip fields/timestamps and add nullable `conversations.tripProjectId` owner-scoped to `tripProjects` -- stores projects and related chat linkage safely.
- [x] `drizzle/migrations/*` -- generate and keep the migration metadata for the schema change -- makes the persistent model reproducible.
- [x] `src/features/chat-trips/trip-projects.ts` -- add `createTripProject`, `listOwnedTripProjects`, `getOwnedTripProject`, and `getOwnedTripProjectSummary` helpers with server auth, validation, owner scoping, and audited create -- gives UI/API one owned command module.
- [x] `src/app/ai-ask/page.tsx` -- support `tripProjectId` search param, load selected own project and project list, and pass them to the composer while preserving existing `conversationId` behavior -- makes project scope visible without exposing cross-user data.
- [x] `src/features/ai/ai-ask-composer.tsx` -- add a compact Vietnamese project selector/create panel, active project banner, project-aware new-chat/select-session navigation, pending-state guards, and `tripProjectId` form submission -- delivers create/open/continue-in-scope UX.
- [x] `src/app/api/ai-ask/stream/route.ts` -- validate selected project ownership before any message/provider side effects, link new conversations to the selected project, and reject conversation/project mismatches -- enforces trip scope on the server.
- [x] `tests/trip-projects.test.ts` -- add tests for unauthenticated create failure, audited authenticated create, list/read owner scoping, cross-user null, validation, and related chat summaries -- locks data security and basic behavior.
- [x] `tests/ai-ask-shell.test.ts` -- add tests for `/ai-ask?tripProjectId=...` own/cross-user rendering and stream route project-scoped conversation creation/rejection -- locks integration behavior.

**Acceptance Criteria:**
- Given an authenticated user wants to plan a trip, when they create a trip project, then the project is stored with an owner, title, basic trip fields, and an audit event.
- Given a user has trip projects, when they view AI Ask, then they can see/select only their own projects and a selected project visibly scopes planning.
- Given a trip project exists, when the owner asks a new AI Ask question inside it, then the new conversation is linked to that project and appears as a related chat session.
- Given a user attempts to open or use another user's trip project, when the request reaches the server, then no project data is exposed and no provider call or message is created.

## Spec Change Log

Empty — no bad_spec loopback occurred.

## Review Triage Log

### 2026-07-07 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4: (high 2, medium 2, low 0)
- defer: 0
- reject: 0
- addressed_findings:
  - `[high]` `[patch]` Fixed `conversations_trip_project_owner_fk` delete behavior by adding a follow-up migration that recreates the FK with `ON DELETE SET NULL (trip_project_id)` and added a regression test proving project deletion detaches conversations without clearing owner.
  - `[high]` `[patch]` Fixed mismatched owned `conversationId` + `tripProjectId` rendering by validating the pairing in `src/app/ai-ask/page.tsx` and added a page regression test.
  - `[medium]` `[patch]` Fixed project-linked conversations appearing as ordinary chats by excluding linked conversations from ordinary session listing, inferring project scope when opening a linked conversation, and rejecting linked-conversation stream continuation without project scope.
  - `[medium]` `[patch]` Reduced trip-project creation audit summaries to non-sensitive metadata flags/lengths and added a regression assertion that route/date/title content is not copied into audit logs.

### Review Findings (2026-07-07 — pass 2, follow-up)

Triaged from Blind Hunter + Edge Case Hunter + Acceptance Auditor. Acceptance Auditor found no new spec violations; all 4 prior-pass findings verified resolved. 0 decision-needed, 15 patch, 4 defer, 3 dismissed.

**Pass 2 outcome:** all 15 patches applied and verified — `pnpm lint`, `pnpm typecheck`, `pnpm test:run` (116 tests, +1 happy-path continuation test), `pnpm build` all pass. Deferred items logged to `deferred-work.md`. Status remains `done`.

- [x] [Review][Patch] Migration 0012 is redundant (0011 already has `ON DELETE SET NULL`) and its `0012_snapshot.json` is missing while the journal lists idx 12 — breaks drizzle-kit integrity [drizzle/migrations/0012_fix_trip_project_owner_fk.sql, drizzle/migrations/meta/_journal.json] (high)
- [x] [Review][Patch] No server-side length validation on trip-project text fields; client `maxLength={160}` on title is unenforced server-side, other fields have no cap; a crafted request can store ~1MB per field (Server Action default body cap) [src/features/chat-trips/trip-projects.ts:155-171] (medium)
- [x] [Review][Patch] No date format or `startDate <= endDate` validation; any string (e.g. `"abc"`, `"2026-13-99"`, inverted range) persists and will break Stories 3.3/3.4 context extraction [src/features/chat-trips/trip-projects.ts:166-167] (medium)
- [x] [Review][Patch] `streamAnswer` outer `catch {}` swallows errors with no server-side logging; specific throw causes (project-scope violation, FK error) vanish without a trace [src/app/api/ai-ask/stream/route.ts:328] (medium)
- [x] [Review][Patch] `createTripProjectFromForm` has no error handling; a whitespace-only title or expired session surfaces as an opaque Next.js error boundary instead of a form error / sign-in redirect [src/features/chat-trips/actions.ts:7-18] (medium)
- [x] [Review][Patch] English error message at the project-ownership guard violates Vietnamese-first UX; surfaces to the user via `payload?.error` [src/app/api/ai-ask/stream/route.ts:76] (medium)
- [x] [Review][Patch] `notes` and other unused trip fields are shipped to the client in `selectedTripProject`/`initialTripProjects` though the composer only reads id/title/origin/destination [src/app/ai-ask/page.tsx:105-114, src/features/chat-trips/trip-projects.ts:76-91] (low)
- [x] [Review][Patch] `getOwnedTripProjectSummary` resolves the authenticated session up to 3x per call (and page.tsx can call it 2x per render) [src/features/chat-trips/trip-projects.ts:119-121] (low)
- [x] [Review][Patch] `page.tsx` project/conversation resolution is split across two disjoint `if` blocks — consolidate for readability/maintainability [src/app/ai-ask/page.tsx:52-62] (low)
- [x] [Review][Patch] `formatTripProjectAuditSummary` omits `hasTravelers`/`hasNotes` while recording other field-presence flags — inconsistent audit shape [src/features/chat-trips/trip-projects.ts:179-187] (low)
- [x] [Review][Patch] `formatTripProjectLabel` is duplicated between the server module and the client composer — extract to a shared non-server module to prevent drift [src/features/chat-trips/trip-projects.ts:149-153, src/features/ai/ai-ask-composer.tsx:807] (low)
- [x] [Review][Patch] No test covers the happy path of continuing an existing project-scoped conversation with its matching `tripProjectId` (only rejection/mismatch cases are tested) [tests/ai-ask-shell.test.ts] (low)
- [x] [Review][Patch] Create-project form has no submission loading state; `isPending` tracks the chat stream, not the Server Action — invites duplicate submits [src/features/ai/ai-ask-composer.tsx:480-497] (low)
- [x] [Review][Patch] `createTripProjectFromForm` coerces `formData.get(...)` via `String()`; a multipart File field becomes `"[object File]"` and is stored as the title [src/features/chat-trips/actions.ts:9-15] (low)
- [x] [Review][Patch] `listOwnedTripProjects` and `getOwnedTripProjectSummary` have no `LIMIT`; a user with many projects/conversations loads unbounded rows [src/features/chat-trips/trip-projects.ts:76-90, 127-132] (low)
- [x] [Review][Defer] Conversations can never be re-associated with a project after orphaning (project deleted → `tripProjectId` null); no update path exists [src/app/api/ai-ask/stream/route.ts:149-155] — deferred to Story 3.7 / future edit story
- [x] [Review][Defer] `tripProjects.updatedAt` has no DB trigger; relies on manual `.set()` which a future update story could forget [src/db/schema.ts:181] — deferred, no update op in 3.2
- [x] [Review][Defer] TOCTOU race: a linked conversation's project deleted between the two reads in `page.tsx` leaves the conversation hidden from both lists and blocked on reply [src/app/ai-ask/page.tsx:52-62] — deferred to Story 3.7 delete story
- [x] [Review][Defer] Pre-existing English error messages in the stream route (auth/question-length guards) pre-date 3.2 [src/app/api/ai-ask/stream/route.ts:25,48] — deferred, pre-existing

Dismissed (3): `startDate`/`endDate` stored as `text` (intentional per spec "date-ish text fields"); empty-string `trip_project_id` (app only writes null via Drizzle); PG 14 column-list `SET NULL` syntax (target is Neon PG 15+).

## Verification

**Commands:**
- `pnpm db:generate` -- expected: migration generated for `trip_projects` and `conversations.trip_project_id`.
- `pnpm lint` -- expected: no lint errors.
- `pnpm typecheck` -- expected: no type errors.
- `pnpm test:run` -- expected: all tests pass, including new trip project coverage.
- `pnpm build` -- expected: successful production build.

## Auto Run Result

**Summary:** Implemented Story 3.2 — Create Trip Projects. Added an owner-scoped trip project data model, audited project creation, project list/read helpers, AI Ask project selector/create UI, project-scoped conversation linking, and server-side guards for cross-user and cross-project misuse. Review pass fixed FK deletion behavior, mismatched URL rendering, ordinary/project chat scope leakage, and over-detailed audit summaries.

**Files changed:**
- `src/db/schema.ts` -- added `tripProjects` and nullable owner-scoped `conversations.tripProjectId`.
- `drizzle/migrations/0011_chunky_the_twelve.sql` -- generated trip project table/conversation link migration.
- `drizzle/migrations/0012_fix_trip_project_owner_fk.sql` -- fixes already-applied/fresh FK behavior so deleting a project only nulls `trip_project_id`.
- `drizzle/migrations/meta/_journal.json` and `drizzle/migrations/meta/0011_snapshot.json` -- migration metadata.
- `src/features/chat-trips/trip-projects.ts` -- new server-only create/list/read/summary helpers with owner scoping and audited create.
- `src/features/chat-trips/actions.ts` -- server action to create and select a project from AI Ask.
- `src/features/chat-trips/conversations.ts` -- returns conversation project link and excludes project-linked chats from ordinary session list.
- `src/app/ai-ask/page.tsx` -- loads selected project/project list, infers scope for linked conversations, and avoids mismatched project/conversation rendering.
- `src/features/ai/ai-ask-composer.tsx` -- renders project selector/create UI and submits active `tripProjectId`.
- `src/app/api/ai-ask/stream/route.ts` -- validates project ownership/scope before provider calls and links new conversations to selected projects.
- `tests/trip-projects.test.ts` -- project helper, audit, owner scoping, related chat, and FK detach tests.
- `tests/ai-ask-shell.test.ts` -- page and streaming route project-scope integration tests.

**Review findings breakdown:**
- Patches applied: 4 (2 high, 2 medium).
- Items deferred: 0.
- Items rejected: 0.

**Follow-up review recommendation:** true — final review found and fixed two high-impact data/scope issues plus two medium scope/audit issues across schema, routing, and server behavior.

**Verification performed:**
- `pnpm db:generate` — passed and generated Story 3.2 migration artifacts.
- `pnpm test:run tests/trip-projects.test.ts tests/ai-ask-shell.test.ts` — passed after review fixes; 48 tests passed.
- `pnpm lint` — passed.
- `pnpm typecheck` — passed.
- `pnpm test:run` — passed; 8 files, 115 tests.
- `pnpm build` — passed; `/ai-ask` route 7.81 kB.

**Residual risks:** Project edit/delete flows, context extraction, context-aware answer usage, embeddings, and retrieval remain intentionally deferred to Stories 3.3–3.7.
