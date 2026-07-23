# YouTube Capture Operations

`pnpm youtube:capture` is the server-side Gemini evidence-capture operation for canonical individual YouTube videos. It reads queued sources from the production database, checks a separate local archive before requiring Gemini credentials, and sends only cache misses to Gemini. Validated bounded evidence is archived before it is flushed into operator-only source material and the canonical Knowledge ingestion pipeline.

## Status And Direction

The current command captures videos that have already been submitted and queued. It does not yet discover videos, enrich metadata/comments, score candidates, schedule itself, or select targeted windows.

The approved direction is AI-first periodic YouTube discovery: the system will generate and run gap-driven queries, triage enriched candidates, and automatically capture eligible videos within policy and budget. The operator will supervise health, cost, coverage, and genuine exceptions rather than approve ordinary candidates. This must be implemented only after the architecture, Facebook capture policy, and control-tower design are aligned as described in [AI-First YouTube Discovery Proposal](./ai-first-youtube-discovery-proposal.md).

The discovery proposal does not create a separate knowledge lifecycle. Any readable YouTube evidence must continue through the existing immutable capture-version, ingestion, independent-judgment, freshness, verification, relation/conflict, publication, and retrieval policy. Capture already creates the immutable capture version and its canonical ingestion job; processing that job requires the separately scheduled/supervised ingestion worker.

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

## AI-First Discovery Contract

This section is the required operating contract for the planned discovery capability. It is not a statement that these controls are already implemented.

```text
knowledge gaps, freshness, conflicts, demand + operator queries
  -> scheduled YouTube search and safe enrichment
  -> AI triage + deterministic admission policy
  -> skip | defer | targeted capture | full capture
  -> existing Gemini evidence capture and Knowledge pipeline
```

- Query proposals are generated from coverage gaps, freshness-sensitive knowledge, unresolved conflicts, demand signals, and operator-managed queries. Operators can inspect and manage proposals.
- Video and channel metadata may inform triage, including title, bounded description, publish date, duration, views, likes, comment count, channel subscriber count when available, and XuyenViet's own historical source-quality signals.
- Comments are only untrusted scoring signals. Use bounded, sanitized aggregate signals or samples to identify recency, stale/changed discussion, practical demand, creator responsiveness, commercial risk, or contradictions. Comments never become evidence, raw capture material, knowledge cards, source bundles, or traveler UI content.
- AI triage ranks relevance, expected value, freshness fit, first-hand likelihood, visual-evidence likelihood, commercial risk, duplicate risk, and suggested windows. It cannot establish facts, verification, evidence, or publication eligibility.
- Deterministic policy must enforce canonical URL/identity, dedupe, duration/window validity, configured budget, provider quota, and retry limits. Scores never override a hard gate.
- `defer` preserves priority and retries in a later scheduled run when quota, budget, or transient provider conditions prevent work. It is not an individual operator incident. Persistent provider failures, aging high-priority backlog, or cost anomalies become action-required signals.
- Targeted capture may analyze selected valid video-relative windows first and escalate at most once to full sequential capture under bounded policy. Full capture remains the complete-analysis path.
- Discovery and auto-capture require independent audited, role-protected kill switches. Disabling discovery stops new query/search/enrichment work. Disabling auto-capture allows triage/backlog creation but prevents new Gemini calls. Neither switch mutates completed captures, evidence, cards, or ingestion jobs.
- An operator control tower must expose both Knowledge Mission (coverage, freshness, conflicts, outcomes) and Automation Health (switches, run state, backlog, quota, cost, provider failures), with only actionable exceptions promoted above normal deferred work.

## Transcript Constraint

YouTube Data API v3 does not provide third-party transcript retrieval. Caption management/download is limited to videos the authenticated user owns or has permission to manage. Discovery and capture must not depend on transcript acquisition or use scraping to work around this constraint. Gemini URL analysis remains the supported evidence path.

## Safety And Knowledge Policy

- Gemini output is bounded evidence, never a requested or stored transcript.
- Raw evidence is operator-only. A video candidate or raw capture never enters traveler retrieval directly.
- Only policy-eligible active knowledge cards with valid current evidence may enter traveler retrieval. High-risk claims remain verification-required and caveat-only until corroborated; conflicted claims cannot support factual itinerary premises. Operator review is risk- and sampling-driven under the canonical Knowledge policy, not a general capture prerequisite.
- No Playwright, browser automation, undocumented YouTube APIs, YouTube credentials, media download, HTML, provider payload, raw prompt/response log, or third-party transcript scraping is allowed.
- Back up the local archive using encrypted storage and tested restores. It is production-critical until managed infrastructure replaces it. A production write failure is recovered by rerunning the command: the stored artifact is retried without another Gemini call.
