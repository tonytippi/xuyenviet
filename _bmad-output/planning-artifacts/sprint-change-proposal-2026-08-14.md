# Sprint Change Proposal: Vietnamese-First YouTube Discovery Quality

**Date:** 2026-08-14  
**Project:** xuyenviet  
**Change scope:** Moderate, direct adjustment through a new corrective epic  
**Status:** Approved 2026-08-14

## 1. Issue Summary

YouTube Discovery is operational, but its current output does not reliably serve the system's actual audience. Most users are Vietnamese people planning domestic road trips, while the current discovery pool is dominated by English queries and foreign-language videos about Vietnam. Many recommendations are also too short to provide useful planning context.

Read-only production data inspection found:

- 69 recommendations from 156 candidates and 157 appearances.
- 33 of 69 recommendations were shorter than 60 seconds; 37 of 69 were shorter than 3 minutes.
- Only 25 of 69 recommendation titles contained Vietnamese diacritics, a conservative heuristic rather than authoritative language metadata.
- All 23 `consider` recommendations came from English queries; none had a title with Vietnamese diacritics.
- Three English query patterns generated 105 of 157 appearances: `Vietnam general travel tip`, `Vietnam hotel area`, and `Vietnam cost note`.

The implementation sends raw geography/taxonomy-derived query text to YouTube. Although provider parameters include `regionCode=VN` and `relevanceLanguage=vi`, those values influence ranking and availability; they do not guarantee Vietnamese-language content or Vietnamese-user relevance. Enrichment currently does not turn provider language/audio-language metadata into a deterministic gate, and duration is not rejected before costly downstream enrichment and AI triage.

This is a product-fit correction, not a rollback: content merely being about Vietnam is insufficient. Discovery must optimize first for Vietnamese users, Vietnamese-language content, Vietnamese road-user context, and a useful minimum duration.

## 2. Impact Analysis

### Correct Course Checklist

- [x] 1.1 Trigger identified in the delivered Epic 18–20 YouTube Discovery flow.
- [x] 1.2 Category identified: mismatch with existing locale/duration intent plus clarified stakeholder requirement that most actual users are Vietnamese.
- [x] 1.3 Evidence gathered from read-only database inspection and implementation review.
- [x] 2.1 Completed Epics 18–20 remain historical and are not reopened or rewritten.
- [x] 2.2 Add corrective Epic 22 with three sequenced stories.
- [x] 2.3 Execute Epic 22 before resuming Epic 21.
- [x] 2.4 No existing epic becomes obsolete.
- [x] 2.5 No rollback or MVP scope reduction is required.
- [x] 3.1 PRD requires explicit Vietnamese-first audience, query, eligibility, and measurable quality requirements.
- [x] 3.2 Architecture requires a versioned Vietnamese query builder and pre-AI language/duration gates.
- [x] 3.3 UX requires operator-visible video metadata and separation of Vietnamese-first results from foreign fallback.
- [x] 3.4 Epics, stories, tests, telemetry, and sprint status require coordinated updates.
- [x] 4.1 Direct adjustment is viable with medium effort and medium risk.
- [N/A] 4.2 Rollback is not viable because it would remove working Discovery capability without fixing audience fit.
- [N/A] 4.3 MVP reduction is unnecessary because the correction narrows quality toward the actual MVP audience.
- [x] 4.4 Recommended course: implement Epic 22 as a focused correction with no new service, queue, provider, dependency, deployment component, or historical-data job.

### Scope Boundaries

- Preserve the completed URL-only discovery, Knowledge handoff, manual capture, Worker leases/fencing/retries, candidate jobs, audit, and usage boundaries.
- Apply the new policy only to discovery runs created after the change.
- Do not backfill, reconcile, supersede, or mutate historical candidates, appearances, recommendations, or operator decisions.
- Calculate new Vietnamese-first quality metrics only for recommendations produced by the new policy version.
- Retain foreign-language content only as a bounded, explicitly separated fallback when no qualified Vietnamese candidate exists for the same need.

