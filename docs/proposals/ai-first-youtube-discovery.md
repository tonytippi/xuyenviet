# AI-First YouTube Discovery Proposal

**Status:** Approved Discovery scope. The active PRD addendum ratifies this bounded URL-only capability. The PRD continues to exclude fully automated scraping at scale: Discovery uses only documented YouTube Data API metadata and bounded AI triage. It produces a ranked list of canonical video URLs for operator review; an operator accepts a URL through the existing Knowledge intake API, then `youtube:capture` remains manual. Discovery never writes or owns a Knowledge `source`.

## Purpose

XuyenViet already captures operator-submitted individual YouTube videos with Gemini and routes timestamped bounded evidence into the Knowledge pipeline. Discovery is still manual: an operator must first find and submit each video.

This proposal adds an AI-first discovery layer that periodically finds, prioritizes, and proposes useful Vietnam road-trip videos. It optimizes for useful traveler knowledge, not for video volume. The operator decides which ranked URLs justify manual submission to the existing Gemini capture workflow; the system supervises discovery health and presents the information needed for that decision.

Discovery is a URL consideration workflow, not source intake. Searching, enrichment, and AI triage create only a candidate for a canonical video URL. They do not write or own a Knowledge `source`, raw source material, capture version, ingestion job, evidence, or card. A role-protected Discovery accept command calls the existing Knowledge intake API, which independently creates any queued source; Knowledge exclusively owns the source and all downstream lifecycle state.

The proposal does not introduce a second knowledge lifecycle. It must reuse the existing source capture, immutable capture version, ingestion job, independent judgment, relation/conflict, freshness, review recommendation, publication, and retrieval policy.

## Decisions From Brainstorming

- The primary job is to find videos likely to contain useful travel information. Extracting knowledge is the downstream job.
- Practical information and experiential insight are both valuable.
- Practical facts can become stale; experiential reports can conflict. Existing freshness, verification, evidence, and conflict policy must apply unchanged to YouTube-derived claims.
- Discovery runs periodically. Operators may disable discovery when required.
- AI ranks candidates and recommends `skip` or `consider` from bounded metadata and derived signals. An operator accepts a candidate through the existing Knowledge intake API before any Gemini analysis.
- YouTube comments are scoring signals only. They are never evidence, raw knowledge material, or traveler-visible retrieval input.
- The system generates query proposals from knowledge gaps and operational signals. Operators can inspect and manage those proposals.
- Operators need one operations control tower serving two equal needs: Knowledge Mission and Automation Health.
- The existing 30-minute Gemini capture windows remain the only capture path in scope.

## Existing Baseline

The current `pnpm youtube:capture` flow accepts a queued canonical individual-video URL. It gets duration through YouTube Data API v3 and asks Gemini to analyze sequential 30-minute windows. It returns bounded, timestamped travel evidence and never requests or stores a transcript, downloaded media, HTML, browser data, provider payloads, or raw prompts/responses. See [YouTube Capture Operations](../runbooks/youtube-capture.md).

The current Knowledge pipeline owns the canonical lifecycle for readable captures:

```text
immutable capture version
  -> one canonical ingestion job
  -> triage -> extraction -> independent judgment -> relation/conflict
  -> active | suppressed | review_recommended | verify_first | failed
```

Only policy-eligible active cards can enter traveler retrieval. Automation routes grounded high-risk road, safety, EV, price, availability, booking, promotion, and opening-hours claims to `verify_first`; an authorized operator may revise or publish the card with its available validated evidence. A one-source operator-authorized publication does not imply a corroborated community pattern. Conflicted claims cannot become factual itinerary premises. These are established in the active PRD and architecture spine.

Facebook capture established useful operational boundaries that this proposal preserves: separate capture archive, safe audit actor, idempotent replay after a production write failure, bounded operator-only source material, and no raw source content in operational logs. See [Facebook Capture Operations](../runbooks/facebook-capture.md).

## Scope And Non-Goals

### In scope

- Periodic YouTube video discovery from operator-managed and AI-proposed queries.
- Query proposals derived from knowledge coverage gaps, freshness risk, unresolved conflicts, and traveler-demand signals.
- YouTube Data API discovery and bounded video/channel/comment enrichment.
- AI triage of enriched candidates.
- Deterministic policy for skip, defer, and consider recommendations.
- Ranked canonical URL candidates for operator review and acceptance through the existing Knowledge intake API.
- Safe candidate/run observability and an operator control tower.
- An operator switch for discovery and operator controls for candidate review.

### Out of scope

- Downloading videos or storing video media.
- Playwright, direct browser scraping, undocumented YouTube APIs, or transcript scraping.
- Treating YouTube comments as evidence, claims, or traveler content.
- Replacing the existing Knowledge ingestion pipeline or creating a separate YouTube claim aggregate.
- Automatically treating YouTube as official or verified.
- Automatically submitting any discovered URL to Gemini or the Knowledge source-intake workflow.

