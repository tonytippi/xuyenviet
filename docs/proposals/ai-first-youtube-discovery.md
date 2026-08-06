# AI-First YouTube Discovery Proposal

**Status:** Proposed and outside the active MVP scope. The active PRD excludes fully automated scraping at scale and contains no YouTube-discovery requirement. This proposal automates discovery and ranking, not Gemini capture admission. Align it with the active architecture and Facebook capture contracts before creating an epic.

## Purpose

XuyenViet already captures operator-submitted individual YouTube videos with Gemini and routes timestamped bounded evidence into the Knowledge pipeline. Discovery is still manual: an operator must first find and submit each video.

This proposal adds an AI-first discovery layer that periodically finds, prioritizes, and proposes useful Vietnam road-trip videos. It optimizes for useful traveler knowledge, not for video volume. The operator decides which ranked candidates justify Gemini analysis; the system supervises discovery health and presents the evidence needed for that admission decision.

The proposal does not introduce a second knowledge lifecycle. It must reuse the existing source capture, immutable capture version, ingestion job, independent judgment, relation/conflict, freshness, review recommendation, publication, and retrieval policy.

## Decisions From Brainstorming

- The primary job is to find videos likely to contain useful travel information. Extracting knowledge is the downstream job.
- Practical information and experiential insight are both valuable.
- Practical facts can become stale; experiential reports can conflict. Existing freshness, verification, evidence, and conflict policy must apply unchanged to YouTube-derived claims.
- Discovery runs periodically. Operators may disable discovery when required.
- AI ranks candidates and recommends `skip`, targeted capture, or full capture from bounded metadata and derived signals. An operator must approve a candidate before any Gemini analysis.
- Candidates deferred after operator approval by quota or a transient provider failure remain prioritized for a later scheduled capture run. They are not individual operator incidents.
- YouTube comments are scoring signals only. They are never evidence, raw knowledge material, or traveler-visible retrieval input.
- The system generates query proposals from knowledge gaps and operational signals. Operators can inspect and manage those proposals.
- Operators need one operations control tower serving two equal needs: Knowledge Mission and Automation Health.
- The existing 30-minute Gemini capture windows remain the complete-analysis path. Targeted analysis of high-signal windows is a cost-saving fast path, not a replacement for complete analysis.

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
- Deterministic policy for skip, deferred, targeted-capture recommendation, and full-capture recommendation.
- Operator admission of ranked candidates before Gemini capture, subject to configured budgets and quotas.
- Targeted Gemini windows as an optimization before full sequential capture.
- Safe candidate/run observability and an operator control tower.
- An operator switch for discovery and operator controls for candidate admission.

### Out of scope

- Downloading videos or storing video media.
- Playwright, direct browser scraping, undocumented YouTube APIs, or transcript scraping.
- Treating YouTube comments as evidence, claims, or traveler content.
- Replacing the existing Knowledge ingestion pipeline or creating a separate YouTube claim aggregate.
- Automatically treating YouTube as official or verified.
- Sending the entire backlog to Gemini without quota, budget, and priority controls.

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
  -> deterministic recommendation and hard eligibility policy
     -> skip
     -> ranked operator admission queue
     -> operator approves targeted Gemini windows or full Gemini capture
     -> approved-capture backlog for quota/transient deferrals
  -> existing immutable capture + Knowledge ingestion pipeline
  -> active knowledge, caveat-only knowledge, review recommendation,
     suppression, verification, or conflict handling