## 3. Recommended Approach

Adopt a Vietnamese-first discovery policy implemented inside the existing YouTube Discovery modules:

1. Build natural Vietnamese provider queries from normalized target identity and taxonomy mappings instead of sending internal English labels.
2. Request bounded medium- and long-duration search tranches and merge them deterministically with provenance.
3. Read exact duration plus provider default language and default audio-language during bounded enrichment.
4. Classify `languageFit` as `vi`, `likely_vi`, `unknown`, or `non_vi` using explicit provider metadata first and a versioned deterministic title/description/tag classifier when metadata is absent.
5. Apply language and minimum-duration gates before channel enrichment, comments, and AI triage.
6. Send only qualified Vietnamese-first candidates into the primary recommendation and review flow. Keep any allowed foreign fallback separate and measurable.
7. Expose useful video metadata—channel, duration, view count, publish time, language fit, originating query, and decision reason—to operators.

The initial minimum useful duration is a versioned database policy value of 180 seconds. A video with missing/invalid duration or an unqualified language classification fails the primary path. Scores, popularity, or generic relevance cannot override these gates.

**Effort:** Medium.  
**Risk:** Medium, localized to Discovery planning, enrichment, policy, persistence projections, review UI, telemetry, and tests.  
**Priority:** Complete Epic 22 before resuming Epic 21.

## 4. Detailed Change Proposals

### 4.1 PRD

#### Target user and product principle

**Old:** Discovery is generally framed for Vietnamese-speaking travelers and content relevant to travel in Vietnam.

**New:** State that actual and MVP users are primarily Vietnamese people planning domestic road trips. Add a `Vietnamese users first` principle: optimize for usefulness to Vietnamese users, not merely content about Vietnam. Prefer Vietnamese language and Vietnamese/local road-user viewpoint; use foreign sources only as a bounded fallback for unique value.

#### Functional requirements

- **FR66:** Translate geography, taxonomy, and need into natural Vietnamese provider queries. Raw internal English taxonomy must never be sent unchanged.
- **FR69:** Produce a Vietnamese-first candidate pool. Provider region/language parameters are ranking hints, not evidence that a candidate is Vietnamese.
- **FR70:** Retain bounded duration, default language, and default audio-language metadata and a versioned language-fit result for new-policy runs.
- **FR71:** Apply deterministic language/audience fit and minimum-duration eligibility before downstream AI triage and primary review. No score or popularity signal may override a failed hard gate.
- **FR72:** Expose safe language/duration fit and exclusion reasons. Foreign-language or too-short videos must not enter the primary queue merely because they concern Vietnam.

#### Success and acceptance criteria

- **SC15:** At least 80% of new-policy `consider` recommendations are classified `vi` or `likely_vi`. `unknown` does not count toward the target; foreign fallback is reported separately.
- **SC16:** Zero new-policy `defer` or `consider` recommendations are shorter than the configured minimum useful duration.
- **AC42:** System-generated discovery queries use natural Vietnamese and never expose raw English taxonomy labels to the provider.
- **AC43:** Mixed Vietnamese, foreign-language, short, medium, long, and unknown fixtures prove that deterministic language and duration gates dominate AI score bands.

No acceptance criterion requires historical-data reconciliation or backfill.

### 4.2 Architecture

#### AD-4: Vietnamese query construction

- Keep normalized target identity and digests unchanged.
- Introduce a versioned Vietnamese query builder in the existing planning module.
- Map internal taxonomy to user-natural terms, for example:
  - `route` → `kinh nghiệm cung đường ô tô`
  - `cost_note` → `chi phí hành trình`
  - `hotel_area` → `khu vực lưu trú khách sạn`
- Regenerate system-owned proposals idempotently without overwriting operator-authored query text.
- Merge bounded medium- and long-duration search tranches deterministically while retaining query provenance.

#### AD-5: Pre-AI deterministic eligibility

