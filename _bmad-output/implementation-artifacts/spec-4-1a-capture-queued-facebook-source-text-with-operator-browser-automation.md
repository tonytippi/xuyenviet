---
title: 'Story 4.1A: Capture Queued Facebook Source Text With Operator Browser Automation'
type: 'feature'
created: '2026-07-10'
status: 'ready-for-dev'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/planning-artifacts/implementation-readiness-report-2026-07-10.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-1-submit-travel-source-for-ai-reading.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-2-ai-extracts-knowledge-drafts-from-source.md'
warnings:
  - 'Playwright capture uses an operator-controlled browser profile. Do not store Facebook credentials, cookies, tokens, local storage, full HTML dumps, or hidden page data in PostgreSQL.'
  - 'Node/tsx scripts cannot import modules that import server-only. Use script-safe DB wiring instead of src/db/client.ts or server-only feature modules.'
---

# Story 4.1A: Capture Queued Facebook Source Text With Operator Browser Automation

Status: ready-for-dev

## Story

As an operator,
I want a Playwright-based operations tool to capture readable text from queued Facebook URLs,
so that Facebook sources can enter the existing AI extraction workflow without manual copy/paste for every post.

## Acceptance Criteria

1. Given Facebook sources exist with `kind=facebook` and no readable raw text, when the operator runs the capture tool with a limit or source ID, then the tool lists or selects only queued Facebook sources that still need raw text, and it does not process non-Facebook sources or sources that already have raw text unless an explicit safe override is later approved.
2. Given the capture tool opens a Facebook URL, when the operator's persistent browser profile has access to the post, then the tool extracts visible post text and safe metadata such as capture method, captured timestamp, source URL, final URL, author text when visible, and timestamp text when visible, and it does not persist cookies, access tokens, local storage, passwords, full HTML dumps, hidden page data, or browser profile data.
3. Given visible text is extracted, when the tool prepares to write to PostgreSQL, then it shows an operator confirmation preview before updating `raw_source_material.rawText`, and the operator can skip the source without changing the database.
4. Given the operator confirms the captured text, when the update is saved, then the existing `raw_source_material` row is updated with the captured raw text and safe `rawMetadata`, and the linked `sources` row remains Facebook/community/unverified with `official=false` and `partner=false` unless separately changed by an approved operator workflow.
5. Given the Facebook URL is inaccessible, blocked, expired, requires permissions the operator does not have, or selectors fail, when capture runs, then the tool records or displays a non-sensitive failure reason, and no raw text is fabricated or written.
6. Given captured raw text exists for the source, when the operator runs AI extraction, then the existing Story 4.2 extraction flow can create review-needed drafts from that source, and no draft is approved or made retrievable without human review.
7. Given capture writes to source material, when audit support is available from the operations context, then an audit event records source ID, operation identity or actor, capture method, timestamp, and before/after raw-text presence without storing captured post text in the audit summary.

## Tasks / Subtasks

- [ ] Add script-safe Facebook capture data service (AC: 1, 3, 4, 5, 7)
  - [ ] Create a knowledge-owned helper, likely `src/features/knowledge/facebook-capture.ts`, for queue selection and raw material update logic.
  - [ ] Keep this helper script-safe: do not import `server-only`, `src/db/client.ts`, `src/server/auth.ts`, `src/server/mutations.ts`, or feature files that import `server-only`.
  - [ ] Accept an explicit Drizzle DB instance or small DB writer interface so tests can pass `testDb` and scripts can pass a script-local Drizzle client.
  - [ ] Query only `sources.kind = 'facebook'` joined to `raw_source_material` where `rawText` is null or blank.
  - [ ] Support selection by `sourceId` and by `limit`; default to a small safe limit if no value is supplied.
  - [ ] Reject or skip sources that are not Facebook or already have readable raw text.
  - [ ] Update only the existing `raw_source_material` row; do not create a duplicate raw material row.
  - [ ] Guard the update with a still-queued condition (`rawText` is null or blank) so a second capture process cannot overwrite newly captured text after the preview was shown.
  - [ ] Merge safe capture metadata into `rawMetadata` without retaining browser secrets, profile paths, full HTML, cookies, local storage, or hidden data.
  - [ ] Record an audit event when an operator identity is supplied; if script auth cannot resolve a normal app session, require explicit `--actor-user-id` plus actor email or document why audit is skipped in local-only mode.
  - [ ] If writing audit from script-safe code, insert into `auditEvents` directly with `operation='update'` and `targetType='raw_source_material'`; do not import `src/features/audit/events.ts` because it imports `server-only`.

