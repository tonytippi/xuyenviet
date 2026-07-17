---
title: 'Story OPS-2: Cache-First Local Capture Archive For Production Sources'
type: 'operations-feature'
created: '2026-07-17'
status: 'ready-for-dev'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-1a-capture-queued-facebook-source-text-with-operator-browser-automation.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-10-analyze-youtube-video-sources-with-gemini.md'
warnings:
  - 'This is a transitional local-operator design. The local cache database is production-critical until it is migrated to managed infrastructure and must be backed up.'
  - 'The local cache contains only bounded, validated capture artifacts and safe metadata. It must never store browser credentials, cookies, tokens, browser profile data, HTML, hidden page data, Gemini prompts/responses, or provider error bodies.'
---

# Story OPS-2: Cache-First Local Capture Archive For Production Sources

Status: ready-for-dev

## Story

As an operator,
I want the local Facebook and YouTube capture commands to reuse a persistent local capture archive before making a provider call,
so that resetting or recreating the production application database does not require recapturing already validated Facebook material or repaying Gemini for the same YouTube analysis.

## MVP Decision And Boundaries

This story implements the agreed transitional two-database model:

- `DATABASE_URL` is the production application PostgreSQL database, reached through the operator's protected tunnel. It remains authoritative for queued `sources`, `raw_source_material`, Facebook reviews, discovered sources, and audit events.
- `CAPTURE_CACHE_DATABASE_URL` is a separate persistent local PostgreSQL database. It stores only durable, provider-specific, validated capture artifacts and retry/flush state.
- `facebook:capture` and `youtube:capture` remain the commands. They are refactored to read the production queue, check the local cache first, capture only on a cache miss, durably store a live artifact in the cache, then flush it through the existing production write helpers.
- No production API, background queue, hosted cache, direct browser capture in production, distributed transaction, Graph API, transcript storage, or cache synchronization service is introduced in this story.
- The cache is not a mirror of the application schema. Do not copy `sources`, users, audit events, reviews, extraction jobs, cards, embeddings, or search documents between databases.
- A cache artifact is owned by an immutable provider resource, not a production `sourceId`. It may be reused for another source row only after a strict provider-resource identity match. Facebook matching precedence is stable post ID, canonical final URL, then canonical submitted URL only when unambiguous; YouTube matching requires canonical video ID. URL similarity alone never authorizes reuse.
- Cache lookup uses a stable reuse key available before a provider call. A post-validation content hash is an immutable integrity/deduplication attribute, never an input to the initial lookup. When more than one artifact matches a reuse key, select the newest non-superseded valid artifact deterministically.
- Facebook recapture is an explicit forced-live operation. Add a review-owned `force_live_capture` flag to `facebook_capture_reviews`; the existing recapture action sets it in the same production transaction that clears raw material, and a successful live capture clears it in the existing production capture transaction. While set, the command bypasses compatible cache artifacts. A successful live capture creates a new artifact and marks the prior artifact superseded for default reuse while retaining it for archive history. Normal cache replay is not recapture.
- The archive keeps immutable artifact state separate from target import state. A flush, duplicate, or terminal result applies only to one production target/source import attempt; it never makes the underlying artifact unusable after a later application-database reset.
- Facebook archival capture is strict visible-DOM capture only. Do not collect, select, cache, or persist GraphQL/network response bodies. Remove the current network-response candidate path rather than extending its retention.

## Acceptance Criteria

1. Given `DATABASE_URL` points to a production application database and `CAPTURE_CACHE_DATABASE_URL` points to a separate local PostgreSQL database, when either capture command starts, then it fails closed with a clear safe error if either URL is missing, malformed, or both resolve to the same database; it never resets, migrates, or writes application tables in the cache database.

2. Given a queued Facebook or YouTube source in the production application database, when the command runs, then it reads queue eligibility only from the production database using the existing queue rules and looks for a compatible completed or pending artifact in the local cache before it opens Facebook or calls Gemini.

