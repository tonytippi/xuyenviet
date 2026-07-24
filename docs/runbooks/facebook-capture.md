# Facebook Capture Operations

**Status:** Current operator runbook. Capture is implemented; the canonical AI-first ingestion lifecycle applies after readable material is captured. Production scheduled capture is not ready to enable until the blocking conditions in [Operational Status](#operational-status) are resolved.

The Facebook capture script is an operator-controlled operations tool. It reads the production queue from `DATABASE_URL`, checks a separate persistent local archive first, and only opens Playwright on a cache miss or review-requested recapture. It derives bounded readable text from rendered/DOM content, archives validated material, then appends an immutable operator-only capture version. It never persists HTML or network payloads.

## Two Database Archive

- `DATABASE_URL` is the protected-tunnel/private-network production application database. Use a least-privilege capture role where practical.
- `CAPTURE_CACHE_DATABASE_URL` is a separate local PostgreSQL archive. It must never point to the application database.
- Initialize it explicitly: `pnpm capture-cache:migrate`. Capture commands never create or migrate it automatically.
- Archive artifacts retain bounded text, safe metadata, identity/version fields, and per-source import state. They never retain cookies, profile data, HTML, network bodies, tokens, prompts, provider responses, or error bodies.
- Back up the local archive on encrypted storage, retain encrypted backups with named key custody and restore authority, and periodically verify restore/replay. Follow local retention/deletion and operator offboarding procedures. Do not back up `.playwright/facebook-profile` as archive data.

## Install

```
pnpm exec playwright install-deps
pnpm exec playwright install
# Login Facebook
pnpm exec tsx scripts/facebook-login.ts
```

## Queue Contract

A source is queued when all conditions are true:

- `sources.kind = 'facebook'`
- `sources.current_capture_version_id` is null
- `raw_source_material.raw_metadata.duplicateSourceId` is absent

`raw_source_material` remains a legacy intake/queue record. Captured content is stored in immutable `source_capture_versions`; a readable capture atomically creates one canonical ingestion job for that version.

The capture script never approves knowledge cards. The canonical Knowledge pipeline independently extracts, judges, relates, and publishes captured material. Operator review is risk- and sampling-driven, not a general publication prerequisite.

## Source Intake And Community-Suggestion Policy

Facebook intake is operator-curated in the current product phase. It accepts the permalink of one specific post that an operator has selected; the same policy applies to posts from Facebook Pages and Facebook Groups.

The operator may provide a short selection reason, expected travel category, location or route, and urgency. These fields are triage context only. They are not source evidence and cannot establish a traveler-facing fact.

The system does not automatically browse Page or Group feeds, perform unattended mass crawling, traverse in-page posts, or use Playwright to discover posts. `facebook:capture` only opens a queued canonical post permalink and extracts its bounded readable text and safe metadata.

### Content Boundaries

- Capture text only. Do not capture, persist, analyze, proxy, or render Facebook images, videos, thumbnails, or media URLs.
- Do not capture comments or use them as triage input, evidence, retrieval material, or traveler-facing content.
- Do not store HTML, network payloads, browser credentials, cookies, profile data, hidden page data, or browser-profile material.
- `postCreatedAt` is optional metadata. If it cannot be obtained from safe rendered or accessibility metadata, `capturedAt` means only when XuyenViet observed the post; it is not the publication time.
- Missing publication time reduces freshness confidence. Claims about road/safety conditions, price, opening hours, room availability, booking, promotions, service availability, or contact details remain subject to the canonical verification and caveat policy.

### Community Accommodation Suggestions

Community posts may identify small homestays or accommodation experiences absent from OTA listings. They may enter the Knowledge pipeline as community-derived suggestions only after the existing evidence, identity, privacy, commercial-risk, freshness, conflict, and publication gates pass.

- A single post can support a traveler-facing **community suggestion** or community observation. It cannot make a property `verified` or elevate it to a generally recommended listing.
- Traveler-facing wording must identify the item as a community suggestion, show the observed or published time when available, and ask the traveler to confirm current conditions directly.
- Price, vacancy, operating status, opening hours, booking availability, and similar changing facts must not be rendered as current facts unless corroborated under the canonical policy.
- A phone number may be retained only as a community-provided contact candidate when the post clearly associates it with a business or accommodation, not a private individual. It requires provenance, observed time, a "confirm directly" warning, and a correction/removal path before any traveler display.
- Marketing-only content, referral codes, booking calls to action, repeated contact details, copied posts, and other commercial/seeding signals must increase commercial risk. Reposts do not count as independent corroboration.
- Multiple independent sources may increase confidence. Contradictory reports must remain state-aware community information or be excluded; they must not become an unsupported factual itinerary premise.

## Operational Status

The current public-MVP readiness report is **no-go** for production scheduled Facebook capture:

- The canonical `knowledge:ingestion-worker` has no evidenced continuously supervised deployment. The Compose `knowledge-extractor` service is a legacy worker and is not proof that canonical ingestion is running.
- `facebook:capture --yes` verifies that the configured service actor ID and email match a user record, but it does not yet enforce that the user has an `admin` or `operator` role.

Do not enable unattended production scheduling or rely on automatic ingestion until both gaps have a completed hardening/deployment record. Manual controlled capture remains available to authorized operators, subject to the existing role and audit controls.

## Service Audit Actor

Scheduled capture runs use a system/service actor by default. This is required because `audit_events.actor_user_id` has a foreign key to `users.id`.

Default service actor:

```text
FACEBOOK_CAPTURE_ACTOR_USER_ID=system-facebook-capture
FACEBOOK_CAPTURE_ACTOR_EMAIL=system-facebook-capture@xuyenviet.internal
```

Before scheduled runs, create a matching user row in each environment database:

```sql
insert into users (id, email, name)
values ('system-facebook-capture', 'system-facebook-capture@xuyenviet.internal', 'System Facebook Capture')
on conflict do nothing;
```

If an environment uses different service actor values, set both variables:

```bash
FACEBOOK_CAPTURE_ACTOR_USER_ID="system-facebook-capture"
FACEBOOK_CAPTURE_ACTOR_EMAIL="system-facebook-capture@xuyenviet.internal"
```

Manual operator runs may still override the actor explicitly:

```bash
pnpm facebook:capture --limit 5 --actor-user-id <operator-user-id> --actor-email <operator-email>
```

## Running Capture

Capture up to five queued sources using the configured service actor:

```bash
pnpm facebook:capture --limit 5
```

Capture one queued source:

```bash
pnpm facebook:capture --source-id <source-id>
```

Skip interactive confirmation and save each successful capture:

```bash
pnpm facebook:capture --limit 5 --yes
```

## Browser Profile

The first run opens a headed Chromium profile at `.playwright/facebook-profile`.

Log into Facebook manually in that browser, then rerun the command. The profile stays local and must not be committed, copied into app secrets, or stored in PostgreSQL.

Production scheduling should decide explicitly where this browser profile lives and how access is secured. Avoid using a personal Facebook profile on shared infrastructure without a product, legal, and security decision.

## Workflow

1. Operator submits Facebook links through admin intake or batch intake.
2. An authorized operator runs capture manually. Do not schedule `pnpm facebook:capture --limit 25 --yes` in production while the [Operational Status](#operational-status) blockers remain open.
3. A cache hit replays its original captured time and safe provenance without opening Facebook. A cache miss derives bounded text from rendered/DOM content, commits the artifact to the local archive first, then flushes it to production.
4. Capture may queue up to 20 unique linked Facebook post/share URLs from the captured post as bounded candidates for a later run. Links that already match a stored canonical source URL are skipped. Candidate links must still pass queue/admission policy before capture; this does not browse feeds, recursively crawl Facebook, or open linked posts in the same run.
5. Capture appends an immutable capture version, atomically creates its canonical ingestion job, and creates or updates the Facebook review record used for legacy/manual inspection and recapture controls.
6. The separately supervised canonical ingestion worker processes readable capture versions through triage, extraction, independent judgment, and relation/conflict handling. The capture script itself does not call the ingestion model inline.
7. Operators use risk/sampling-driven recommendations to inspect or resolve weak evidence, high-risk claims, conflicts, verification needs, or quality samples. The Facebook capture review queue remains an operator-only inspection/recapture surface; raw material is not traveler-ready merely because it was captured.
8. Only policy-eligible active knowledge cards with valid current evidence can enter traveler retrieval. High-risk material remains caveat-only until corroborated; conflicted claims cannot support factual itinerary premises.

The canonical ingestion worker is not the Playwright capture process. Deploy and supervise `knowledge:ingestion-worker` separately before relying on automatic ingestion; the current Compose configuration still runs the legacy extraction worker and indexing worker only.

## Pacing And Safety Stops

Capture opens each queued permalink directly rather than attempting in-page click traversal. This keeps the queue deterministic and auditable.

Default pacing is a randomized 12-25 second delay between live Facebook attempts and a one-minute cooldown after every 10 live attempts. Cache replays do not wait because they do not open Facebook. Configure it per environment with non-negative integer millisecond values:

```bash
FACEBOOK_CAPTURE_DELAY_MIN_MS=12000
FACEBOOK_CAPTURE_DELAY_MAX_MS=25000
FACEBOOK_CAPTURE_BATCH_SIZE=10
FACEBOOK_CAPTURE_BATCH_COOLDOWN_MS=60000
```

The script stops the current run without opening further queued sources when Facebook redirects to login or checkpoint pages, or page text indicates a rate limit, temporary block, identity confirmation, unusual activity, or security check. Refresh the approved local browser profile and investigate the account state before manually starting another run. Pacing is responsible operational rate limiting, not a mechanism to bypass platform controls.

The web review queue is an admin/operator-only surface. Operators should not treat captured text as extracted, approved, or traveler-ready just because raw text exists.

## Failure Modes

If the script reports no queued sources, no matching eligible Facebook source lacks a current capture version.

If the script reports an audit actor error, create the service user row or set `FACEBOOK_CAPTURE_ACTOR_USER_ID` and `FACEBOOK_CAPTURE_ACTOR_EMAIL` to an existing user row.

If Facebook shows login, blocked, or empty content, refresh the local Playwright profile manually and rerun the command.

If captured text is incomplete or corrupted, use the admin review detail page `Recapture` action. This sets a review-owned force-live generation and queues the source for another `pnpm facebook:capture --source-id <source-id>` run. It bypasses the default artifact, captures rendered/DOM text again, archives the new artifact, and appends a new immutable capture version only after a valid live result. Recapture is blocked once extraction cards already exist for that capture version.

If production flush fails after archive admission, rerun the same command. It reuses the archived artifact rather than opening Facebook again. Do not delete the artifact while recovering; inspect the safe source/import outcome and restore the production database through the normal process if required.

If canonical ingestion fails, correlate its `knowledge_ingestion_jobs` row with the worker warning by job ID, source ID, and capture-version ID. Legacy Facebook review/extraction failures may still use `knowledge_extraction_jobs` and a Facebook review ID. These records contain only safe error code/detail and attempt metadata; investigate the source only in the operator review workflow, never from worker logs.

Capture metadata includes diagnostics that identify the selected rendered/DOM text path. It never stores or caches HTML, GraphQL, or other network response bodies.