- [ ] Add Playwright operations script (AC: 1, 2, 3, 4, 5)
  - [ ] Add Playwright as a dev dependency using the current stable package (`playwright` version checked on 2026-07-10: `1.61.1`) unless a newer compatible version is current during implementation.
  - [ ] Add a package script such as `facebook:capture` that runs `tsx scripts/facebook-capture.ts`.
  - [ ] Use headed Chromium with a persistent local browser profile, e.g. `.playwright/facebook-profile`.
  - [ ] Ensure `.playwright/` is ignored by git before the script creates profile data.
  - [ ] Load DB credentials through `scripts/db-env.ts` and create a script-local `postgres` + Drizzle client, following `scripts/db-seed.ts` patterns.
  - [ ] Provide CLI flags for at least `--source-id`, `--limit`, `--yes`, and actor identity if audit requires it.
  - [ ] Navigate to `source.canonicalUrl ?? source.url`; capture `page.url()` as final URL.
  - [ ] Extract only visible post text using conservative page evaluation, not network payloads or hidden DOM scraping.
  - [ ] Capture safe metadata only: `captureMethod`, `capturedAt`, `sourceUrl`, `finalUrl`, optional visible `authorText`, optional visible `timestampText`, and non-sensitive extraction diagnostics.
  - [ ] Print a bounded text preview and require confirmation unless `--yes` is explicitly provided.
  - [ ] On inaccessible/blocked/selector failure, display a safe reason and leave DB rows unchanged.
  - [ ] Always close the Playwright browser context and database client on exit.

- [ ] Add focused tests for queue/update behavior (AC: 1, 3, 4, 5, 7)
  - [ ] Create `tests/facebook-capture.test.ts` or equivalent.
  - [ ] Reuse `tests/helpers/db.ts`, `users`, `userRoles`, `sources`, `rawSourceMaterial`, and `auditEvents` patterns from `tests/knowledge-source-intake.test.ts`.
  - [ ] Cover queued Facebook source selection where `rawText` is null.
  - [ ] Cover exclusion of non-Facebook sources and Facebook sources that already have raw text.
  - [ ] Cover successful confirmed update of existing `raw_source_material.rawText` and safe `rawMetadata`.
  - [ ] Cover stale preview/race behavior: if the row gains raw text before confirmation update, the helper must leave it unchanged and report that it was no longer queued.
  - [ ] Cover preservation of source trust fields: `sourceType='community'`, `verificationStatus='unverified'`, `official=false`, `partner=false`.
  - [ ] Cover skip/failure path that leaves DB unchanged.
  - [ ] Cover audit summary if audit support is implemented; assert captured post text is not included in audit summaries.

- [ ] Preserve existing extraction handoff (AC: 6)
  - [ ] Do not modify Story 4.2 extraction semantics except as strictly needed for the captured raw-text handoff.
  - [ ] Verify that after capture, `extractKnowledgeDraftsFromSource` still sees `rawSourceMaterial.rawText` and can run through the existing admin extraction path.
  - [ ] Do not approve drafts, create embeddings, create retrieval records, or traveler-display captured raw material in this story.

- [ ] Update docs/configuration for operator usage (AC: 2, 3, 5)
  - [ ] Add concise operator instructions either in the script help output and/or README docs section: first run opens headed browser, operator logs into Facebook manually, rerun captures queued sources.
  - [ ] Document that profile data stays local under `.playwright/facebook-profile` and must never be committed or copied into app secrets.
  - [ ] Document that broad Facebook content reuse, quoting, retention, and deletion policy remains product/legal open question for broader operations.

