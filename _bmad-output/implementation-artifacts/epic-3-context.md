# Epic 3 Context: AI-First Community Knowledge Operations

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 3 gives operators an AI-first workflow that turns submitted sources and operator-assisted Facebook captures into evidence-grounded, state-aware community knowledge. Qualifying low-risk facts become active without mandatory human approval; operators intervene through risk-prioritized recommendations, quality samples, verification, conflict handling, source removal, and seed-coverage work. This epic creates the safe corpus that Epic 4 retrieves for traveler answers.

## Stories

- Story 3.1: Add the AI-First Knowledge Card State Model
- Story 3.2: Create Immutable Source Capture Versions and Retention Boundaries
- Story 3.3: Backfill Bounded Evidence and Verify Legacy Retrieval Safety
- Story 3.4: Establish Source-Version Ingestion Job Claiming
- Story 3.5: Run the Source-Version AI Ingestion Pipeline
- Story 3.6: Recover Ingestion Jobs Without Stale Publication
- Story 3.7: Validate Evidence and Independently Judge Publication
- Story 3.8: Relate Evidence, Preserve Conditions, and Handle Conflicts
- Story 3.9: Operate the AI-Recommended Review and Sampling Queue
- Story 3.10: Propagate Source Removal and State Changes to Search Eligibility
- Story 3.11: Report Active Evidence-Grounded Seed Coverage

## Requirements & Constraints

- Covers FR-17, FR-18, FR-18A, FR-18B, FR-19, FR-20, FR-21, FR-22, FR-22A, FR-22B, FR-22C, FR-23, FR-23A, FR-23B, FR-24, FR-24A, FR-24B, FR-25, FR-25A, FR-25B, FR-26, FR-27, FR-28, FR-37, and FR-37B, plus NFR-3, NFR-8, and NFR-9.
- Knowledge cards hold title, taxonomy type, location or route, summary, source provenance, collected date, confidence label, tags, freshness-sensitive status, conditions, current judge summary, monotonic `content_version`, and evidence-set revision. The fixed taxonomy is place, food, hotel area, activity, service, route note, warning, cost note, parking, EV charging, kid-friendly tip, discount/promotion, and general travel tip. The MVP confidence labels are `unverified`, `community`, `curated`, `partner`, and `official`.
- State dimensions are independent: publication is `active | suppressed | archived`; knowledge is `community_observation | community_pattern | conditional | uncertain | conflicted | confirmed | superseded`; review is `none | ai_recommended | in_review | reviewed`; verification is `not_required | required | corroborated | failed`. Only active cards are eligible for normal retrieval; suppressed, archived, and superseded cards are excluded.
- A candidate is an operational extraction artifact, not a persistent aggregate. `knowledge_card` is the single canonical fact aggregate, created or updated only after deterministic validation and an independent AI judge decision.
- Each active card requires bounded, source-versioned evidence: validated quote/span, exact source/capture-version reference, observed/captured time, conditions, support level, display policy, evidence state, and deterministic independence key. Neither traveler facts nor traveler-visible evidence may contain PII or sensitive material.
- Reject publication when a span does not match its capture, content contains PII/sensitive data, travel context is insufficient, content is opinion/question-only, spam/commercial promotion, or unsafe, or a high-risk conflict is unresolved. Model scores cannot override failed deterministic validation.
- Independent judging requires relevance >= 0.75, extractability >= 0.70, evidence grounding >= 0.90, specificity >= 0.65, actionability >= 0.65, first-hand likelihood >= 0.55, and spam/commercial risk <= 0.25.
- Road, safety, EV, price, hours, availability, booking, and promotion facts are freshness-sensitive and high-risk. They require verification and AI-recommended review, and remain conditional caveats until corroborated; verification alone does not make a card confirmed.
- A `community_pattern` requires at least two active supporting evidence records with distinct independence keys. Retrieval-effective evidence is capped at three supporting and one conflicting active records, selected for recency, source independence, and quality.
- Operators may submit URLs, raw text, copied posts, or image/screenshot material. Facebook URLs without readable text are queued for later operator-run capture, not failed or AI-readable sources. Capture is an operator-only operations tool, never public request-path logic or unattended mass crawling.
- Facebook capture creates an immutable operator-confirmed version and must never retain browser credentials, cookies, tokens, local storage, full HTML, hidden data, or browser-profile material. Raw Facebook material and evidence default to operator-only. A traveler-visible quote/link requires accessible source, short relevant content, explicit display permission, and no PII/sensitive content. Facebook-derived content is not official unless its source is identifiable as official/provider.
- Delete Facebook source/capture artifacts and dependent inactive operational artifacts after 180 days when they support no active or reviewable card. Preserve only concise required audit data. Withdrawn, inaccessible, or removal-requested sources must be processed by a retryable removal command before their artifacts are hidden or deleted.
- The Hanoi-to-HCMC seed target is 100 active cards with current active evidence and complete retrieval metadata. Suppressed, archived, superseded, evidence-invalid, or incomplete cards do not count.

## Technical Decisions

