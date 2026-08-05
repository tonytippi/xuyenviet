# YouTube Capture Operations

`youtube:capture` is an explicit, operator-controlled server command. It is not a Worker task and must not be scheduled.

## Prerequisites

- Set distinct PostgreSQL `DATABASE_URL` and `CAPTURE_CACHE_DATABASE_URL` values, then initialize the cache with `pnpm capture-cache:migrate`.
- Set `GEMINI_API_KEY` only in the operator/server environment. A cache hit does not require it.
- Set `YOUTUBE_DATA_API_KEY` for public video duration lookups, or allow the documented fallback to `GEMINI_API_KEY`.
- Optionally set `GEMINI_YOUTUBE_MODEL` and `GEMINI_YOUTUBE_MEDIA_RESOLUTION`. The resolution must be `MEDIA_RESOLUTION_LOW`, `MEDIA_RESOLUTION_MEDIUM`, or `MEDIA_RESOLUTION_HIGH`.

## Run

```bash
pnpm youtube:capture --limit 5
pnpm youtube:capture --source-id <source-id>
pnpm youtube:capture --limit 5 --yes
```

`--limit` accepts 1 through 25. The default is 5. Without `--yes`, the operator confirms bounded evidence before product persistence. The command validates canonical individual YouTube URLs, replays aggregate cache artifacts first, and on a miss obtains duration then processes 30-minute windows sequentially. It writes only through the capture domain API with the fixed `system-youtube-capture` audit actor.

Provider keys and responses remain operator/server-only. Do not expose them to browser code, request paths, logs, audit records, or the cache. Do not use browser automation, transcript scraping, direct database writes, a Worker adapter, or a scheduler as a substitute.

## Recovery

If cache initialization fails, run `pnpm capture-cache:migrate` against the intended separate cache database. If product persistence fails after an artifact is admitted, rerun the same bounded command to replay cached work without another Gemini request.