- [ ] Update BMad tracking (AC: all)
  - [ ] Keep this story file updated during implementation: task checkboxes, Dev Agent Record, Completion Notes, Debug Log References, File List.
  - [ ] Move `_bmad-output/implementation-artifacts/sprint-status.yaml` story key `4-1a-capture-queued-facebook-source-text-with-operator-browser-automation` through implementation statuses.

## Dev Notes

### Product Boundary

- This is a Should Have MVP operator acceleration feature, not a Must Have traveler feature. It must not block normal manual copy/paste intake. [Source: `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#6.2-Should-Have`]
- The explicit non-goal is fully automated scraping at scale or bypassing third-party access controls. The tool must be operator-assisted and use content the operator can already see. [Source: `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#3-Non-Goals`]
- Facebook-derived information remains incomplete/risky and must stay community/unverified unless an approved operator workflow later identifies an official/provider page. [Source: `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#8.5-Retrieval-Web-Search-And-Answer-Grounding`]
- Captured text is an operator-only raw source material input for Story 4.2 extraction. It must never be traveler-visible directly. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-7A-Facebook-Capture-Is-Operator-Controlled-And-Raw-Material-Only`]

### Architecture Guardrails

- Keep the MVP as a root-level Next.js modular monolith. Scripts may live in `scripts/`, but product logic still belongs to feature-owned modules under `src/features/knowledge/` when safe to import. [Source: `_bmad-output/project-context.md#Framework-Specific-Rules`]
- Every mutation of knowledge/source/raw material should be server-side/auditable where practical and owned by Knowledge. Do not export generic table upsert/delete helpers. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-6-Mutations-Are-Server-Side-And-Audited`]
- The capture tool is not part of public traveler request path and must not run from user-triggered web requests. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-7A-Facebook-Capture-Is-Operator-Controlled-And-Raw-Material-Only`]
- Do not store or persist Facebook cookies, access tokens, local storage, passwords, full HTML dumps, hidden page data, or browser profile data in PostgreSQL. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-7A-Facebook-Capture-Is-Operator-Controlled-And-Raw-Material-Only`]
- Production/operations must not store Facebook credentials in application secrets or database. Use a local operator-controlled profile only. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#Operational-Envelope`]

### Existing Code To Reuse And Preserve

- `src/features/knowledge/sources.ts` already classifies `facebook.com`, subdomains, `fb.com`, and `fb.watch` as `kind='facebook'`, strips tracking params, and defaults Facebook/community sources to `sourceType='community'`, `verificationStatus='unverified'`, `official=false`, `partner=false`. Do not duplicate or weaken these defaults. [Source: `src/features/knowledge/sources.ts`]
- `src/db/schema.ts` already has `sources` and `raw_source_material`; `raw_source_material.source_id` is unique and `raw_text` is capped at 20,000 trimmed characters by DB check. Capture must respect this limit before update. [Source: `src/db/schema.ts`]
- `src/db/schema.ts` currently defines source verification status values as `unverified | verified`; do not use architecture prose value `operator_curated` in code for this story. Preserve Facebook sources as `verificationStatus='unverified'`. [Source: `src/db/schema.ts`]
- `src/features/knowledge/actions.ts` inserts source + raw material through `runAuditedAdminMutation`; this story should not route browser capture through a public server action. [Source: `src/features/knowledge/actions.ts`]
- `src/features/knowledge/extraction.ts` requires `raw.rawText?.trim()` before AI extraction. The capture story's output is simply to make that condition true for queued Facebook sources. [Source: `src/features/knowledge/extraction.ts`]
- `scripts/db-seed.ts` and `scripts/db-env.ts` are the script patterns for reading `DATABASE_URL` and creating a script-local Drizzle client. Use these patterns because `src/db/client.ts` imports `server-only` and cannot be imported from `tsx` scripts. [Source: `scripts/db-seed.ts`, `scripts/db-env.ts`, `src/db/client.ts`]
- `recordAuditEvent` shows the desired audit shape and summary truncation, but it imports `server-only` through `src/db/client.ts`; scripts must not import it. Use a script-safe direct `auditEvents` insert or a new pure helper that accepts a DB writer. Audit summaries still must not include captured Facebook text. [Source: `src/features/audit/events.ts`]