## Technical Constraint: Transcripts

YouTube Data API v3 can manage/download captions only for videos that the authenticated user owns or has permission to manage. It is not a third-party transcript retrieval API.

Discovery and capture therefore must not depend on transcript acquisition. The supported evidence path is the existing Gemini URL analysis, which observes the public video and returns bounded timestamped evidence. If a lawful, explicitly supported transcript source becomes available later, it may be a supplementary triage input, but it must not be required for this design or used to bypass YouTube controls.

## Proposed Flow

```text
coverage/freshness/conflict/demand signals + operator query catalog
  -> query proposal and periodic scheduling
  -> YouTube Data API search
  -> canonical video dedupe and metadata enrichment
  -> bounded channel and comment scoring signals
  -> AI triage with structured output
  -> deterministic recommendation and eligibility policy
       -> skip
       -> ranked operator review list
       -> operator accepts a canonical URL through existing Knowledge intake API
       -> existing immutable capture + Knowledge ingestion pipeline
```

### Ownership And Execution Boundary

```text
Discovery scheduler
  -> YouTube Data API search/enrichment + bounded AI metadata triage
  -> youtube_discovery_candidate (URL consideration only; no Knowledge source)
  -> operator accepts URL; Discovery calls existing Knowledge intake API

Manual Knowledge intake and youtube:capture execution
  -> claims only queued, operator-submitted YouTube sources
  -> Gemini analysis under the existing capture contract
  -> immutable capture version -> one canonical ingestion job -> Knowledge lifecycle
```

Discovery never invokes Gemini video analysis and never creates a Knowledge source, capture version, or ingestion job. Its AI triage is a separate bounded metadata-classification call, with no video-media input. The existing Knowledge intake and operator-controlled `youtube:capture` commands exclusively create/execute capture work. Discovery must not schedule, invoke, or enqueue either command.

### 1. Query Planning

The system periodically produces query proposals, with an operator-visible reason and priority. Sources include:

- Coverage gaps by corridor, location, route segment, taxonomy, and season.
- Freshness-sensitive active cards approaching a configured staleness horizon.
- Conflicted cards that need independent current evidence.
- Missing high-value categories such as road condition, charging, rest stops, parking, family suitability, costs, accommodation, food, and attractions.
- AI Ask demand signals where retrieval is absent, sparse, caveat-only, or repeatedly falls back to search.
- Operator-created or edited evergreen queries.

A proposal is not a fact and must not write a knowledge card. It records the reason, target geography/taxonomy, priority, query text, schedule state, and safe summary of the signal that generated it.

### 2. Candidate Enrichment

Use documented YouTube Data API endpoints and retain only bounded, safe operational fields needed for triage:

- Video: canonical video ID/URL, title, bounded description, channel ID/name, published time, duration, category/tags when available, views, likes, comment count, thumbnail reference, and discovery query/proposal identity.
- Channel: subscriber count when publicly available, published-video count, and XuyenViet's own historical source-quality signals. Subscriber count is a weak credibility signal, never proof.
- Comments: bounded derived aggregate signals only. Signals may identify recency discussion, stale/changed warnings, practical-question demand, creator responsiveness, commercial-risk, or contradictory discussion. No comment text or reconstructed comment summary reaches triage.

Comments are adversarial, unverified user input. Derive only closed aggregate features before model use; do not pass sanitized samples, summaries, raw text, links, or instruction-like content to triage. Do not retain comments as capture material and do not pass them to extraction, evidence, retrieval, or traveler UI.

### 3. AI Candidate Triage

AI triage receives the bounded candidate bundle and the discovery context. It produces a typed, validated metadata assessment only:

```ts
type YoutubeCandidateTriage = {
  relevanceScore: number;
  expectedValueScore: number;
  freshnessFitScore: number;
  commercialRiskScore: number;
  duplicateRiskScore: number;
  derivedSignalCodes: DiscoveryCommentSignal[];
};
```

Each score is finite and within `0..1`; derived-signal codes are a bounded deduplicated subset of the closed signal vocabulary already supplied to the model. No model decision, free-text reason, raw response, arbitrary JSON, or recommendation explanation is persisted. The scores inform later deterministic policy; they do not establish fact correctness, source verification, publication eligibility, evidence, or permission to invoke Gemini. Model output must be schema-validated, bounded, and treated as untrusted operational input.

### 4. Deterministic Recommendation And Operator Review

A deterministic policy evaluates model scores alongside hard constraints before a candidate appears in the operator review list. The candidate remains Discovery-owned and has no `sources` row:

- Candidate is a canonical individual public video and is not already captured at the applicable capture method/prompt version.
- Query target, locale/topic, duration, and source conditions are valid.
- Candidate is not a duplicate or near-duplicate under the configured identity/content policy.