3. Given a compatible cache artifact exists, when the production source is still queued, then the command flushes the artifact through the existing production capture persistence helper without a live provider call. It preserves the artifact's original capture timestamp and safe provenance, records the immutable artifact ID, import time, and cache origin in an allowlisted operator-only production provenance contract, and creates the existing production audit/review/discovery effects exactly as a normal successful capture would.

4. Given no compatible cache artifact exists and live capture returns a valid artifact, when the operator confirms it or supplies `--yes`, then the command commits the complete validated artifact to the local cache before attempting any production write. If the local cache write fails, then the production application database remains unchanged and the command reports a safe failure.

5. Given a cache artifact is awaiting flush and a production write fails transiently or returns an ambiguous connection outcome, when the command is rerun, then it uses a deterministic import correlation token to query whether that target import committed before retrying. It retries the same stored artifact without recapturing Facebook or calling Gemini, and updates only the target import attempt after a definitive observed outcome.

6. Given a concurrent production capture, recapture, or duplicate resolution has made the source no longer queued, when a cache flush occurs, then the command must not overwrite production raw material. It records a terminal safe outcome for that target import attempt only; Facebook duplicate behavior, review creation, discovered-post queueing, and production audit behavior remain owned by the existing atomic production helper.

7. Given cache entries are created or read, when their identities are compared, then they are provider-specific and versioned:
   - The pre-capture reuse key is derived from provider resource identity, capture-method version, and payload-schema version; YouTube additionally includes `promptVersion` and model.
   - Facebook resource identity uses stable post ID when extractable, otherwise canonical final URL, then canonical submitted URL only when unambiguous. YouTube resource identity uses canonical video ID.
   - A post-validation content hash is stored for artifact integrity and idempotent cache admission, but is not required to locate a reusable artifact before capture.
   - An incompatible capture method, payload schema, prompt version, model, or canonical provider identity is a cache miss. A cache result must never overwrite a newer production capture merely because source IDs match.

8. Given Facebook or YouTube capture data is stored locally or flushed to production, then all existing operator-only and trust boundaries remain true: raw material remains outside traveler retrieval; Facebook/YouTube sources remain community/unverified; no secrets or prohibited browser/provider data are stored; YouTube remains validated bounded evidence rather than a transcript; and audit summaries contain no raw artifact text.

9. Given the feature is deployed to an operator machine, when configuration and operations docs are reviewed, then they document the two URLs, tunnel expectation, local-cache backup/retention responsibility, cache-hit/cache-miss behavior, and recovery after a production write failure without placing database URLs or provider keys in Git.

10. Given an operator requests Facebook recapture through the existing review workflow, when the source becomes queued again, then the command bypasses the default cached artifact and performs a new live visible-DOM capture. On success it archives the new artifact, marks the prior default artifact superseded, and imports the new artifact into production without allowing stale cached text to block recapture.

## Tasks / Subtasks

- [ ] Define the script-safe local capture-cache persistence contract (AC: 1, 4, 5, 7, 8)
  - [ ] Add a dedicated cache schema/migration path that targets only `CAPTURE_CACHE_DATABASE_URL`; it must not reuse application Drizzle migrations or make `db:migrate` operate on the cache database.
  - [ ] Store immutable provider-resource artifacts with artifact ID, normalized reuse key fields, payload/schema version, safe artifact payload, safe metadata, content hash, original capture timestamp, default/superseded state, and created/updated timestamps.
  - [ ] Store target-scoped import attempts separately from immutable artifacts: production target identity, source ID, correlation token, import actor/time, observed outcome, retry eligibility, and attempt timestamps. Do not use a global artifact `flushed` or `terminal` state.
  - [ ] Use unique constraints/upserts so a retry is idempotent and cannot create duplicate artifacts for the same identity/version/content.
  - [ ] Provide script-safe cache functions with injected DB clients. Do not import `server-only`, `src/db/client.ts`, authentication, actions, or request-route code.
  - [ ] Validate and sanitize data before it crosses either database boundary. Reuse the current Facebook metadata sanitizer/canonicalizer and YouTube evidence parser/serializer rather than duplicating weaker validation.

