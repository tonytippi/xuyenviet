# Facebook Capture Operations

The Facebook capture script is an operator-controlled operations tool. It reads queued Facebook source links from PostgreSQL, opens a Playwright Chromium browser, captures visible post text, and writes that text to `raw_source_material` for later extraction, review, and approval.

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
4. Extraction creates draft knowledge cards from captured raw material.
5. Operator reviews, edits, approves, or rejects drafts.
6. Approved cards become eligible for traveler retrieval according to the knowledge workflow.

## Failure Modes

If the script reports no queued sources, no matching Facebook source rows need raw text.

If the script reports an audit actor error, create the service user row or set `FACEBOOK_CAPTURE_ACTOR_USER_ID` and `FACEBOOK_CAPTURE_ACTOR_EMAIL` to an existing user row.

If Facebook shows login, blocked, or empty content, refresh the local Playwright profile manually and rerun the command.