The operator sees the priority score and its factors: query/gap relevance, freshness fit, expected practical knowledge value, first-hand and visual-evidence likelihood, weak source-quality signals, and coverage/demand urgency. Views, likes, comments, and subscriber count are ranking inputs only; they never prove correctness or credibility. Commercial risk, duplicate risk, stale content, invalid scope, and unsuitable duration are explicit penalties that cannot be offset merely by popularity.

The review view includes safe video and channel metadata, the discovery query and reason, score factors and penalties, bounded derived comment signals when available, and the candidate's prior XuyenViet capture outcome. An operator may accept, defer, or skip a candidate through role-protected audited commands. The accept command calls the existing Knowledge intake API, which alone can create a queued YouTube `source`; the later `youtube:capture` execution remains a separate manual operator action. Discovery does not invoke Gemini or track the capture lifecycle. Channel/query blocking is deferred.

Expected outcomes:

| Outcome | Meaning |
|---|---|
| `skip` | Low relevance/value, inaccessible, duplicate, invalid, or unsuitable candidate. Keep only safe audit/dedupe state. |
| `defer` | Candidate awaits a later operator decision. Preserve its priority for the next review. |
| `consider` | Candidate is a useful URL for operator review. An operator may accept it through the existing Knowledge intake API. |

The existing `youtube:capture` runbook owns provider quota, transient failure, retry, cache replay, and Gemini-capture operations once Knowledge intake has created a source. Discovery does not create a capture backlog or retry capture work. A persistent discovery API failure, repeated triage schema failure, or provider rate limiting becomes an action-required operational signal.

## Operator Control Tower

The operator needs a control tower, not a noisy event feed. It has two first-class views and a shared action queue.

### Knowledge Mission

- Coverage by corridor, location, route segment, taxonomy, and seasonal need.
- High-priority gaps, stale facts, unresolved conflicts, and verification-required gaps.
- AI-generated and operator-managed query proposals, their reason, priority, state, and scheduled run.
- A ranked candidate review list showing safe metadata, score factors, explicit penalties, recommendation, and actions to accept, defer, or skip.
- Funnel outcomes through discovery: candidates found, triaged, considered, deferred, skipped, and accepted. Capture and Knowledge outcomes remain in their existing operational views.
- Drill-down from a gap to its query and discovered candidates. Capture runs and resulting knowledge remain linked through existing Knowledge views only when independently available.

### Automation Health

- Discovery state: enabled/disabled, last run, next run, and most recent safe result.
- Throughput by discovery stage, candidates awaiting operator review, deferred-candidate age, and triage schema-failure rate.
- YouTube Data API rate-limit state and discovery AI-triage usage/cost where available.
- Discovery provider failures, rate limits, and schema-failure trends using safe error codes only.
- Drill-down from a run or provider issue to affected safe candidate/run records.

### Shared Action Required

Only surface issues that need a person:

- Discovery is disabled while a high-priority coverage/freshness need exists.
- High-priority candidates have exceeded the operator-review-age policy.
- Persistent discovery provider/API failure, repeated schema failure, or rate limiting prevents progress.
- A high-impact verification/conflict recommendation needs a deliberate decision.

Ordinary deferrals remain visible in the backlog but do not create notification noise.

### Control Switches

Use one audited, role-protected switch:

- **Discovery enabled:** controls scheduled query planning, YouTube search, enrichment, AI triage, and new candidate creation. It does not control `youtube:capture`.

Operator review acceptance submits a URL only to existing Knowledge intake; it does not schedule or execute capture. Disabling discovery fences in-flight Discovery stages before provider calls or writes, stops new Discovery work safely, and does not alter completed capture versions, knowledge cards, evidence, existing ingestion jobs, or sources created through Knowledge intake awaiting manual capture.

## Alignment Required Before Epic Creation

The proposal deliberately follows the current AI-first Knowledge policy, but its new Discovery capability requires the following architecture and documentation decisions before creating an epic or story.