- [ ] Add explicit two-database configuration and connection handling (AC: 1, 9)
  - [ ] Keep `DATABASE_URL` as the production application DB for capture scripts and add `CAPTURE_CACHE_DATABASE_URL` for the persistent local PostgreSQL cache.
  - [ ] Add script-safe env helpers that reject absent or malformed URLs without printing credentials. After both connections open, compare safe runtime database identities and a cache-specific marker; fail closed if the databases cannot be distinguished or are the same target. Do not compare raw connection strings.
  - [ ] Open and always close independent app and cache clients. Do not use a cross-database transaction or two-phase commit.
  - [ ] Ensure `db:reset` remains local-app-only and cannot target the cache by accident.
  - [ ] Document that production DB access must remain tunnel/private-network based and use a least-privilege capture role where practical.

- [ ] Refactor Facebook capture to be cache-first (AC: 2-8)
  - [ ] Keep existing CLI flags, headed local Playwright profile, pacing, stop conditions, preview confirmation, visible-DOM extraction logic, and local profile safety rules.
  - [ ] Remove GraphQL/network response collection and candidate selection. Do not cache or persist network payload text, even when it appears more complete than visible DOM text.
  - [ ] Select queued sources from the production app DB through `listQueuedFacebookSources`.
  - [ ] Extract a shared pure, versioned provider-identity module for canonicalization and post-ID precedence. Use it consistently for script lookup, cache persistence, production duplicate detection, and tests.
  - [ ] Derive canonical submitted/final URL and Facebook post identity using that shared contract; look up the newest compatible non-superseded cache artifact before launching a page navigation.
  - [ ] On cache hit, flush through `updateQueuedFacebookSourceRawText`, never by directly writing `raw_source_material` or review rows.
  - [ ] On live success, cache the validated text, allowed metadata, and first-generation discovered URLs before calling `updateQueuedFacebookSourceRawText`.
  - [ ] Preserve existing advisory locking, duplicate detection, review creation, audit writes, and discovered-post queueing inside the production helper transaction.
  - [ ] Add allowlisted operator-only provenance to Facebook metadata and audit flow: `captureOrigin`, immutable artifact ID, original capture time, import time, import correlation token, capture/payload version, and capture/import actor identities where available. Do not expose these values to traveler-facing code.
  - [ ] Add a review-owned `force_live_capture` field and migration to `facebook_capture_reviews`. Set it atomically in the existing recapture action, include it in queued-source selection, and clear it atomically only after a successful live capture. Force a live capture instead of replaying the default cache artifact while it is set; on success, supersede the old default artifact.

- [ ] Refactor YouTube capture to be cache-first (AC: 2-8)
  - [ ] Select queued sources from the production app DB through `listQueuedYoutubeSources`.
  - [ ] Look up a compatible cache artifact before requiring or using `GEMINI_API_KEY` and before `requestYoutubeEvidence`.
  - [ ] On cache hit, flush validated evidence through `saveYoutubeEvidence` with original safe metadata plus allowlisted cache-origin and import provenance.
  - [ ] On cache miss, retain the current strict provider-result validation; persist only validated bounded evidence and safe metadata to the cache before production flush.
  - [ ] Treat empty evidence and provider/validation failures as non-cacheable failures that leave production raw material unchanged.

