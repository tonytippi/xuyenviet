# YouTube Discovery Operations

YouTube Discovery is a Worker-owned, operator-only capability that finds and ranks canonical individual-video URLs for review. It is URL-only: it never creates a Knowledge source, capture version, ingestion job, evidence, or card, and it never invokes, schedules, enqueues, or retries `youtube:capture`.

## Current Delivery Status

- Implemented: governed Discovery policy, scheduled Worker execution, system and operator query proposals, documented YouTube Data API search, canonical candidate deduplication, bounded enrichment, derived comment signals, AI Gateway metadata triage, deterministic recommendations, candidate review, and `accept`/`defer`/`skip` decisions.
- Implemented: accepting a candidate delegates its canonical URL to the existing Knowledge intake API. Capture remains a separate manual operator action under [YouTube Capture Operations](./youtube-capture.md).
- In progress: the Action Required queue. Its core route and projection exist, but source-level pagination remains open.
- Not yet delivered: Knowledge Mission drill-downs, Automation Health views, the global Discovery enablement control, and final control-tower accessibility and operational-boundary verification.
- Before enabling Discovery in an environment, apply the Discovery migrations and complete the Worker credential, provider quota, and failure-monitoring rollout validation recorded in Epic 18.

The authoritative delivery record is [sprint status](../../_bmad-output/implementation-artifacts/sprint-status.yaml). Product and technical limits remain governed by the PRD addendum and the Discovery architecture spine.

## Prerequisites

- Apply every pending forward Drizzle migration before starting the Worker. Discovery schema and policy versions must match the deployed application.
- Provide the documented YouTube Data API configuration in the Worker environment. Do not put API keys in browser code, audit records, logs, or admin routes.
- Configure an eligible AI Gateway model for the `youtube_discovery_triage` purpose. This is metadata triage only, not Gemini video analysis.
- Start the dedicated Worker with `pnpm worker`. The Worker includes the `youtube-discovery` adapter alongside the existing Worker adapters.
- Confirm an authorized operator can use the Discovery admin surface before relying on review actions.

## Operating Flow

1. The Worker plans or executes eligible Discovery queries while the persisted Discovery policy permits it.
2. It uses documented YouTube Data API metadata, creates or updates a canonical video candidate, and stores only bounded operational fields and derived closed comment signals.
3. The AI Gateway produces schema-validated metadata scores. Deterministic policy produces an immutable `skip`, `defer`, or `consider` recommendation.
4. An operator opens the candidate review workspace and chooses one action:
   - `Accept` sends the canonical URL to the existing Knowledge intake API. A returned `submitted` or `duplicate` result marks the candidate accepted.
   - `Defer` preserves the candidate for later review.
   - `Skip` closes it as unsuitable for review.
5. For an accepted candidate, an operator separately runs `pnpm youtube:capture` under the YouTube Capture runbook. Discovery has no capture backlog and does not track capture lifecycle as its own state.

## Safe Checks And Recovery

- Review only safe candidate metadata, query context, deterministic score factors, derived signal codes, recommendation, and operator state. Popularity, subscriber count, and comments are ranking signals, never evidence or verification.
- For an unavailable review item, reload the review workspace rather than retrying a decision blindly. Candidate decisions are server-fenced against concurrent state changes and Knowledge intake handoff outcomes.
- For provider or Worker failures, use the safe operational error/status projection. Do not inspect or copy raw provider responses, comments, prompts, source material, transcripts, credentials, or cookies into tickets or logs.
- A rate limit or repeated safe failure can appear in the Action Required queue. The detailed Automation Health workflow is not delivered yet; do not infer provider diagnosis from ordinary transient failures.
- Do not use browser scraping, transcript scraping, downloaded media, direct database writes, or a manual scheduler to bypass the Worker and admin-command boundaries.

## Boundaries

- Discovery candidates are not Knowledge sources and cannot become traveler-facing facts without the existing Knowledge capture and ingestion pipeline.
- Comment text, summaries, and links are never retained or passed to triage. Only bounded closed aggregate signals are used.
- Discovery policy is database-owned and audited. Do not add environment-only policy overrides or alter Discovery tables directly.
- Disabling Discovery, when the audited control is delivered, must stop new Discovery work only. It must not alter queued Knowledge sources, completed captures, evidence, cards, or manual capture execution.