### Script-Safe Import Warning

- `node -e "require('server-only')"` currently throws in this repo. Any operations script that imports `src/db/client.ts`, `src/server/auth.ts`, `src/server/mutations.ts`, or existing `src/features/knowledge/*` modules with `import "server-only"` will fail outside Next/Vitest aliasing. Keep shared capture data functions free of `server-only`, or place pure DB helpers in a script-safe module with explicit dependency injection.
- If the Playwright script imports a helper under `src/features/knowledge/`, that helper must also avoid importing modules that use the `@/*` alias unless `tsx` path alias resolution is verified during implementation. Existing scripts use relative imports such as `../src/db/schema`; follow that pattern for script entrypoints.
- Tests can still import script-safe helpers directly. If a helper must be server-only for app code, create a small script-local adapter instead of forcing Playwright scripts through Next server modules.

### Playwright Guidance

- Current checked package version on 2026-07-10: `playwright@1.61.1` via `pnpm view playwright version`.
- Prefer `playwright` as a dev dependency because the tool is an operations/development script, not runtime app code.
- Use persistent context only for the local browser profile. Never inspect, export, or persist browser storage state.
- Headed mode is intentional for operator visibility and manual login. Headless capture is out of scope unless a later story approves it.
- If Chromium binaries need installation, document the expected command, but do not make app build depend on a browser download.

### File Structure Requirements

- Likely new files:
  - `scripts/facebook-capture.ts`
  - `src/features/knowledge/facebook-capture.ts` or another script-safe helper under Knowledge
  - `tests/facebook-capture.test.ts`
- Likely updates:
  - `package.json` and `pnpm-lock.yaml` for Playwright and `facebook:capture`
  - `.gitignore` to ignore `.playwright/`
  - optional `.env.example` only if a new app-level env var is truly needed; avoid new env if flags are enough
  - `_bmad-output/implementation-artifacts/spec-4-1a-capture-queued-facebook-source-text-with-operator-browser-automation.md`
  - `_bmad-output/implementation-artifacts/sprint-status.yaml`
- Do not add admin UI, route handlers, cron jobs, background workers, queues, or new tables unless the implementation proves they are necessary and story scope is updated.

### Data Contract For Capture Metadata

Merge capture metadata with existing `rawMetadata`; preserve existing safe keys such as `submittedFrom` and overwrite only capture-specific keys when recapturing is explicitly allowed by future scope. Store only safe operational metadata in `raw_source_material.rawMetadata`, for example:

```json
{
  "captureMethod": "playwright_operator_browser",
  "capturedAt": "2026-07-10T00:00:00.000Z",
  "sourceUrl": "https://web.facebook.com/groups/example/posts/123",
  "finalUrl": "https://www.facebook.com/groups/example/posts/123",
  "authorText": "Visible page or author text if safely extracted",
  "timestampText": "Visible timestamp text if safely extracted"
}
```

Do not store cookies, access tokens, local storage, passwords, full HTML, hidden DOM data, screenshot images, or raw browser profile paths in `rawMetadata`.

### Testing Requirements

- Add focused unit/integration tests for queue selection and DB update logic. These should not require a real browser or Facebook.
- Do not try to automate live Facebook in the test suite.
- Use `tests/helpers/db.ts` and existing role/source setup patterns from `tests/knowledge-source-intake.test.ts`.
- For Playwright extraction itself, isolate the text-extraction function so it can be tested with controlled HTML/DOM if useful, or keep it as a manual smoke step documented in story completion notes.
- Verify failure paths leave `raw_source_material.rawText` unchanged.
- Verify captured text never appears in `audit_events.before_summary` or `audit_events.after_summary`.

### Verification Commands

