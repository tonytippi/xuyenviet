# YouTube Capture Operations

`pnpm youtube:capture` is an operator-controlled server script. It reads queued individual YouTube video sources, sends the canonical URL and a bounded evidence prompt to Gemini, then stores validated evidence in operator-only raw material for the existing extraction, review, and approval workflow.

## Setup

- Set `GEMINI_API_KEY` only in the server environment or `.env.local`.
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