The new candidate flow is:

1. Fetch bounded video metadata.
2. Determine `languageFit` and `durationFit`.
3. Persist a safe exclusion result and stop when either hard gate fails.
4. Only eligible candidates continue to channel enrichment, comments, AI triage, recommendation, and primary review.

`languageFit` is a closed set: `vi | likely_vi | unknown | non_vi`.

- Explicit Vietnamese language/audio metadata produces `vi`.
- Explicit non-Vietnamese audio metadata produces `non_vi`.
- Missing metadata uses a bounded, versioned deterministic classifier over title, description, and tags.
- `vi` and `likely_vi` enter the primary path.
- `unknown` and `non_vi` may enter only a bounded same-need fallback when no qualified Vietnamese candidate exists; fallback never mixes into primary ranking.
- The initial implementation adds no new language-detection dependency or external service.

Duration policy is versioned in the database with `minimumUsefulDurationSeconds=180` initially.

- Below threshold → `too_short`.
- Missing or invalid exact duration → `duration_unknown` and fail primary eligibility.
- Search duration filters reduce waste, but exact enriched duration remains authoritative.

For new-policy runs, retain bounded fields sufficient to project:

- `queryBuilderVersion`
- `languageFit`
- `languageClassifierVersion`
- `durationFit`
- safe reason: `eligible_vietnamese`, `too_short`, `duration_unknown`, `non_vietnamese`, `language_unknown`, or `foreign_fallback`
- safe video metadata already available from enrichment, including channel title, duration, view count, and `publishedAt`

Mission and Health report new-policy distributions by language fit, duration fit, reason, and foreign fallback. They do not process or reclassify historical rows.

### 4.3 Epic and Stories

#### Epic 22: Vietnamese-First YouTube Discovery Quality

**Goal:** Operators receive videos useful to the platform's primarily Vietnamese users: Vietnamese language and local road-user context, sufficient duration, and enough metadata to make an informed review decision.

**Scope:** Extend the shipped Epics 18–20 without rewriting them. Preserve URL-only discovery, Knowledge handoff, manual capture, and existing operational infrastructure. Implement before Epic 21 resumes.

#### Story 22.1 — Generate Vietnamese-First Discovery Queries

- Generate natural Vietnamese system queries through versioned taxonomy mappings.
- Forbid raw English labels such as `route note`, `cost note`, and `general travel tip` from reaching the provider.
- Preserve target digest and upstream normalized identity.
- Regenerate system-owned query proposals idempotently; never overwrite operator-authored queries.
- Merge bounded Vietnamese medium- and long-duration search tranches deterministically with canonical deduplication and provenance.
- Test that raw English taxonomy never reaches the provider adapter.

#### Story 22.2 — Gate Language and Useful Duration Before AI Triage

- Add forward-only policy/schema support for run-specific versioned language and duration classification; do not backfill historical rows.
- Read default language, default audio language, exact duration, publish time, view count, and existing bounded metadata.
- Classify `vi | likely_vi | unknown | non_vi` with a versioned deterministic classifier.
- Enforce the initial 180-second minimum useful duration from database policy.
- Stop `too_short`, `duration_unknown`, `non_vietnamese`, and `language_unknown` candidates before channel/comments/AI work on the primary path.
- Allow only bounded, separately marked foreign fallback when the same need has no qualified Vietnamese candidate.
- Test thresholds, missing metadata, explicit Vietnamese/non-Vietnamese metadata, and Vietnamese text without diacritics.

#### Story 22.3 — Surface Video Evidence and Prove Vietnamese-First Quality