- [ ] Add focused tests and operations documentation (AC: all)
  - [ ] Test configuration rejection for missing/malformed/equivalent runtime DB targets without exposing credentials.
  - [ ] Test cache reuse-key compatibility separately from post-capture artifact hashing for Facebook aliases/final URLs/post IDs and YouTube video identity, model, and prompt version.
  - [ ] Test a cache hit causes no Playwright navigation or Gemini request and produces the expected production raw material, audit-safe summary, and Facebook review side effects.
  - [ ] Test cache-first live capture ordering: cache failure means no production write; production failure leaves a retryable target import; an ambiguous production failure is resolved by correlation-token lookup; retry flushes without a second provider call.
  - [ ] Test race/no-overwrite and terminal outcomes by reusing existing Facebook and YouTube guarded-write cases.
  - [ ] Test cache sanitization rejects or omits cookies, tokens, passwords, local storage, HTML, profile paths, raw prompts/responses, and error bodies.
  - [ ] Test that Facebook capture neither reads GraphQL response bodies nor caches network-derived text.
  - [ ] Test review-initiated Facebook recapture bypasses a matching cache artifact and supersedes the previous default only after a valid live capture.
  - [ ] Test production target reset/recreation permits reimport of an existing immutable artifact, while a terminal outcome on an earlier target import does not block it.
  - [ ] Test cross-source replay is allowed only for strict matching provider-resource identity and creates source-specific review/audit/discovery effects without copying source rows.
  - [ ] Update `README.md`, `.env.example`, `docs/facebook-capture-operations.md`, and `docs/youtube-capture-operations.md` with setup, recovery, backup, and retention guidance.
  - [ ] Update this story's task state, Dev Agent Record, completion notes, file list, and `sprint-status.yaml` throughout implementation.

## Dev Notes

### Existing Production Helpers Are The Flush Boundary

- Facebook: reuse `listQueuedFacebookSources` and `updateQueuedFacebookSourceRawText` in `src/features/knowledge/facebook-capture.ts`. The latter already locks by canonical final URL, rechecks queue state, detects duplicates, writes raw material and canonical URL, creates the review state, writes the audit record, and queues one generation of discovered posts in one transaction. The cache layer must not reproduce any of that behavior.
- YouTube: reuse `listQueuedYoutubeSources`, `parseYoutubeEvidence`, `serializeYoutubeEvidence`, and `saveYoutubeEvidence` in `src/features/knowledge/youtube-capture.ts`. These already enforce bounded provider output and guarded no-overwrite persistence.
- Scripts must continue using the relative imports and explicit script-local Drizzle clients shown in `scripts/facebook-capture.ts`, `scripts/youtube-capture.ts`, and `scripts/db-env.ts`. `src/db/client.ts` imports `server-only` and is not script-safe.

### Required Ordering And Outcomes

1. Read queued production source.
2. Resolve compatible cache artifact by the pre-capture provider-resource reuse key, or read the review-owned `force_live_capture` state for Facebook.
3. For a cache hit, flush through the existing production helper.
4. For a cache miss, perform/validate the live capture without holding a production DB transaction.
5. Commit the complete validated local artifact.
6. Flush it through the production helper.
7. Create or update the local target-scoped import attempt before each production flush, recording `awaiting_flush` and its correlation token. After the production transaction, mark only a confirmed success as imported; record transient or ambiguous failures as retryable, then resolve ambiguous outcomes by querying production with the correlation token. `not_queued`, `no_longer_queued`, and Facebook `duplicate` are terminal only for that target attempt; retain the immutable artifact for future compatible targets and application-database restores.

Do not delete an artifact after flush in this story. Retaining it is the point of the archive and supports later production DB resets. Preserve immutable artifact integrity separately from source-specific imports and their outcomes.

### Provenance And Cache Payload Rules

- Preserve original `capturedAt`, Facebook `sourceUrl`/`finalUrl`, and existing safe metadata. A cache replay must not pretend the source was freshly fetched.
- Extend the production metadata types and Facebook sanitizer deliberately. Required operator-only allowlisted fields are `captureOrigin`, immutable cache artifact ID, `capturedAt`, `importedAt`, import correlation token, capture/payload version, and capture/import actor identities where available. They must not be included in traveler source shapes.
- For a new live capture, use `captureOrigin: "live"`. For a cache replay use `captureOrigin: "cache"`. Do not overwrite original capture time on later cache replays.
- Cache only complete payloads that can be passed to the production writer: Facebook text, safe metadata, and discovered URLs; YouTube serialized/validated evidence and safe metadata.
- Cache artifacts are never valid for a different provider or incompatible version. The cache may store aliases, but identity matching must use the shared provider-identity contract. A strict provider-resource match, not source ID or URL similarity, is required for cross-source replay.
- Retain bounded discovered Facebook URLs as a derived artifact payload. They are replayed only through `updateQueuedFacebookSourceRawText` so the target source receives its own audited one-generation discovery lineage; never copy source or review rows.

