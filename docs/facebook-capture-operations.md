# Facebook Capture Operations

The Facebook capture script is an operator-controlled operations tool. It reads queued Facebook source links from PostgreSQL, opens a Playwright Chromium browser, captures visible post text, and writes that text to `raw_source_material` for later extraction, review, and approval.

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
- `raw_source_material.source_id = sources.id`
- `raw_source_material.raw_text` is null or blank

The script does not approve knowledge cards. Human review and approval remain separate audited operator actions.

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
2. Scheduled capture runs `pnpm facebook:capture --limit 25 --yes` with the service audit actor.
3. Captured text is stored in `raw_source_material` with safe capture metadata.
4. Capture queues up to 20 unique linked Facebook post/share URLs from the captured post for a later run. Links that already match a stored canonical source URL are skipped; capture does not recursively open them in the same run.
5. Capture creates or confirms a `facebook_capture_reviews` row with `needs_review` status for the captured source.
6. Operator uses the admin Facebook capture review queue at `/admin/knowledge/facebook-captures` to inspect the captured material before AI extraction.
7. Operator reviews, edits, approves, or rejects drafts after extraction.
8. Approved cards become eligible for traveler retrieval according to the knowledge workflow.

Capture does not currently run extraction automatically. The Playwright script is an operations process with a service audit actor, while AI extraction runs through the authenticated admin workflow so the resulting drafts have an accountable admin/operator actor and remain human-reviewed before approval.

## Pacing And Safety Stops

Capture opens each queued permalink directly rather than attempting in-page click traversal. This keeps the queue deterministic and auditable.

Default pacing is a randomized 12-25 second delay between attempts and a one-minute cooldown after every 10 attempts. Configure it per environment with non-negative integer millisecond values:

```bash
FACEBOOK_CAPTURE_DELAY_MIN_MS=12000
FACEBOOK_CAPTURE_DELAY_MAX_MS=25000
FACEBOOK_CAPTURE_BATCH_SIZE=10
FACEBOOK_CAPTURE_BATCH_COOLDOWN_MS=60000
```

The script stops the current run without opening further queued sources when Facebook redirects to login or checkpoint pages, or page text indicates a rate limit, temporary block, identity confirmation, unusual activity, or security check. Refresh the approved local browser profile and investigate the account state before manually starting another run. Pacing is responsible operational rate limiting, not a mechanism to bypass platform controls.

The web review queue is an admin/operator-only surface. Operators should not treat captured text as extracted, approved, or traveler-ready just because raw text exists.

## Failure Modes

If the script reports no queued sources, no matching Facebook source rows need raw text.

If the script reports an audit actor error, create the service user row or set `FACEBOOK_CAPTURE_ACTOR_USER_ID` and `FACEBOOK_CAPTURE_ACTOR_EMAIL` to an existing user row.

If Facebook shows login, blocked, or empty content, refresh the local Playwright profile manually and rerun the command.

If captured text is incomplete or corrupted, use the admin review detail page `Recapture` action. This clears `raw_source_material.raw_text` and capture metadata, resets the review to `needs_review`, and queues the source for another `pnpm facebook:capture --source-id <source-id>` run. Recapture is blocked once extraction cards already exist for that capture version.

Capture metadata includes diagnostics that identify the selected text path. Useful fields are `selectedTextSource`, `selectedCaptureTextSource`, `selectedInnerTextLength`, `selectedTextContentLength`, `selectedHtmlTextLength`, `graphqlResponseCount`, and `graphqlCandidateLength`. Current extraction order tries direct DOM text, serialized HTML text, CSS-rendered text, text content, and finally a matching GraphQL post-message candidate when available.
