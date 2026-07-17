---
title: 'Story 4.10: Analyze YouTube Video Sources With Gemini For Knowledge Extraction'
type: 'feature'
created: '2026-07-17'
status: 'ready-for-development'
---

## Intent

Add an operator-run `pnpm youtube:capture` command that consumes queued individual YouTube sources. The command uses `GEMINI_API_KEY` directly and only in the server-run script, asks Gemini for bounded Vietnamese travel evidence, and atomically stores normalized operator-only evidence with a safe audit event. Existing generic extraction, draft review, and approval remain the only route to traveler retrieval.

## Boundaries

- Add `youtube` as a URL-bearing, community/unverified source kind. Intake accepts watch, short, live, and `youtu.be` URLs and normalizes individual videos to a canonical watch URL. Channel URLs are retained as YouTube sources but capture fails safely without provider use.
- Do not use the AI Gateway, Playwright, browser scraping, a client-side key, a transcript request, media download, or a full Gemini response store.
- Use native Gemini REST with `GEMINI_API_KEY`, a configured `GEMINI_YOUTUBE_MODEL` default, JSON-only response mode, a bounded evidence prompt, timeout, and safe status-derived errors.
- Validate response JSON strictly: at most 20 evidence items; allowed categories/evidence types/confidence; bounded Vietnamese claim and excerpt; finite non-negative timestamp range; boolean freshness flag. Empty evidence is a non-error no-op with no raw material write.
- Persist a bounded normalized evidence document in `raw_source_material.raw_text` plus allowlisted capture metadata only. Audit summaries state method/outcome/timestamp and never include evidence, response text, API keys, provider payloads, or provider error bodies.

## Files

- `src/db/schema.ts`, migration metadata, and generated migration: add `youtube` source kind and URL constraints.
- `src/features/knowledge/sources.ts`: classify and canonicalize YouTube URLs as community/unverified sources.
- `src/features/knowledge/youtube-capture.ts`: queue, schema validation, evidence serialization, safe metadata, atomic persistence, and audit writing.
- `scripts/youtube-capture.ts`: CLI parsing, service actor resolution, Gemini REST call, confirmation, and safe failure reporting.
- `package.json` and `.env.example`: expose `youtube:capture` and document only the required server environment variables.
- `docs/youtube-capture-operations.md`: operator setup, queue, capture, review handoff, and safety constraints.
- Focused source, capture, and script tests: cover canonical URLs, queue isolation, strict parsing, empty/no-write result, metadata/audit redaction, and no-overwrite races.

## Acceptance

- Given a valid queued individual YouTube video and configured key, when capture returns valid non-empty evidence, then bounded evidence is saved atomically as operator-only raw material and an audit event contains no evidence text.
- Given no valid travel evidence, an unsupported URL, missing key, a provider error, or invalid model JSON, when capture runs, then no raw material or draft is fabricated and the command reports only a safe failure code.
- Given a captured source, when generic extraction runs, then it can use the raw evidence and its drafts remain unverified pending existing human review/approval.
- Given any normal traveler request, then raw YouTube evidence and capture metadata remain outside retrieval and public source shapes.