- Ensure deterministic gates execute before AI score bands and primary review admission.
- Leave all historical candidates, recommendations, and decisions unchanged.
- Show title, thumbnail, channel, duration, formatted view count, exact/relative publish time, language fit, originating query, and safe decision reason in the existing candidate row and inspector.
- Separate foreign fallback under `Nguồn ngoại ngữ bổ sung`; do not mix it with Vietnamese-first primary recommendations.
- Keep excluded candidates out of Action Required and the primary Review Queue while reporting aggregate reasons in Mission/Health.
- Prove release gates on new-policy recommendations only: at least 80% of `consider` is `vi`/`likely_vi`, zero below-duration items in `defer`/`consider`, and fallback measured separately.
- Run focused unit, serial PostgreSQL integration, API/UI, typecheck, lint, and build verification without regressing ownership, provider, usage, or audit boundaries.

**Sequence:** `22.1 → 22.2 → 22.3 → resume Epic 21`.

### 4.4 UX

**Old:** Review surfaces emphasize triage outcome and safe operational state but do not provide enough evidence for an operator to judge audience fit, freshness, or reach.

**New:** Extend the existing candidate row and inspector; do not redesign the whole surface.

Each new-policy review item shows:

- title and thumbnail;
- channel name;
- duration;
- human-readable view count, for example `125 nghìn lượt xem`;
- exact publish date plus relative age, for example `12/05/2025 · 1 năm trước`;
- `Nội dung tiếng Việt` or `Có khả năng là tiếng Việt`;
- originating discovery query;
- safe eligibility or exclusion reason.

Primary review contains qualified Vietnamese-first videos. Foreign fallback appears in a distinct `Nguồn ngoại ngữ bổ sung` section. Too-short, duration-unknown, and language-ineligible videos do not appear in Action Required or the primary queue; Mission/Health shows their aggregate counts with Vietnamese labels.

Historical data remains unchanged and is not reclassified, migrated, or given a synthetic operator state.

## 5. Implementation Handoff

### Scope Classification

**Moderate.** The change updates product requirements, architecture, UX, backlog, database-backed policy/projections, and tests, while remaining inside the existing YouTube Discovery service and operational model.

### Responsibilities

- **Product Owner / planning owner:** Approve this proposal and treat the updated PRD, Architecture, UX, Epic 22, and sprint status as the active Discovery-quality baseline.
- **Developer agent:** Implement Stories 22.1–22.3 sequentially using the existing PostgreSQL/Drizzle, Worker, provider adapter, AI triage, Audit, Usage, Mission, and Health boundaries.
- **Code review:** Verify Vietnamese query generation, pre-AI gate ordering, versioned policy behavior, fallback isolation, operator metadata accuracy, quality measurements, and absence of historical-data mutation.

### Success Criteria

1. Most actual users—Vietnamese people planning domestic road trips—are explicitly represented as the primary Discovery audience in product and technical artifacts.
2. New system queries are natural Vietnamese and contain no unchanged internal English taxonomy labels.
3. No new-policy video shorter than 180 seconds can receive `defer` or `consider`.
4. At least 80% of new-policy `consider` recommendations are `vi` or `likely_vi`; unknown does not count and foreign fallback is measured separately.
5. Language/duration failures stop before avoidable channel, comment, and AI work.
6. Operators can see channel, duration, views, publish time, language fit, query provenance, and safe decision reason.
7. Historical data is neither backfilled nor mutated.
8. No new service, queue, provider, language-detection dependency, environment variable, deployment component, or credential boundary is introduced.

## 6. Approval and Handoff Status

- [x] Trigger, evidence, epic impact, artifact impact, and implementation options reviewed incrementally.
- [x] PRD direction approved incrementally on 2026-08-14.
- [x] Architecture direction approved incrementally on 2026-08-14.
- [x] Epic 22 and Stories 22.1–22.3 approved incrementally on 2026-08-14.
- [x] UX direction approved incrementally on 2026-08-14, with explicit removal of historical-data processing and addition of video metadata.
- [x] Complete Sprint Change Proposal approved for execution by the user on 2026-08-14.
- [x] Source PRD, Architecture, UX, Epic 22, and sprint status updated.
- [x] Implementation handed off through backlog Stories 22.1–22.3, ordered before Epic 21.
