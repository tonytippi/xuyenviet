# YouTube Capture Operations

`pnpm youtube:capture` is the server-side Gemini evidence-capture operation for canonical individual YouTube videos. It reads queued sources from the production database, checks a separate local archive before requiring Gemini credentials, and sends only cache misses to Gemini. Validated bounded evidence is archived before it is flushed into operator-only source material and the canonical Knowledge ingestion pipeline.

## Status

The current command captures individual videos that have already been submitted and queued. It does not discover videos, enrich metadata or comments, score candidates, schedule itself, or select targeted windows.

AI-first periodic discovery and automatic capture are proposed only. See [AI-First YouTube Discovery](../proposals/ai-first-youtube-discovery.md); that proposal is outside the active MVP scope and does not authorize operation or implementation.

Readable capture creates an immutable capture version and one canonical ingestion job. Its processing requires a separately scheduled and supervised ingestion worker; capture itself does not publish traveler-ready knowledge.

## Setup

- Set `GEMINI_API_KEY` only in the server environment or `.env.local`. Set `YOUTUBE_DATA_API_KEY` to a server-only YouTube Data API v3 key to retrieve video durations; enable that API and allow the key to call `youtube.googleapis.com`. The command can fall back to `GEMINI_API_KEY`, but a dedicated key avoids cross-API restriction failures.
- `GEMINI_YOUTUBE_MEDIA_RESOLUTION` is optional and defaults to `MEDIA_RESOLUTION_LOW`. Use `MEDIA_RESOLUTION_MEDIUM` only when smaller on-screen detail is necessary; `MEDIA_RESOLUTION_HIGH` has the highest cost. The selected value is part of the capture cache identity.
- Set `DATABASE_URL` to the protected-tunnel/private-network application database and `CAPTURE_CACHE_DATABASE_URL` to a separate local PostgreSQL database. Run `pnpm capture-cache:migrate` before capture; commands fail closed for missing, malformed, equivalent, or uninitialized targets.
- Do not expose the key to browser code, request routes, logs, audit records, or Git.
- Create the configured service actor user before scheduled runs. Defaults are `system-youtube-capture` and `system-youtube-capture@xuyenviet.internal`.

## Current Manual Run

```bash
pnpm youtube:capture --limit 5
pnpm youtube:capture --source-id <source-id>
pnpm youtube:capture --limit 5 --yes
```

The command accepts only canonical individual videos. It gets each public duration from YouTube Data API and sends Gemini sequential 30-minute video windows with explicit start/end metadata. Gemini may return at most 20 items per window; after deduplication, the command retains up to 10 items from each window and up to 80 items per video. Each completed window, including an empty-evidence window, is cached independently. The command admits one aggregate artifact and writes production only after every window is available and timestamps are converted to video-relative offsets. This preserves coverage across long videos without retaining transcript-like output. If a later window fails, previously completed window artifacts remain safely cached, but no aggregate evidence is written to production until every required window completes.

Channels, playlists, malformed URLs, unavailable videos, provider failures, invalid model JSON, and videos with no reliable travel evidence leave raw material unchanged and record only a safe audit outcome. These failures do not create traveler-ready knowledge. Valid evidence is handled by the canonical Knowledge pipeline, whose risk-based review recommendations are separate from capture.

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

## Transcript Constraint

YouTube Data API v3 does not provide third-party transcript retrieval. Caption management/download is limited to videos the authenticated user owns or has permission to manage. Discovery and capture must not depend on transcript acquisition or use scraping to work around this constraint. Gemini URL analysis remains the supported evidence path.

## Safety And Knowledge Policy

- Gemini output is bounded evidence, never a requested or stored transcript.
- Raw evidence is operator-only. A video candidate or raw capture never enters traveler retrieval directly.
- Only policy-eligible active knowledge cards with valid current evidence may enter traveler retrieval. High-risk claims remain verification-required and caveat-only until corroborated; conflicted claims cannot support factual itinerary premises. Operator review is risk- and sampling-driven under the canonical Knowledge policy, not a general capture prerequisite.
- No Playwright, browser automation, undocumented YouTube APIs, YouTube credentials, media download, HTML, provider payload, raw prompt/response log, or third-party transcript scraping is allowed.
- Back up the local archive using encrypted storage and tested restores. It is production-critical until managed infrastructure replaces it. A production write failure is recovered by rerunning the command: the stored artifact is retried without another Gemini call.