### Security And Operations Constraints

- Both URLs and `GEMINI_API_KEY` are operator-machine secrets. Never commit them, print them, include them in cache metadata, or add them to browser/client code.
- Facebook's persistent profile remains local at `.playwright/facebook-profile`; do not store, export, copy, inspect, or back up it as part of this cache feature.
- Treat the local cache database as production-critical. Require a dedicated OS/database account, local-only network binding, encrypted disk and encrypted backups, documented backup-key custody, named restore/replay authority, lost-device/operator-offboarding procedure, and a documented retention/deletion schedule. This story does not solve managed cache hosting, but these minimum controls are required before it holds production archive data.
- Continue stopping Facebook runs on login/checkpoint/rate-limit/security signals. Caching reduces calls; it must not be used to bypass platform controls.

### File Structure Guidance

- Likely new script-safe modules under `src/features/knowledge/` for cache contracts/serialization, or under `scripts/` where they are strictly operations-only. Avoid generic cross-feature database helpers.
- Likely new cache-only migration/bootstrap script under `scripts/`, with a clearly named package command such as `capture-cache:migrate`. Do not modify `drizzle.config.ts` such that normal app migrations run against the cache database.
- `capture-cache:migrate` is the sole cache schema owner. It takes a migration lock. Capture commands check and fail closed on an uninitialized or incompatible cache schema, and must never auto-create or auto-migrate it. Document backup restore verification before an archive is replayed.
- The production application migration that adds `facebook_capture_reviews.force_live_capture` remains owned by the normal Drizzle application migration path. Do not place product-table migrations in the cache migration command.
- Update `scripts/db-env.ts`, `scripts/facebook-capture.ts`, `scripts/youtube-capture.ts`, tests, `.env.example`, README, and the provider operation docs.
- Keep each new code file focused and under the project 200-line guidance where practical.

### Testing Requirements

- Existing integration tests use `DATABASE_URL_TEST`; do not point them to a production or developer cache. Introduce an explicit isolated cache-test URL only if integration coverage needs a real second database.
- Reuse existing redaction/race baselines in `tests/facebook-capture.test.ts` and `tests/youtube-capture.test.ts`.
- Do not require live Facebook, Gemini, tunnels, or production credentials in automated tests.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test:run`, and `pnpm build`, plus focused cache/capture tests. Record exact blockers if the second local test DB is unavailable.

### Scope Exclusions

- No production API/job-lease protocol.
- No hosted or production-managed capture-cache database.
- No automatic provider refresh/TTL policy; cache compatibility is version-based in this story.
- No cache import of extracted drafts, cards, reviews, embeddings, audit events, or user records.
- No changes to approval, retrieval, traveler UI, or provider trust labels.

## References

- `scripts/facebook-capture.ts`
- `scripts/youtube-capture.ts`
- `scripts/db-env.ts`
- `src/features/knowledge/facebook-capture.ts`
- `src/features/knowledge/youtube-capture.ts`
- `src/db/schema.ts`
- `tests/facebook-capture.test.ts`
- `tests/youtube-capture.test.ts`
- `docs/facebook-capture-operations.md`
- `docs/youtube-capture-operations.md`
- `_bmad-output/implementation-artifacts/spec-4-1a-capture-queued-facebook-source-text-with-operator-browser-automation.md`
- `_bmad-output/implementation-artifacts/spec-4-10-analyze-youtube-video-sources-with-gemini.md`

## Dev Agent Record

### Completion Notes List

- Ultimate context engine analysis completed. This story is ready for implementation.

## Change Log

- 2026-07-17: Created as the transitional direct-two-database operational story. It deliberately defers production APIs and managed cache infrastructure while retaining cache-first, retry-safe behavior.
