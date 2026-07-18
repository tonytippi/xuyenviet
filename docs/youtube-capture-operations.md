# YouTube Capture Operations

`pnpm youtube:capture` is an operator-controlled server script. It reads queued individual YouTube video sources from the production database, checks a separate local archive before requiring Gemini credentials, and sends only cache misses to Gemini. Validated bounded evidence is archived before it is flushed into operator-only raw material for the existing extraction, review, and approval workflow.

## Setup

- Set `GEMINI_API_KEY` only in the server environment or `.env.local`. Set `YOUTUBE_DATA_API_KEY` to a server-only YouTube Data API v3 key to retrieve video durations; enable that API and allow the key to call `youtube.googleapis.com`. The command can fall back to `GEMINI_API_KEY`, but a dedicated key avoids cross-API restriction failures.
- `GEMINI_YOUTUBE_MEDIA_RESOLUTION` is optional and defaults to `MEDIA_RESOLUTION_LOW`. Use `MEDIA_RESOLUTION_MEDIUM` only when smaller on-screen detail is necessary; `MEDIA_RESOLUTION_HIGH` has the highest cost. The selected value is part of the capture cache identity.
- Set `DATABASE_URL` to the protected-tunnel/private-network application database and `CAPTURE_CACHE_DATABASE_URL` to a separate local PostgreSQL database. Run `pnpm capture-cache:migrate` before capture; commands fail closed for missing, malformed, equivalent, or uninitialized targets.
- Do not expose the key to browser code, request routes, logs, audit records, or Git.
- Create the configured service actor user before scheduled runs. Defaults are `system-youtube-capture` and `system-youtube-capture@xuyenviet.internal`.

## Run

```bash
pnpm youtube:capture --limit 5
pnpm youtube:capture --source-id <source-id>
pnpm youtube:capture --limit 5 --yes
```

The command accepts only canonical individual videos. It gets each public duration from YouTube Data API and sends Gemini sequential 30-minute video windows with explicit start/end metadata. Each completed window, including an empty-evidence window, is cached independently. The command admits one aggregate artifact and writes production only after every window is available, timestamps are converted to video-relative offsets, and the deterministic deduplicated result is capped at 20. Channels, playlists, malformed URLs, unavailable videos, provider failures, invalid model JSON, and videos with no reliable travel evidence leave raw material unchanged and record only a safe audit outcome. These failures do not appear in the YouTube capture review queue, which intentionally lists only validated evidence ready for operator review.

Windowed capture uses a new cache payload schema. Earlier whole-video YouTube artifacts remain in the archive for retention but are not replayed by this command.

For Gemini HTTP failures, the command writes Gemini's structured error status to standard error. Provider error messages are not logged, saved to the database, or stored in the capture archive.

To inspect a failure, query `audit_events` through the exact `DATABASE_URL` environment used by the capture process (process environment takes precedence over `.env.local`):

```sql
SELECT target_id, after_summary, created_at
FROM audit_events
WHERE target_type = 'youtube_capture'
  AND target_id = '<source-id>'
ORDER BY created_at DESC;
```

## Safety

- Gemini output is bounded evidence, never a requested or stored transcript.
- Raw evidence is operator-only. Only existing human-reviewed and approved knowledge cards can reach traveler retrieval.
- No Playwright, browser automation, YouTube credentials, media download, HTML, provider payload, or raw prompt/response log is stored.
- Back up the local archive using encrypted storage and tested restores. It is production-critical until managed infrastructure replaces it. A production write failure is recovered by rerunning the command: the stored artifact is retried without another Gemini call.