- `pnpm install` if Playwright dependency changes require lockfile update.
- `pnpm test:run tests/facebook-capture.test.ts`
- `pnpm test:run tests/knowledge-source-intake.test.ts`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test:run`
- `pnpm build`
- Manual smoke, operator machine only: `pnpm facebook:capture --source-id <facebook-source-id>` with a test Facebook URL the operator can view.

### Previous Story Intelligence

- Story 4.1 established the safe-vs-raw source boundary. Preserve the invariant that safe action responses, source rows, and audit summaries do not contain raw source text or raw metadata. [Source: `_bmad-output/implementation-artifacts/spec-4-1-submit-travel-source-for-ai-reading.md`]
- Story 4.1 review fixes moved authorization before validation for server actions. This script is not a public action, but any reusable write helper should still avoid validating attacker-controlled inputs before deciding the caller is authorized or explicitly local/operator-controlled. [Source: `_bmad-output/implementation-artifacts/spec-4-1-submit-travel-source-for-ai-reading.md#Review-Triage-Log`]
- Story 4.2 extracts only when raw text exists and intentionally does not approve/publish/embed/retrieve drafts. Do not combine capture with extraction in one automatic pipeline. [Source: `_bmad-output/implementation-artifacts/spec-4-2-ai-extracts-knowledge-drafts-from-source.md`]
- Story 4.2 clamps Facebook/community confidence to community/unverified. Capture must not modify source trust fields or model confidence behavior. [Source: `_bmad-output/implementation-artifacts/spec-4-2-ai-extracts-knowledge-drafts-from-source.md#Implementation-Notes`]

### Git Intelligence

- Recent commits show DB/script work is acceptable in `scripts/` with concise package scripts: `Feat: add local database reset seed scripts`, `Fix: repair Drizzle snapshot chain`, and Epic 5 usage/provenance work. Preserve existing script style and do not introduce new tooling beyond Playwright/tsx unless required.

### Scope Boundaries

- Do not add Facebook Graph API integration.
- Do not add server-side scraping endpoints.
- Do not crawl comments by default.
- Do not mass-crawl Facebook groups.
- Do not store Facebook credentials in `.env`, DB, app secrets, or BMad docs.
- Do not alter existing approved knowledge retrieval, web search, AI Gateway extraction prompts, or traveler source rendering.
- Do not create a web-admin capture queue UI in this story.

### Open Questions For Dev To Record, Not Block

- Whether broad captured Facebook text retention/deletion policy needs explicit controls before multiple operators use this at scale. Current implementation can proceed as local operator MVP but must document this residual risk.
- Whether `--yes` should be allowed in the first implementation. It is permitted by this story only if the default remains interactive confirmation.

## Project Structure Notes

- Keep app code under `src/`; keep operations scripts under `scripts/`; keep BMad artifacts under `_bmad-output/implementation-artifacts/`.
- Use `@/*` imports only for app/test code compiled with TS path aliases. Scripts in `scripts/` currently use relative imports to `../src/db/schema` and `./db-env`; follow that pattern unless verified otherwise.
- `tsconfig.json` includes `**/*.ts`, so new scripts and tests must pass strict typecheck.
- `.gitignore` currently does not ignore `.playwright/`; add it before creating a persistent profile path.

### References

- `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#3-Non-Goals`
- `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#8.4-Knowledge-Collection`
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-7A-Facebook-Capture-Is-Operator-Controlled-And-Raw-Material-Only`
- `_bmad-output/planning-artifacts/implementation-readiness-report-2026-07-10.md#Summary-and-Recommendations`
- `_bmad-output/implementation-artifacts/spec-4-1-submit-travel-source-for-ai-reading.md`
- `_bmad-output/implementation-artifacts/spec-4-2-ai-extracts-knowledge-drafts-from-source.md`
- `src/features/knowledge/sources.ts`
- `src/db/schema.ts`
- `scripts/db-seed.ts`
- `scripts/db-env.ts`
- `tests/knowledge-source-intake.test.ts`

## Dev Agent Record

### Agent Model Used

TBD by dev agent.

### Debug Log References

TBD by dev agent.

### Completion Notes List

TBD by dev agent.

### File List

TBD by dev agent.

## Change Log

- 2026-07-10: Story created by BMad create-story workflow. Ultimate context engine analysis completed; comprehensive developer guide created.