- The application remains a Next.js App Router TypeScript modular monolith. PostgreSQL is the source of truth; Drizzle owns schema, migrations, and typed data access. All operator and worker mutations run through server-side feature entrypoints with authenticated role checks where applicable and meaningful audit context.
- Knowledge exclusively owns source material, immutable captures, ingestion jobs, cards, evidence, relations, review/verification recommendations, state transitions, and search-index dirty markers. Other modules may read via query helpers but must not perform generic cross-module upserts or deletes. `system-knowledge-pipeline` is the actor for automatic triage, judging, relation, publication, conflict, and indexing mutations; the submitter remains source/job provenance.
- Use an OpenAI-compatible AI Gateway adapter for triage, extraction, judging, and related AI work. Each model call declares purpose, model, prompt version, source bundle, and output schema where applicable. The extraction model cannot be the sole publication decision-maker.
- A source capture version creates exactly one ingestion job. The job progresses `queued -> triaging -> extracting -> judging -> relating` and ends `published | suppressed | review_recommended | verify_first | failed`. Recapture appends a new immutable version and new job without changing prior provenance.
- Workers claim stages with transactional `FOR UPDATE SKIP LOCKED`, a lease/fencing token, and expected stage/version. Each stage result and card mutation compare-and-swaps its expected version and lease token. Retries resume only the failed stage; stale or duplicate workers cannot overwrite completed work, attach evidence, or publish a later decision.
- Keep current-state audit lean: cards retain current state, current judge summary, effective evidence, and version; durable audits record meaningful state transitions and operator actions. Do not retain full prompts, provider payloads, unlimited extraction JSON history, or old wording versions by default.
- Relation matching first scopes by card type and normalized location/route. Auto-attach requires the same fact and equivalent conditions. Materially distinct compatible conditions create new cards; redundant/same-source candidates are suppressed; conflicts attach to the affected card unless conditions are compatible. Ambiguity, high risk, state-changing merges, conflicts, or missing observed dates create recommendations.
- Every meaningful Knowledge mutation atomically updates card/evidence/state, increments the appropriate version, records a concise audit event, and writes an index dirty marker. Suppression, archival, superseding, high-risk conflict, and source withdrawal disable the search projection in that same transaction.
- The indexing worker is separately supervised from request-serving Next.js, and indexes idempotently by `(knowledge_card_id, content_version)`. PostgreSQL remains authoritative: Epic 4 retrieval must recheck current card, evidence, and traveler-safe source eligibility so an index delay cannot re-enable unsafe knowledge.
- Source removal locks dependent evidence/cards, marks evidence removed and traveler-invisible, re-evaluates each card from remaining evidence, applies downgrade or suppression and projection disablement, then records concise removal audit data. Partial work resumes idempotently.

## UX & Interaction Patterns

- Knowledge operations live in a role-protected admin shell separate from traveler chat. Normal travelers never receive admin controls, raw submitted text, raw Facebook content, image/OCR notes, provider payloads, or operator-only fields.
- Admin information architecture includes intake, review recommendations, knowledge card detail, active-card views, and seed progress. Dense review is desktop/tablet optimized; core review, suppress/restore, verification, and evidence-validated edits should remain functional where feasible on mobile.
- Intake supports URL, raw text, copied post content, and screenshot/file metadata. A failed extraction gives the operator a safe recoverable reason and creates no active card. Status rows expose `queued`, `triaging`, `extracting`, `judging`, `relating`, `published`, `suppressed`, `review recommended`, `verify first`, or `failed`.
- The recommendation queue is impact- and risk-prioritized, filterable by source, type, route/location, all state dimensions, confidence, and freshness. It is not an approval queue: active low-risk cards must never be presented as waiting for approval.
- A recommendation displays the current fact, conditions, bounded evidence, source metadata, state, risk reasons, `content_version`, and evidence-set revision. Operators can accept wording, make an evidence-validated edit, suppress, restore, request or record verification, or resolve a relation/conflict. Changed cards get new version-bound recommendations rather than inheriting earlier review results.
- Quality sampling is separate from normal review: create version-bound recommendations for 15% of auto-active card versions during the first four weeks and 100% of `verify_first` outcomes. Record pass/fail reason codes and raise sampling or suppress an affected policy cohort after a high-severity failure.
- Seed progress reports active evidence-grounded Hanoi-to-HCMC count, remaining gap to 100, taxonomy and route/location gaps, and pending verification/review signals. It distinguishes community observations/patterns from caveat-only high-risk material and must not substitute historical approval counts for eligibility.
- Admin card forms are structured, not free-form edits to AI prose. Source/confidence/freshness state uses text labels, not color alone. Preserve keyboard navigation, visible focus, and WCAG 2.2 AA behavior.

## Cross-Story Dependencies

- Depends on Epic 1 for authenticated operator roles, separate admin entry, server-side role checks, audited protected mutations, and environment/secrets boundaries.
- Depends on the completed baseline data/migration and worker foundations. Knowledge migrations must preserve safe legacy mappings: ambiguous legacy records default to suppressed or otherwise ineligible, and backfill must not promote draft, rejected, or ambiguous material.
- Story 3.1 establishes the independent card state model. Story 3.2 introduces immutable source/capture versions and retention rules. Story 3.3 adds bounded evidence backfill and verifies that cards lacking valid evidence or required retrieval metadata remain ineligible.
- Story 3.4 provides durable job creation and safe stage claiming. Story 3.5 implements the vertical source-to-terminal pipeline. Story 3.6 adds stale-lease, retry, and fencing recovery without replaying completed work.
- Story 3.7 provides hard gates and independent publication judgment. Story 3.8 builds on judged candidates for relation, condition, conflict, and evidence-independence handling. Story 3.9 depends on versioned cards/evidence and state transitions for recommendations and sampling.
- Story 3.10 depends on state, evidence, relation, and dirty-marker contracts to propagate source withdrawal and safety changes immediately. Story 3.11 depends on active-card eligibility and reports only current evidence-grounded coverage.
- Epic 4 consumes this epic's active, current, traveler-safe card/evidence/source projections. It owns state-aware retrieval, source-bundle assembly, answer wording, persisted traveler provenance, and web fallback; Epic 3 must not expose raw or operator-only source material to those consumers.
- Before any future YouTube knowledge story, reconcile the architecture's YouTube mandatory-approval wording with this AI-first publication policy or define an explicit PRD-backed exception.