```

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
- Comments: bounded aggregate signals and a small sanitized sample only when needed by triage. Signals may identify recency discussion, stale/changed warnings, practical-question demand, creator responsiveness, commercial-risk, or contradictory discussion.

Comments are adversarial, unverified user input. Strip or neutralize links, instruction-like content, excessive text, personally identifying content, and unsupported markup before model use. Prefer derived aggregate features or a structured summary over raw comment text. Do not retain comments as capture material and do not pass them to extraction, evidence, retrieval, or traveler UI.

### 3. AI Candidate Triage

AI triage receives the bounded candidate bundle and the discovery context. It produces typed, validated output such as:

```ts
type YoutubeCandidateTriage = {
  decision: "skip" | "defer" | "targeted_capture" | "full_capture";
  relevanceScore: number;
  expectedValueScore: number;
  freshnessFitScore: number;
  firstHandLikelihood: number;
  visualEvidenceLikelihood: number;
  commercialRiskScore: number;
  duplicateRiskScore: number;
  suggestedWindows: Array<{
    startSeconds: number;
    endSeconds: number;
    topic: string;
    reason: string;
  }>;
  reasons: string[];
  commentSignals: string[];
};
```

The scores rank candidates and explain the recommendation; they do not establish fact correctness, source verification, publication eligibility, evidence, or permission to invoke Gemini. Model output must be schema-validated, bounded, and treated as untrusted operational input.

### 4. Deterministic Recommendation, Operator Admission, And Backlog Policy

A deterministic policy evaluates model scores alongside hard constraints before a candidate can enter the operator admission queue:

- Candidate is a canonical individual public video and is not already captured at the applicable capture method/prompt version.
- Query target, locale/topic, duration, and source conditions are valid.
- Candidate is not a duplicate or near-duplicate under the configured identity/content policy.
- A requested targeted window is bounded, valid, and falls within the public video duration.

The operator sees the priority score and its factors: query/gap relevance, freshness fit, expected practical knowledge value, first-hand and visual-evidence likelihood, weak source-quality signals, and coverage/demand urgency. Views, likes, comments, and subscriber count are ranking inputs only; they never prove correctness or credibility. Commercial risk, duplicate risk, stale content, invalid scope, and unsuitable duration are explicit penalties that cannot be offset merely by popularity.

The admission view includes safe video and channel metadata, the discovery query and reason, score factors and penalties, bounded derived comment signals when available, the recommended mode and windows, and the candidate's prior XuyenViet capture outcome. An operator may approve targeted capture, approve full capture, defer, skip, or block a channel/query according to role-protected audited commands. The operator does not need to watch the entire video before admission.

Expected outcomes:

| Outcome | Meaning |
|---|---|
| `skip` | Low relevance/value, inaccessible, duplicate, invalid, or unsuitable candidate. Keep only safe audit/dedupe state. |
| `defer` | Candidate awaits an operator decision, or an operator-approved capture cannot run because of budget, quota, or transient failure. Preserve priority and retry only the approved capture in a future run. |
| `targeted_capture` | Recommend that the operator approve analysis of selected high-signal windows first. Escalate to full capture only through a bounded policy and, unless explicitly pre-authorized, a further operator decision. |
| `full_capture` | Recommend that the operator approve the existing sequential 30-minute window capture for candidates with high expected value, distributed signals, or insufficiently precise targeting. |

Quota exhaustion and transient provider failures are normal conditions for an already operator-approved capture backlog, not individual operator alerts. The scheduler retries approved captures by priority and age with bounded backoff. Persistent provider failure, an aging high-priority approved backlog, repeated no-evidence capture, or budget anomaly becomes an action-required operational signal.

### 5. Gemini Video Capture

The current complete path remains valid: sequential 30-minute windows, window-level cache artifacts, timestamp conversion, bounded evidence, and all-or-nothing aggregate production write.

Targeted capture is an extension of the same capture contract:

- It selects a small set of validated video-relative windows proposed by triage or a deterministic heuristic.
- It uses the same Gemini prompt family, bounded evidence schema, cache identity, archive, safe metadata, audit behavior, and operator-only storage boundary.
- It records why a window was selected without storing raw triage prompt/response content.
- It may escalate once to full capture according to a bounded policy. It must not repeatedly reanalyze the same video indefinitely.
- Evidence from either path still enters the same immutable capture-version and ingestion-job workflow.

Gemini-derived video evidence is evidence generation, not verification. Existing independent judgment, freshness, verification, relation/conflict, review, and retrieval eligibility policies remain authoritative.

## Operator Control Tower

The operator needs a control tower, not a noisy event feed. It has two first-class views and a shared action queue.

### Knowledge Mission

- Coverage by corridor, location, route segment, taxonomy, and seasonal need.
- High-priority gaps, stale facts, unresolved conflicts, and verification-required gaps.
- AI-generated and operator-managed query proposals, their reason, priority, state, and scheduled run.
- A ranked candidate admission queue showing safe metadata, score factors, explicit penalties, recommendation, and actions to approve targeted/full capture, defer, skip, or block a channel/query.
- Funnel outcomes: candidates found, triaged, captured, evidence generated, active cards, caveat-only cards, suppressed cards, and review recommendations.
- Drill-down from a gap to its query, discovered candidates, capture run, and resulting knowledge cards/evidence.

### Automation Health

- Discovery state: enabled/disabled, last run, next run, and most recent safe result.
- Throughput by pipeline stage, candidates awaiting operator admission, approved-capture queue depth, deferred approved-backlog age, retry state, and no-evidence rate.
- YouTube API quota, Gemini capture minutes/windows, usage/cost, remaining budget, and projected capacity.
- Provider failures, rate limits, schema failures, and retry trends using safe error codes only.
- Drill-down from a run or provider issue to affected safe candidate/run records.

### Shared Action Required

Only surface issues that need a person:

- Discovery is disabled while a high-priority coverage/freshness need exists.
- High-priority operator-approved candidates have exceeded approved-backlog-age policy.
- Persistent provider/API failure, repeated schema failure, or rate limiting prevents progress.
- Budget/cost usage is anomalous or projected to exceed the configured cap.
- A high-impact verification/conflict recommendation needs a deliberate decision.

Ordinary deferrals remain visible in the backlog but do not create notification noise.

### Control Switches

Use one audited, role-protected switch:

- **Discovery enabled:** controls scheduled query planning, YouTube search, enrichment, and new candidate creation.

Operator admission is a per-candidate command, not a global auto-capture switch. Disabling discovery stops new discovery work safely; it does not alter completed capture versions, knowledge cards, evidence, existing ingestion jobs, or captures already approved for retry.

## Alignment Required Before Epic Creation

The proposal deliberately follows the current AI-first Knowledge policy, but its new discovery and admission capability requires the following architecture and documentation decisions before creating an epic or story.

1. **Ratify operator admission separately from knowledge publication.** AD-10 already follows the canonical AI-first publication policy: a qualifying low-risk evidence-grounded card may become active without operator approval, while high-risk claims route to verification. Extend the architecture to state that operator approval controls only whether a discovery candidate may incur Gemini capture cost; it must not become a general publication prerequisite for downstream cards.
2. **Keep the YouTube runbook aligned.** `docs/runbooks/youtube-capture.md` documents only the current manual command. Update it after implementation changes so it distinguishes the scheduled discovery/ranking workflow from the operator-admitted capture path and preserves its server-only credential boundary.
3. **Reconcile Facebook documentation with canonical policy.** `docs/runbooks/facebook-capture.md` must preserve the canonical policy that review is a prioritized recommendation, not a general publication prerequisite. Decide which Facebook-specific controls remain required before implementing source discovery.
4. **Ratify source-neutral capture semantics.** A readable YouTube capture must append an immutable capture version and atomically create exactly one canonical ingestion job, exactly like readable Facebook and generic captures. Discovery candidates before Gemini capture are not readable captures and must not create ingestion jobs.
5. **Define safe operational persistence.** Specify candidate, query proposal, run, priority, operator-decision, defer/retry, budget, kill-switch, and control-tower read models. They must exclude raw comments, raw model prompts/responses, provider payloads, video media, credentials, cookies, and evidence quote/span from normal observability output.
6. **Set initial policy values through configuration.** Define reviewable configuration for ranking weights and score bands, daily/run quotas, maximum approved-backlog age, retry/backoff limits, maximum targeted windows, escalation conditions, and budget caps. Do not hard-code values into scattered scripts. Ranking must not bypass the operator admission gate.
7. **Confirm provider/API terms and quota operations.** The implementation must use only documented YouTube API capabilities and the existing Gemini URL analysis path. Validate key restrictions, quota billing, retention expectations, and failure/rate-limit monitoring before scheduled discovery reaches production.
8. **Refresh architecture and UX before epics.** This is a significant automated operations capability. Architecture must establish ownership, scheduling/worker invariants, persistence boundaries, operator admission, and AI call/usage semantics. UX must define the control tower and action-required interaction before an admin surface is built.

## Suggested Delivery Slices

The following is sequencing guidance, not yet an epic/story commitment.

1. **Policy and architecture alignment**
   Update the conflicting YouTube/Facebook policy wording, define source-neutral capture semantics, discovery ownership, scheduling, configurations, and operational privacy boundaries.
2. **Discovery foundation**
   Add query proposals, periodic scheduling, documented YouTube search, canonical candidate identity/dedupe, safe run/audit records, the discovery kill switch, and a ranked operator admission queue. No Gemini invocation occurs without a per-candidate operator decision.
3. **Enrichment and AI triage**
   Add bounded metadata/channel enrichment, derived comment signals, typed triage, deterministic recommendation, explainable ranking, operator admission commands, and budget/retry controls for approved captures.
4. **Targeted capture extension**
   Reuse current capture artifacts and evidence contract for selected windows, bounded escalation to full capture, cache identity/versioning, and idempotent recovery.
5. **Control tower**
   Deliver Knowledge Mission, Automation Health, shared action-required signals, drill-down, and operator controls. Reuse safe pipeline/job status projections rather than exposing raw sources.
6. **Evaluation and tuning**
   Measure capture yield, active-card yield, gap closure, stale/conflict outcomes, cost per useful card, deferral age, and false-positive capture rate. Adjust thresholds only through reviewed configuration.

## Acceptance Invariants

- No Playwright, direct browser scraping, undocumented YouTube APIs, video downloads, or third-party transcript scraping are introduced.
- A discovery candidate cannot become a traveler-facing fact without the existing evidence-backed Knowledge pipeline.
- Comments affect triage only; they never become evidence, capture text, cards, source bundles, or traveler UI content.
- Every readable Gemini capture is immutable, content/version identified, operator-only at raw level, and atomically obtains one canonical ingestion job.
- AI triage cannot override hard eligibility, operator admission, privacy, evidence, verification, conflict, or publication gates.
- Automation routes grounded high-risk claims to `verify_first`; only an authorized operator may revise or publish them with available validated evidence. Conflicted claims cannot support factual itinerary premises.
- Quota and provider deferrals retry by priority and age without notification noise; persistent failures and aging high-priority work become action-required.
- Operators can disable discovery, and only an authorized operator can admit a candidate to Gemini capture; stopping discovery does not mutate completed knowledge.
- Control-tower projections and logs expose only safe operational summaries, never secrets, raw comments, raw source material, model prompts/responses, provider payloads, or evidence spans.
- AI usage, model/prompt/capture method versions, safe failure status, and cost metadata remain attributable and observable under the established usage/audit model.

## Open Design Questions

- What initial threshold/configuration values balance coverage, cost, and false-positive capture for Vietnamese road-trip video discovery?
- Which demand signals from AI Ask are safe and sufficiently aggregated to feed query proposals without exposing traveler content?
- What retention window applies to skipped/deferred candidate metadata and sanitized comment-derived signals?
- What is the minimum evidence yield or priority condition that triggers targeted-to-full capture escalation?
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
