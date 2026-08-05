# Facebook Capture Operations

`facebook:capture` is an explicit, operator-controlled command. It is not a Worker task and must not be scheduled or used for unattended scraping.

## Prerequisites

- Set distinct PostgreSQL `DATABASE_URL` and `CAPTURE_CACHE_DATABASE_URL` values. The command rejects equivalent databases.
- Initialize the cache before any capture: `pnpm capture-cache:migrate`.
- Install Playwright locally with `pnpm exec playwright install` if needed.
- Keep the headed local browser profile at `.playwright/facebook-profile`; sign in manually when Chromium opens. Never commit, back up, or store this profile in PostgreSQL or application secrets.

## Run

```bash
pnpm facebook:capture --limit 5
pnpm facebook:capture --source-id <source-id>
pnpm facebook:capture --limit 5 --yes
```

`--limit` accepts 1 through 25. The default is 5. Without `--yes`, the command previews the bounded visible post text and asks before it writes. It first replays a valid cache artifact; only a cache miss opens headed Chromium. Captured material is written through the capture domain API as an immutable version with the fixed `system-facebook-capture` audit actor.

The command stops the run on Facebook login, checkpoint, rate-limit, block, or security-check pages. Refresh the local browser session and investigate before another manually initiated run. Do not substitute direct database writes, source-module invocation, stored browser credentials, feed traversal, or a Worker capture loop.

## Recovery

If cache initialization fails, run `pnpm capture-cache:migrate` against the intended separate cache database. If product persistence fails after an artifact is admitted, rerun the same bounded command to replay the cache rather than reopening Facebook.