1. **Ratify Discovery as URL-only and separate it from Knowledge intake and publication.** Discovery owns candidates only. It never writes a `sources` row or invokes Gemini. A Discovery accept command delegates URL submission to the existing Knowledge intake API; a later `youtube:capture` execution remains manual. Candidate review must not become a general publication prerequisite for downstream cards.
2. **Keep the YouTube runbook unchanged for capture.** `docs/runbooks/youtube-capture.md` remains the operator-controlled, unscheduled capture contract. Scheduled Discovery is limited to query planning, YouTube API search/enrichment, and metadata triage; it must not schedule, invoke, or enqueue `youtube:capture`.
3. **Ratify source-neutral capture semantics as inherited policy.** A readable YouTube capture appends an immutable capture version and atomically creates exactly one canonical ingestion job, exactly like readable Facebook and generic captures. Discovery candidates are not readable captures and never create ingestion jobs.
4. **Define safe operational persistence.** Specify candidate, query proposal, run, priority, operator-review action, kill-switch, and control-tower read models. They must exclude raw comments, raw model prompts/responses, provider payloads, video media, credentials, cookies, and evidence quote/span from normal observability output.
5. **Set initial policy values through configuration.** Define reviewable configuration for ranking weights and score bands, bounded worker concurrency/retry behavior, maximum operator-review age, and candidate retention. Do not hard-code values into scattered scripts. Ranking must not bypass the Knowledge intake and manual capture boundaries.
6. **Confirm provider/API terms and quota operations.** The implementation must use only documented YouTube API capabilities and bounded metadata triage. Validate key restrictions, quota billing, retention expectations, and failure/rate-limit monitoring before scheduled discovery reaches production.
7. **Refresh architecture and UX before epics.** This is a significant automated operations capability. Architecture must establish ownership, scheduling/worker invariants, persistence boundaries, safe AI-triage/usage semantics, and the manual handoff to capture. UX must define the control tower and action-required interaction before an admin surface is built.

## Suggested Delivery Slices

The following is sequencing guidance, not yet an epic/story commitment.

1. **Policy and architecture alignment**
   Define Discovery ownership, scheduling, configuration, operational privacy boundaries, and the manual handoff to the existing YouTube capture runbook.
2. **Discovery foundation**
   Add query proposals, periodic scheduling, documented YouTube search, canonical candidate identity/dedupe, safe run/audit records, the discovery kill switch, and a ranked operator review list. Discovery never invokes Gemini or creates a Knowledge source.
3. **Enrichment and AI triage**
   Add bounded metadata/channel enrichment, derived comment signals, typed triage, deterministic recommendation, explainable ranking, and operator-review commands that call the existing Knowledge intake API.
4. **Control tower**
   Deliver Knowledge Mission, Automation Health, shared action-required signals, drill-down, and operator controls. Reuse safe Discovery and existing Knowledge projections rather than exposing raw sources.
5. **Evaluation and tuning**
   Measure operator consideration rate, gap coverage, deferred-review age, false-positive recommendation rate, and triage usage where available. Capture and card yield remain reported by existing Knowledge operations. Adjust thresholds only through reviewed configuration.

## Acceptance Invariants

- No Playwright, direct browser scraping, undocumented YouTube APIs, video downloads, or third-party transcript scraping are introduced.
- A discovery candidate cannot become a traveler-facing fact without the existing evidence-backed Knowledge pipeline.
- Comments affect triage only; they never become evidence, capture text, cards, source bundles, or traveler UI content.
- Every readable Gemini capture remains immutable, content/version identified, operator-only at raw level, and atomically obtains one canonical ingestion job through the existing capture workflow.
- AI triage cannot override hard eligibility, the manual capture boundary, privacy, evidence, verification, conflict, or publication gates.
- Automation routes grounded high-risk claims to `verify_first`; only an authorized operator may revise or publish them with available validated evidence. Conflicted claims cannot support factual itinerary premises.
- Discovery provider deferrals retain candidate priority without notification noise; persistent failures, rate limiting, and aging high-priority review work become action-required.
- Operators can disable discovery. Discovery acceptance can submit a candidate only to existing Knowledge intake; only the manual `youtube:capture` workflow invokes Gemini. Stopping discovery does not mutate completed knowledge.
- Control-tower projections and logs expose only safe operational summaries, never secrets, raw comments, raw source material, model prompts/responses, provider payloads, or evidence spans.
- Discovery AI usage, model/prompt versions, safe failure status, and cost metadata remain attributable and observable under the established usage/audit model.

## Open Design Questions

- What initial threshold/configuration values balance coverage, cost, and false-positive capture for Vietnamese road-trip video discovery?
- Which demand signals from AI Ask are safe and sufficiently aggregated to feed query proposals without exposing traveler content?
- What retention window applies to skipped/deferred candidate metadata and sanitized comment-derived signals?
- Which control-tower metrics are live versus periodically aggregated, and what latency is acceptable for operator decisions?
- How should an operator override, pause, resume, or reprioritize a query proposal or candidate while preserving auditability?

## Source References

- `docs/runbooks/youtube-capture.md`
- `docs/runbooks/facebook-capture.md`
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md` (AD-10)
- `_bmad-output/implementation-artifacts/epic-3-context.md`
- `_bmad-output/implementation-artifacts/3-4-establish-source-version-ingestion-job-claiming.md`
- `_bmad-output/implementation-artifacts/4-1-migrate-retrieval-to-state-aware-active-knowledge.md`
- `_bmad-output/implementation-artifacts/4-4-enforce-community-conditional-and-conflict-answer-policy.md`
