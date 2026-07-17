# YouTube Capture Operations

`pnpm youtube:capture` is an operator-controlled server script. It reads queued individual YouTube video sources from the production database, checks a separate local archive before requiring Gemini credentials, and sends only cache misses to Gemini. Validated bounded evidence is archived before it is flushed into operator-only raw material for the existing extraction, review, and approval workflow.

## Setup

- Set `GEMINI_API_KEY` only in the server environment or `.env.local`.
- Set `DATABASE_URL` to the protected-tunnel/private-network application database and `CAPTURE_CACHE_DATABASE_URL` to a separate local PostgreSQL database. Run `pnpm capture-cache:migrate` before capture; commands fail closed for missing, malformed, equivalent, or uninitialized targets.
- Do not expose the key to browser code, request routes, logs, audit records, or Git.
- Create the configured service actor user before scheduled runs. Defaults are `system-youtube-capture` and `system-youtube-capture@xuyenviet.internal`.

## Run

```bash
pnpm youtube:capture --limit 5
pnpm youtube:capture --source-id <source-id>
pnpm youtube:capture --limit 5 --yes
```

The command accepts only canonical individual videos. Channels, playlists, malformed URLs, unavailable videos, provider failures, invalid model JSON, and videos with no reliable travel evidence leave raw material unchanged and record only a safe audit outcome.

## Safety

- Gemini output is bounded evidence, never a requested or stored transcript.
- Raw evidence is operator-only. Only existing human-reviewed and approved knowledge cards can reach traveler retrieval.
- No Playwright, browser automation, YouTube credentials, media download, HTML, provider payload, or raw prompt/response log is stored.
- Back up the local archive using encrypted storage and tested restores. It is production-critical until managed infrastructure replaces it. A production write failure is recovered by rerunning the command: the stored artifact is retried without another Gemini call.
