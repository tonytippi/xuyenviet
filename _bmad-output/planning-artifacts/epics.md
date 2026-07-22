---
stepsCompleted:
  - step-01-requirements-extraction
  - step-02-epic-design
  - step-03-story-generation
  - step-04-final-validation
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md
  - _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/addendum.md
  - _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/community-knowledge-solution-design.md
  - _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md
  - _bmad-output/project-context.md
---

# xuyenviet - Epic Breakdown

## Overview

This document will decompose the final PRD, architecture spine, community knowledge solution design, and UX contract into implementable epics and stories.

## Requirements Inventory

### Functional Requirements

FR-1: Provide an authenticated Vietnamese AI Ask chat interface.
FR-2: Accept broad, underspecified road-trip planning questions.
FR-3: Respond in Vietnamese by default.
FR-4: Provide useful initial guidance when trip details are incomplete.
FR-5: Ask concise follow-up questions for important missing details.
FR-6: Support iterative conversation refinement.
FR-6A: Stream AI Ask responses only after context, source bundle, and provenance inputs are assembled.
FR-6B: Accept supported image inputs from authenticated users when the selected Gateway model supports them.
FR-6C: Validate image type, size, ownership, and safety before a provider call; invalid input creates no provider call.
FR-7: Structure travel answers with plan/options, rationale, tips, warnings, sources, uncertainty notes, and next steps.
FR-8: Require Google Login before AI Ask use.
FR-9: Associate chat sessions and trip projects with the authenticated user.
FR-10: Extract travel-relevant traveler and trip details from chat.
FR-11: Reuse relevant current-chat or selected-trip context.
FR-12: Keep chat-session context distinct from trip-project context.
FR-13: Let users correct trip details through chat.
FR-14: Display a clear notice that chat/trip details may be stored for the session or project.
FR-15: Let users delete a chat session or trip project they own.
FR-16: Exclude sensitive personal data beyond travel-personalization needs.
FR-17: Support operator-created knowledge cards.
FR-18: Store title, type, location/route, summary, source, collected date, confidence, tags, and freshness-sensitive status on cards.
FR-18A: Preserve short validated evidence quote/span, source link, capture/observed date, and conditions before an AI-extracted community claim is active.
FR-18B: Never retain or expose PII/sensitive content in traveler-visible facts or evidence quotes.
FR-19: Support the defined knowledge-card taxonomy.
FR-20: Let operators create, edit, approve, and archive cards.
FR-21: Retrieve cards in active publication state; qualifying AI-extracted community claims do not require operator approval.
FR-22: Preserve inspectable source provenance.
FR-22A: Track card knowledge state: confirmed, community pattern, conditional, uncertain, conflicted, or superseded.
FR-22B: Track review state separately from publication state.
FR-22C: Exclude suppressed, archived, and superseded cards from normal retrieval.
FR-23: Accept operator source submissions as URL, raw text, copied post, or image/screenshot.
FR-23A: Queue unreadable Facebook URLs for later operator-run capture.
FR-23B: Capture only confirmed, operator-only visible Facebook material without browser credentials, cookies, tokens, local storage, full HTML, or hidden data.
FR-24: AI-triage source material, extract structured claims, and validate each against a source-text evidence span.
FR-24A: Classify triaged sources as rejected, context-only, candidate, or verify-first and retain decision reasons.
FR-24B: Use an independent AI judge, separate from extraction, for publication/suppression/review decisions.
FR-25: Make claims searchable without human approval only when evidence, specificity, actionability, privacy, commercial-risk, and conflict policy pass.
FR-25A: Create risk-prioritized review recommendations, not mandatory approval gates, for risky, weak, conflicting, duplicate, or context-missing claims.
FR-25B: Quality-sample 15% of auto-active claims for the first four weeks and 100% of verify-first claims.
FR-26: Support the fixed MVP confidence labels: unverified, community, curated, partner, official.
FR-27: Mark changing price, schedule, availability, road, hours, weather, or service facts as freshness-sensitive.
FR-28: Reach a seed set of 100 active, evidence-grounded Hanoi-to-HCMC knowledge cards.
FR-29: Retrieve relevant active cards under publication and knowledge-state guardrails.
FR-30: Prioritize context: selected trip, current chat, active XuyenViet knowledge, web fallback, then general reasoning.
FR-31: Use web fallback for missing, sparse, freshness-sensitive, uncertain, or conflicted knowledge.
FR-32: Identify whether answer information came from chat/trip, knowledge cards, web, or general reasoning.
FR-33: Warn travelers to verify changing details before action or booking.
FR-34: Never present unverified collected information as guaranteed fact.
FR-35: Label search results external/unverified unless later ingested under publication policy.
FR-36: Prefer official/provider pages in web fallback.
FR-37: Do not treat Facebook-derived information as official except from identifiable official/provider pages.
FR-37A: Use state-appropriate uncertainty wording for community observation, pattern, and conditional claims.
FR-37B: Describe a claim as a community pattern only with multiple independent supporting evidence records.
FR-37C: Do not use conflicted knowledge as factual premise for itinerary recommendations.
FR-38: When children travel, consider shorter driving blocks, rests, child-friendly activities, learning, hotel convenience, and backups.
FR-39: Identify activities potentially unsuitable or boring for children when relevant.
FR-40: Suggest sourced family tips such as child discounts when known.
FR-41: Balance parent goals with child comfort and experience.
FR-42: Allow public sign-in without an email allowlist while requiring Google authentication for AI Ask.
FR-43: Provide a traveler-separate operator/admin area.
FR-44: Support at least one initial admin/operator account.
FR-45: Permit future multi-operator expansion without workflow redesign.
FR-46: Capture a simple usefulness rating for answers.
FR-47: Record authenticated AI usage with user/context, purpose, model/provider, timestamp, and available usage/cost metadata.
FR-48: Capture valid sign-in referral attribution without rewards, rankings, payouts, or credits.
FR-49: Manage AI Gateway model records with name, purpose, capabilities, active status, and input/output/cache pricing.
FR-50: Estimate usage cost from configured pricing and available provider token metadata without billing behavior.

### NonFunctional Requirements

NFR-1: Chat responses must feel responsive enough for interactive planning.
NFR-2: Securely preserve chats and trip projects for authenticated owners only.
NFR-3: Never expose operator-only raw source material or admin controls to travelers.
NFR-4: Make AI answers auditable to the influencing knowledge cards and source types.
NFR-5: Support Vietnamese input, retrieval, and output.
NFR-6: Tolerate sparse internal knowledge through clearly labeled web fallback.
NFR-7: Leave Google Maps, public submissions, and booking/partner flows non-dependent for MVP.
NFR-8: Run Facebook capture only as an operator-controlled operations tool, not request-path logic or unattended mass crawling.
NFR-9: Keep active AI-extracted claims auditable through decision, evidence, source, state, and review history.

### Additional Requirements

- Use a Next.js App Router TypeScript modular monolith, PostgreSQL as product/retrieval source of truth, and Drizzle-owned migrations.
- Enforce feature-owned server entrypoints, server-side authentication/roles, audited protected mutations, and separate environment secrets/databases.
- Use an OpenAI-compatible Gateway adapter and managed model catalog; every model call declares purpose, model, prompt version, source bundle, and output schema where applicable.
- Persist assistant-message provenance row-per-source-item in the same transaction as the final message; render source UI from stored provenance only.
- Keep chat/project deletion owner-scoped and propagate it to messages, context, embeddings, and any derived retrievable content.
- Build source-versioned knowledge ingestion as one transactional, leased, compare-and-swap job: queued, triaging, extracting, judging, relating, then published/suppressed/review-recommended/verify-first/failed.
- Use immutable capture artifacts and bounded evidence; Facebook raw material remains operator-only and is retained/deleted under the 180-day policy.
- Use independent AI judgment plus deterministic hard gates and thresholds; the canonical aggregate is `knowledge_card`, not a separate persistent claim.
- Keep publication, knowledge, review, and verification states independent. High-risk road, safety, EV, price, hours, availability, booking, and promotion facts require verification and caveat-only use until corroborated.
- Mutate publication state, audit event, and index dirty marker atomically. Indexing is idempotent by card/version; retrieval rechecks current owner-row eligibility and emits contextual-use, caveat-only, or exclude policy.
- Scope relation matching by type plus normalized location/route. Accumulate evidence selectively; community patterns require distinct evidence independence keys; source removal is retryable and re-evaluates dependent cards before deletion/hiding.
- Use Tavily behind a provider adapter provisionally; prefer official/provider sources and fail closed with a verification recommendation when search fails or is low confidence.
- Supervise separate Node workers for knowledge ingestion/indexing; keep logs, health/restart supervision, backup/restore, and public launch privacy checks operationally ready.
- Preserve no-credit/no-payment/no-reward MVP boundaries and defer maps, mobile, service decomposition, vector/hybrid ranking, and broad Facebook discovery pending explicit decisions.

### UX Design Requirements

UX-DR1: Public `/` is a centered Vietnamese entry with warm hero, Google CTA, sign-in-gated ask box, icon-led starters, and no authenticated data/sidebar.
UX-DR2: AI Ask has canonical logged-in-empty and active planning shell states, with inspector only after selecting a persisted descriptor.
UX-DR3: Desktop uses an edge-to-edge 276px sidebar, 760px readable answer column, and conditional 380px inspector, not a floating/map-first workspace.
UX-DR4: Tablet/mobile adapt the same server-loaded shell into rail/sheets and single-column chat without alternate loaders or state owners.
UX-DR5: Root-owned Inter typography, semantic color/spacing/radius tokens, focus styles, reduced motion, and Vietnamese diacritic legibility are required.
UX-DR6: Reusable UI primitives are data-free and do not import feature data, actions, or route state.
UX-DR7: Product icons use one typed local SVG boundary after a shell surface is migrated.
UX-DR8: Icon-only controls have accessible names, focus, tooltips, and 44px mobile targets; destructive confirmation retains text.
UX-DR9: Sidebar contains brand, new chat, owned conversations/projects, privacy/account, and role-authorized admin navigation with non-hover-only row actions.
UX-DR10: Active trip context is visibly distinguished from ordinary chat.
UX-DR11: Idle composer has only prompt, attachment, and send; guidance/validation/preview are contextual.
UX-DR12: Selected images render a compact thumbnail/file status row and accessible remove action.
UX-DR13: Empty AI Ask shows centered greeting, composer, four starter cards, and no blank inspector.
UX-DR14: Answers are scannable with relevant structured sections and non-mutating section chips.
UX-DR15: Render only persisted, validated annotation descriptors; never parse free-form answer prose at render time.
UX-DR16: Selected descriptors open one contextual detail view with safe provenance and only supported actions.
UX-DR17: Desktop inspector/mobile sheet share one selected-detail state; one view is interactive and close restores focus.
UX-DR18: Source details render stored traveler-safe provenance, labels, title/type/URL/date/confidence/freshness when available, never raw material.
UX-DR19: Streaming is subtle, `aria-live` announced, reconciles to final persistence, and has recoverable failure without saved-partial implication.
UX-DR20: Show low-friction storage notice and explicit delete confirmation with normal UI/retrieval removal effects.
UX-DR21: Conversation/project selection is server-loaded and URL-owned; only draft, attachment, streaming, sheets, and selected descriptor are client transient state.
UX-DR22: Traveler/admin/public surfaces target WCAG 2.2 AA keyboard, focus, live-region, color-independent, modal, and mobile behavior.
UX-DR23: Admin knowledge workflows stay separate, structured, explicit, and desktop-optimized for dense review.
UX-DR24: Referral attribution is silent and introduces no reward/credit/ranking/payout UI.

### FR Coverage Map

FR-1: Epic 2 - Vietnamese AI Ask conversation.
FR-2: Epic 2 - Broad planning prompts.
FR-3: Epic 2 - Vietnamese-default answers.
FR-4: Epic 2 - Useful initial guidance with incomplete trip details.
FR-5: Epic 2 - Concise clarifying questions.
FR-6: Epic 2 - Iterative conversation refinement.
FR-6A: Epic 4 - Provenance-prepared streaming answers.
FR-6B: Epic 2 - Authenticated traveler image input.
FR-6C: Epic 2 - Pre-provider image validation.
FR-7: Epic 2 - Structured and scannable travel answers.
FR-8: Epic 1 - Google-authenticated access.
FR-9: Epic 2 - Owned chats and trip projects.
FR-10: Epic 2 - Travel-context extraction.
FR-11: Epic 2 - Chat/trip context reuse.
FR-12: Epic 2 - Separate chat and trip context.
FR-13: Epic 2 - Chat-based context correction.
FR-14: Epic 1 - First-use storage notice.
FR-15: Epic 2 - Owned chat/project deletion.
FR-16: Epic 2 - Sensitive context exclusion.
FR-17: Epic 3 - Operator-managed knowledge cards.
FR-18: Epic 3 - Structured card metadata.
FR-18A: Epic 3 - Validated evidence and capture provenance.
FR-18B: Epic 3 - Traveler-safe evidence policy.
FR-19: Epic 3 - Knowledge taxonomy.
FR-20: Epic 3 - Explicit operator lifecycle actions.
FR-21: Epic 3 - AI-first active publication without mandatory approval.
FR-22: Epic 3 - Source provenance.
FR-22A: Epic 3 - Knowledge state.
FR-22B: Epic 3 - Independent review state.
FR-22C: Epic 3 - Retrieval exclusion states.
FR-23: Epic 3 - Operator source intake.
FR-23A: Epic 3 - Queued Facebook capture.
FR-23B: Epic 3 - Operator-only Facebook capture boundary.
FR-24: Epic 3 - AI triage, extraction, and evidence validation.
FR-24A: Epic 3 - Triage classifications and reasons.
FR-24B: Epic 3 - Independent publication judge.
FR-25: Epic 3 - Evidence-grounded automatic publication policy.
FR-25A: Epic 3 - Risk-prioritized review recommendations.
FR-25B: Epic 3 - Quality sampling.
FR-26: Epic 3 - Confidence labels.
FR-27: Epic 3 - Freshness-sensitive facts.
FR-28: Epic 3 - Active evidence-grounded seed progress.
FR-29: Epic 4 - State-aware active knowledge retrieval.
FR-30: Epic 4 - Context priority pipeline.
FR-31: Epic 4 - Web fallback conditions.
FR-32: Epic 4 - Persisted answer provenance categories.
FR-33: Epic 4 - Changing-detail verification warnings.
FR-34: Epic 4 - Non-guaranteed unverified wording.
FR-35: Epic 4 - External/unverified web labels.
FR-36: Epic 4 - Official/provider web preference.
FR-37: Epic 3 - Facebook community-source trust policy.
FR-37A: Epic 4 - State-appropriate community wording.
FR-37B: Epic 3 - Independent evidence required for community pattern.
FR-37C: Epic 4 - No factual itinerary premise from conflict.
FR-38: Epic 5 - Family-aware pacing and alternatives.
FR-39: Epic 5 - Child suitability guidance.
FR-40: Epic 5 - Sourced family tips.
FR-41: Epic 5 - Parent/child tradeoff balance.
FR-42: Epic 1 - Public sign-in without allowlist.
FR-43: Epic 1 - Traveler-separate, role-gated admin access.
FR-44: Epic 1 - Initial admin/operator capability.
FR-45: Epic 1 - Extensible operator roles.
FR-46: Epic 5 - Answer usefulness feedback.
FR-47: Epic 4 - Authenticated AI usage events.
FR-48: Epic 1 - Silent referral attribution.
FR-49: Epic 4 - Managed AI Gateway model records.
FR-50: Epic 4 - Internal cost estimation.

## Epic List

### Epic 1: Trusted Entry And Planning Workspace Access

Travelers can reach a Vietnamese public entry, sign in with Google, understand the first-use storage notice, and enter a responsive, authenticated planning workspace. Operators can access a role-gated admin area without exposing administrative data to travelers; referral attribution is preserved silently.

**FRs covered:** FR-8, FR-14, FR-42, FR-43, FR-44, FR-45, FR-48

**Implementation notes:** Establish the root-owned visual foundation, canonical responsive shell, server-side roles, audit boundaries, environment safety, and one typed icon boundary. This epic does not create knowledge cards or provider calls.

### Epic 2: Personal Road-Trip Conversations And Projects

Authenticated travelers can start, continue, organize, and delete their own road-trip conversations and trip projects, while the assistant safely maintains travel-specific context, accepts validated images, and presents useful Vietnamese planning guidance before all details are known.

**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-6B, FR-6C, FR-7, FR-9, FR-10, FR-11, FR-12, FR-13, FR-15, FR-16

**Implementation notes:** Conversation/project selection remains URL-owned and shell data server-loaded. This epic delivers a safe initial model-backed conversation path; source-backed streaming/provenance arrives in Epic 4.

### Epic 3: AI-First Community Knowledge Operations

Operators can turn source submissions and operator-assisted Facebook captures into evidence-grounded, state-aware community knowledge. Qualifying facts become active without mandatory human approval; operators focus on prioritized recommendations, quality samples, verification, conflicts, source removal, and seed coverage.

**FRs covered:** FR-17, FR-18, FR-18A, FR-18B, FR-19, FR-20, FR-21, FR-22, FR-22A, FR-22B, FR-22C, FR-23, FR-23A, FR-23B, FR-24, FR-24A, FR-24B, FR-25, FR-25A, FR-25B, FR-26, FR-27, FR-28, FR-37, FR-37B

**Implementation notes:** This is explicitly not an approval queue. It owns immutable source/capture versions; leased ingestion jobs; hard evidence/privacy gates; independent judging; state, evidence, relation, verification, review, retention, and removal commands; transactional dirty markers; operator-only raw material; and active evidence-grounded seed progress. Admin UI must show current fact, conditions, bounded evidence, reasons, card version, and evidence-set revision, then offer state-aware actions rather than a generic approve-only lifecycle.

### Epic 4: Source-Grounded AI Answers And Trust Signals

Travelers receive responsive, source-aware answers that use their trip/chat context and eligible active knowledge, fall back safely to external search when needed, stream only after provenance is prepared, and let travelers inspect persisted, safe answer/source details.

**FRs covered:** FR-6A, FR-29, FR-30, FR-31, FR-32, FR-33, FR-34, FR-35, FR-36, FR-37A, FR-37C, FR-47, FR-49, FR-50

**Implementation notes:** Retrieval must fail closed and emit `contextual_use`, `caveat_only`, or `exclude` per current card/evidence state. Persist final response provenance, retrieval decision, and usage atomically. Search remains provider-adapted, official/provider-preferred, external/unverified, and fails with explicit verification guidance. Persisted annotation descriptors and the responsive detail inspector never parse free-form answer text or expose operator-only material.

### Epic 5: Family-Aware Planning And Quality Learning

Families receive practical child-aware planning recommendations, and the product captures traveler usefulness signals and repeatable quality evaluations to improve trustworthy road-trip answers.

**FRs covered:** FR-38, FR-39, FR-40, FR-41, FR-46

**Implementation notes:** Build on source-aware answers from Epic 4. Include the five-prompt evaluation set, rubric, and counter-metrics for unsupported claims, bad evidence grounding, missing uncertainty, unsafe conflict use, and generic-answer comparison.

### Epic 6: Public MVP Knowledge Readiness

The product team can validate that the Hanoi-to-HCMC knowledge corpus and traveler answer experience are ready for public MVP evaluation, with 100 active evidence-grounded cards, operational safeguards, and measurable answer-quality outcomes.

**FRs covered:** Cross-epic acceptance of FR-28, FR-32, FR-33, FR-46, FR-47, and FR-50.

**Implementation notes:** This is a launch-value epic, not a technical hardening bucket. It operationalizes seeded corridor coverage, quality sampling outcomes, evaluation prompts, source/provenance checks, worker monitoring, deletion/retention checks, and public-launch readiness evidence without expanding deferred product scope.

## Epic 1: Trusted Entry And Planning Workspace Access

Travelers can reach a Vietnamese public entry, sign in with Google, understand the first-use storage notice, and enter a responsive, authenticated planning workspace. Operators can access a role-gated admin area without exposing administrative data to travelers; referral attribution is preserved silently.

**Status:** Completed baseline. No new Epic 1 implementation stories are planned by this AI-first knowledge change.

**Completed evidence:** `sprint-status.yaml` marks Epic 1 and Stories 1.1-1.7 done. The current implementation includes the public entry/UI foundation, Auth.js Google login and protected AI Ask gate, PostgreSQL roles and separate admin shell, server-side audit support, environment/launch guards, and first-touch referral attribution. The later UI stories complete the responsive shell requirements.

**Remaining operational follow-up:** manual OAuth/admin/referral smoke confirmation remains tracked as an existing sprint action item. It is not a duplicate implementation story.

## Epic 2: Personal Road-Trip Conversations And Projects

Authenticated travelers can start, continue, organize, and delete their own road-trip conversations and trip projects, while the assistant safely maintains travel-specific context, accepts validated images, and presents useful Vietnamese planning guidance before all details are known.

**Status:** Completed baseline. No new Epic 2 implementation stories are planned by this AI-first knowledge change.

**Completed evidence:** `sprint-status.yaml` marks Epic 2 Stories 2.0-2.7 and the follow-on chat/trip Epic 3 Stories 3.1-3.7 done. The current implementation covers owned conversations, Vietnamese Gateway answers, iterative history, structured accessible answer rendering, guarded streaming, capability-aware image input, projects, safe context extraction/correction, and user-owned chat/project deletion. The current AI Ask page keeps conversation/project selection URL-owned and server-loads user-scoped shell data.

**Delta boundary:** Epic 4 will change only the answer-generation/retrieval contract to use current AI-first community knowledge and state-aware provenance. It must preserve this completed conversation, project, image, streaming, ownership, and deletion baseline rather than recreate it.

## Epic 3: AI-First Community Knowledge Operations

Operators can turn source submissions and operator-assisted Facebook captures into evidence-grounded, state-aware community knowledge. Qualifying facts become active without mandatory human approval; operators focus on prioritized recommendations, quality samples, verification, conflicts, source removal, and seed coverage.

### Story 3.1: Add the AI-First Knowledge Card State Model

As a knowledge operator,
I want each knowledge card to have explicit publication, knowledge, review, and verification state,
So that traveler use and operator intervention are governed without an approval-only lifecycle.

**Acceptance Criteria:**

**Given** legacy knowledge cards exist
**When** the state-model migration runs
**Then** each card has `publication_state`, `knowledge_state`, `review_state`, `verification_state`, monotonic `content_version`, evidence-set revision, conditions, and current judge summary
**And** legacy approved, archived, rejected, duplicate, and no-action records map to safe non-escalating states.

**Given** a legacy record has no unambiguous state mapping
**When** the migration completes
**Then** it is `suppressed` or otherwise ineligible by default
**And** the migration report identifies the count and reason for each safe fallback mapping.

### Story 3.2: Create Immutable Source Capture Versions and Retention Boundaries

As an operator,
I want each source capture to be immutable and versioned,
So that AI decisions and evidence always point to exactly what was captured.

**Acceptance Criteria:**

**Given** an operator submits or recaptures source material
**When** readable material is stored
**Then** the system appends an immutable source capture version with content hash and safe capture metadata
**And** ingestion jobs and evidence reference that exact version rather than mutable raw text.

**Given** a Facebook capture is performed through the existing operator-controlled browser tool
**When** the operator confirms its preview
**Then** the tool appends an operator-only immutable capture version and selects it as current
**And** it never persists browser credentials, cookies, tokens, local storage, full HTML, hidden data, or browser profile material.

**Given** Facebook captures or dependent inactive operational artifacts no longer support an active or reviewable card
**When** their retention period reaches 180 days
**Then** they become eligible for deletion by a safe retention command
**And** concise required audit data remains without retaining raw content.

### Story 3.3: Backfill Bounded Evidence and Verify Legacy Retrieval Safety

As a knowledge operator,
I want migrated cards to use bounded, source-versioned evidence before they become eligible,
So that historical approval records cannot bypass evidence or traveler-safety rules.

**Acceptance Criteria:**

**Given** a legacy card has source support that can be represented safely
**When** the evidence backfill runs
**Then** it creates one or more `knowledge_card_evidence` records with bounded quote/span, source/capture-version reference, observed/captured time, conditions, support level, display policy, evidence state, and deterministic independence key
**And** no traveler-facing read model contains raw material, operator-only fields, or provider payloads.

**Given** a legacy card lacks valid active evidence or complete required retrieval metadata
**When** backfill completes
**Then** the card remains ineligible for traveler retrieval
**And** the backfill report records the reason without silently promoting draft, rejected, or ambiguous material.

### Story 3.4: Establish Source-Version Ingestion Job Claiming

As a product owner,
I want one durable ingestion job per source capture version,
So that workers can identify and safely claim the current pipeline work.

**Acceptance Criteria:**

**Given** a readable capture version is ready
**When** Knowledge creates an ingestion job
**Then** it is created at `queued` with its capture-version, submitter provenance, stage version, and safe retry metadata
**And** recapture creates a new capture version and job without overwriting earlier provenance.

**Given** a worker claims a job stage
**When** it performs stage work
**Then** it uses transactional `FOR UPDATE SKIP LOCKED`, a lease/fencing token, and expected stage/version
**And** the claim is observable and expires safely when no worker completes it.

### Story 3.5: Run the Source-Version AI Ingestion Pipeline

As a product owner,
I want a claimed ingestion job to complete the AI-first pipeline,
So that a readable source can reach one safe, auditable terminal outcome.

**Acceptance Criteria:**

**Given** a worker owns a valid `queued` job claim
**When** it processes the source
**Then** the job progresses through `triaging -> extracting -> judging -> relating` to `published`, `suppressed`, `review_recommended`, `verify_first`, or `failed`
**And** automated mutations identify `system-knowledge-pipeline` while preserving the submitter as source/job provenance.

**Given** a stage completes
**When** it records its result and advances the job
**Then** it compares the expected stage/version and lease token before committing
**And** a duplicate worker cannot overwrite completed work or publish a different outcome.

**Scope decision (2026-07-22):** Story 3.5 also owns the deterministic validation gates, independent judge, bounded evidence creation, canonical card mutation, relation matching, condition preservation, and conflict policy originally decomposed into Stories 3.7 and 3.8. This makes the first canonical source-version pipeline vertically safe: it must not publish a card without exact evidence, validation, independent judgment, and scoped relation handling. The automated actor is `system-knowledge-pipeline`; source and job submitter provenance remains immutable. Story 3.6 remains recovery-only and Story 3.9 remains recommendation/sampling-only.

### Story 3.6: Recover Ingestion Jobs Without Stale Publication

As a product owner,
I want failed or stale ingestion jobs to recover safely,
So that retry behavior cannot repeat completed stages or restore outdated publication decisions.

**Acceptance Criteria:**

**Given** a stage fails transiently or a worker lease becomes stale
**When** retry/recovery runs
**Then** it resumes the failed stage while preserving valid completed-stage outputs only for operational retention
**And** retry cannot re-run a completed stage without an explicit safe requeue reason.

**Given** a stale or duplicate worker attempts a later mutation
**When** its fencing token or expected version no longer matches
**Then** its result is rejected without changing a card, evidence, or publication outcome
**And** the operational record retains a safe failure reason.

### Story 3.7: Validate Evidence and Independently Judge Publication

**Status:** Superseded by Story 3.5 scope decision on 2026-07-22. Its acceptance contract is implemented and tested as part of Story 3.5; do not create a duplicate implementation story.

As a traveler,
I want community facts to become available only when their evidence and safety policy justify it,
So that timely advice does not require blanket manual approval or imply false certainty.

**Acceptance Criteria:**

**Given** extraction produces a candidate fact
**When** deterministic validation runs
**Then** a mismatched evidence span, PII/sensitive content, insufficient travel context, opinion/question-only content, spam/commercial promotion, or unresolved high-risk conflict fails publication
**And** model scores cannot override a failed code validation or privacy policy.

**Given** a candidate passes hard gates
**When** an independent AI judge evaluates it separately from the extractor
**Then** publication requires relevance >= 0.75, extractability >= 0.70, evidence grounding >= 0.90, specificity >= 0.65, actionability >= 0.65, first-hand likelihood >= 0.55, and spam/commercial risk <= 0.25
**And** the system creates or updates only the canonical `knowledge_card`, not a persistent claim aggregate.

**Given** a qualifying low-risk community fact passes the policy
**When** judging completes
**Then** it may become active without operator approval
**And** road, safety, EV, price, hours, availability, booking, and promotion claims set verification required and AI-recommended review, remaining caveat-only until corroborated.

### Story 3.8: Relate Evidence, Preserve Conditions, and Handle Conflicts

**Status:** Superseded by Story 3.5 scope decision on 2026-07-22. Its acceptance contract is implemented and tested as part of Story 3.5; do not create a duplicate implementation story.

As a traveler,
I want community observations to preserve their conditions and disagreements,
So that similar reports do not become inaccurate consensus or conflicting itinerary facts.

**Acceptance Criteria:**

**Given** a judged candidate is related to existing cards
**When** candidate matching occurs
**Then** code scopes candidates by card type and normalized location/route before an independent relation judge compares them
**And** same fact/equivalent conditions may attach while materially distinct compatible conditions create a new card.

**Given** evidence is redundant, ambiguous, high-risk, state-changing, conflicting, or lacks an observed date
**When** relation processing completes
**Then** it is suppressed or receives a review recommendation according to policy
**And** conflicting evidence attaches to the affected card rather than creating an opposite factual card unless conditions make both facts compatible.

**Given** active supporting evidence is used to classify a card
**When** it becomes `community_pattern`
**Then** it has at least two active supporting records with distinct independence keys
**And** retrieval-effective evidence is limited to at most three supporting and one conflicting records selected by recency, independence, and quality.

### Story 3.9: Operate the AI-Recommended Review and Sampling Queue

As an operator,
I want actionable, version-bound review recommendations rather than a mandatory approval queue,
So that I focus on risky or uncertain facts while qualifying observations remain timely.

**Acceptance Criteria:**

**Given** a card needs review due to risk, weak evidence, freshness, conflict, duplicate risk, missing context, or sampling
**When** it appears in the admin queue
**Then** the queue is prioritized by traveler impact and risk and shows current fact, conditions, bounded evidence, reasons, state, `content_version`, and evidence-set revision
**And** it does not present active low-risk cards as awaiting publication approval.

**Given** an operator resolves a recommendation
**When** they accept wording, make an evidence-validated edit, suppress/restore, request/record verification, or resolve a relation/conflict
**Then** the Knowledge command compare-and-swaps card version and evidence-set revision, writes a meaningful audit event, and marks the projection dirty atomically
**And** a changed card receives a new recommendation rather than inheriting a prior reviewed state.

**Given** automatic publication or verify-first outcomes occur
**When** quality sampling is scheduled
**Then** 15% of auto-active card versions during the first four weeks and 100% of verify-first outcomes receive version-bound sampling recommendations
**And** sampling resolution records pass/fail reason codes and can raise sampling or suppress an affected policy cohort after a high-severity failure.

### Story 3.10: Propagate Source Removal and State Changes to Search Eligibility

As a traveler,
I want withdrawn, conflicted, or suppressed knowledge removed from normal use immediately,
So that stale search projections cannot keep unsafe facts in AI answers.

**Acceptance Criteria:**

**Given** Knowledge changes publication, knowledge, review, verification, evidence, or source eligibility
**When** the owning command commits
**Then** it updates card state, increments version, records meaningful audit, and writes an index dirty marker in one transaction
**And** suppression, archival, superseding, high-risk conflict, or source withdrawal disables the active projection in that transaction.

**Given** a source is withdrawn, inaccessible, or subject to removal
**When** the retryable removal command runs
**Then** it locks dependent evidence/cards, marks affected evidence removed and traveler-invisible, re-evaluates remaining evidence, and downgrades or suppresses cards before hiding/deleting artifacts
**And** partial work resumes idempotently without restoring removed traveler evidence.

**Given** index work lags a state mutation
**When** traveler retrieval is later attempted
**Then** it rechecks current owner-row and evidence eligibility so lag cannot re-enable an ineligible card
**And** only the concise required removal/state audit remains after retention.

### Story 3.11: Report Active Evidence-Grounded Seed Coverage

As an operator,
I want to see active evidence-grounded corridor coverage,
So that public MVP readiness measures usable knowledge rather than historical approvals.

**Acceptance Criteria:**

**Given** AI-first cards exist
**When** the operator views seed progress
**Then** the system counts active Hanoi-to-HCMC cards with current active evidence and complete retrieval metadata
**And** suppressed, archived, superseded, evidence-invalid, or incomplete cards do not count toward the 100-card target.

**Given** counted cards have type, route/location, review, and verification states
**When** progress is displayed
**Then** it shows distribution gaps by taxonomy and route/location plus pending verification/review signals
**And** it distinguishes active community observations/patterns from caveat-only high-risk material.

**Given** the active evidence-grounded target is not met
**When** public MVP readiness is checked
**Then** the product reports the remaining gap without claiming approval-based readiness
**And** operators can trace source/recommendation work needed to close it.

## Epic 4: Source-Grounded AI Answers And Trust Signals

Travelers receive responsive, source-aware answers that use their trip/chat context and eligible active knowledge, fall back safely to external search when needed, stream only after provenance is prepared, and let travelers inspect persisted, safe answer/source details.

### Story 4.1: Migrate Retrieval to State-Aware Active Knowledge

As a traveler,
I want AI Ask to select only currently safe community knowledge,
So that old approval flags cannot make unsafe or withdrawn facts appear in answers.

**Acceptance Criteria:**

**Given** lexical knowledge search returns candidate projections
**When** retrieval selects source-bundle items
**Then** it rechecks current card publication, knowledge, review, verification, active evidence, traveler-safe source linkage, conditions, and required metadata
**And** legacy `approved`/`needsReview` fields no longer determine traveler eligibility.

**Given** a candidate is active with eligible evidence
**When** retrieval evaluates intended use
**Then** it returns exactly one machine-readable policy: `contextual_use`, `caveat_only`, or `exclude`
**And** unknown, incomplete, stale, disabled, suppressed, archived, superseded, failed-verification, source-missing, or operator-only records fail closed.

**Given** a source projection was left active by an index delay
**When** the owner row/evidence is no longer eligible
**Then** retrieval excludes it and safely disables the stale projection where practical
**And** lexical score never overrides current eligibility.

### Story 4.2: Index Current AI-First Knowledge Versions

As a product owner,
I want search documents to follow current AI-first card versions,
So that the lexical index is a safe projection rather than a source of truth.

**Acceptance Criteria:**

**Given** a Knowledge mutation creates a dirty active card version
**When** the indexing worker claims it
**Then** it rebuilds or disables the document idempotently by `(knowledge_card_id, content_version)`
**And** duplicate/outdated work cannot overwrite a later version.

**Given** a card is suppressed, archived, superseded, withdrawn, or otherwise fails eligibility
**When** the state mutation commits or indexing backfill runs
**Then** its search projection is disabled
**And** no active document remains eligible solely because it was previously indexed.

**Given** legacy cards are migrated to the AI-first model
**When** indexing backfill runs
**Then** eligible active cards receive current projections and ineligible cards remain disabled
**And** worker health, retries, and batch behavior remain compatible with the separately supervised runtime.

### Story 4.3: Assemble State-Aware Knowledge Source Bundles

As a traveler,
I want the assistant to receive the conditions and limits of community knowledge,
So that its answer can use local observations without overstating certainty.

**Acceptance Criteria:**

**Given** retrieval selects eligible knowledge
**When** the source bundle is assembled before generation
**Then** each knowledge item contains card identity, fact, type, location/route, conditions, confidence, freshness, knowledge/verification state, use policy, and bounded traveler-safe evidence/source metadata
**And** the prompt removes approved-only wording in favor of active state-aware knowledge.

**Given** a source/evidence record is operator-only, raw, private, or lacks display permission
**When** the source bundle and provenance snapshot are assembled
**Then** its raw text, copied body, image/OCR note, provider payload, audit metadata, and hidden quote/link are excluded
**And** the assistant receives no substitute content invented from those fields.

**Given** selected trip context, current chat context, knowledge, web results, and general reasoning are present
**When** prompt context is ordered
**Then** the existing priority order is preserved: trip, chat, active knowledge, web fallback, general reasoning
**And** knowledge use instructions are explicit and cannot be overridden by text inside source data.

### Story 4.4: Enforce Community, Conditional, and Conflict Answer Policy

As a traveler,
I want uncertainty wording to match the evidence state,
So that community reports guide planning without becoming false guarantees.

**Acceptance Criteria:**

**Given** a selected card has `community_observation`, `community_pattern`, or `conditional` knowledge state and contextual use policy
**When** the assistant generates an answer
**Then** it describes an observation as community-reported, describes a pattern only when independent supporting evidence exists, and includes every material condition for conditional use
**And** it does not call the claim official or confirmed without applicable source/verification support.

**Given** a selected card is uncertain or has required verification
**When** the assistant uses it
**Then** it is caveat-only and cannot drive an itinerary decision as settled fact
**And** the answer tells the traveler what changing detail to confirm.

**Given** a card is conflicted, superseded, verification-failed, or non-active
**When** an answer is prepared
**Then** it is excluded as a factual itinerary premise
**And** the assistant may instead state uncertainty, ask a clarification, search, recommend verification, or choose a safer alternative.

### Story 4.5: Update Search Fallback and Provenance for AI-First States

As a traveler,
I want current external information when active knowledge is insufficient or risky,
So that changing road-trip details are handled honestly.

**Acceptance Criteria:**

**Given** active knowledge is absent, fewer than three relevant items for a broad question, freshness-sensitive, uncertain, or conflicted
**When** the retrieval decision is made
**Then** the existing provider-adapted web fallback is triggered with official/provider preference
**And** external results remain labeled unverified.

**Given** web search succeeds after a state-aware knowledge decision
**When** the assistant response and provenance are persisted
**Then** retrieval decision/provenance retain selected knowledge card IDs, use policies, state/verification snapshots, search reason, and web result IDs
**And** the final assistant message and provenance remain transactionally consistent.

**Given** web search fails or returns low-confidence results
**When** the answer is generated
**Then** it says updated information could not be verified and recommends user confirmation
**And** it does not fill the gap with unsupported current-fact guidance.

### Story 4.6: Render State-Aware Traveler Trust Details

As a traveler,
I want sources and warnings to explain the state of information,
So that I can decide what to verify before acting.

**Acceptance Criteria:**

**Given** an answer uses active community knowledge, caveat-only knowledge, or web fallback
**When** source/confidence UI is rendered from persisted provenance
**Then** it exposes the appropriate community, conditional, freshness, and verification caveats alongside label/type/date/confidence/URL where safe
**And** color is never the only indicator.

**Given** a traveler opens a persisted annotation or contextual detail panel
**When** it resolves source details
**Then** its safe summary and quick facts reflect stored source/provenance snapshots and use policy
**And** it does not infer state, evidence, or citations by parsing answer prose.

**Given** a Facebook-derived evidence record is operator-only or has no traveler display permission
**When** traveler trust details render
**Then** the raw post, quote, and link remain hidden
**And** a traveler-visible quote/link appears only when the explicit safe display policy permits it.

### Story 4.7: Verify AI-First Retrieval and Answer Safety

As a product owner,
I want automated evidence that retrieval and answers honor AI-first policy,
So that publication automation does not introduce silent traveler-safety regressions.

**Acceptance Criteria:**

**Given** test fixtures cover active, suppressed, archived, superseded, uncertain, conflicted, verification-required, source-withdrawn, source-missing, stale-index, and operator-only cases
**When** retrieval and source-bundle tests run
**Then** only policy-eligible candidates enter traveler bundles with the correct use policy
**And** stale projections, raw source material, and unsafe evidence cannot bypass owner-row checks.

**Given** evaluation prompts exercise community observation, pattern, conditional, high-risk, conflict, and web-search-failure cases
**When** answer-policy checks run
**Then** required wording/caveats are present and conflicted claims do not become factual itinerary premises
**And** low-confidence search fallback produces verification guidance rather than invented facts.

**Given** the migrated index and worker process run under retries/concurrent claims
**When** safety tests simulate stale/outdated work
**Then** a prior card version cannot become active after a later suppression/removal
**And** failures identify a safe implementation-visible reason without exposing raw/operator-only data.

## Epic 5: Family-Aware Planning And Quality Learning

Families receive practical child-aware planning recommendations, and the product captures traveler usefulness signals and repeatable quality evaluations to improve trustworthy road-trip answers.

**Status:** Family-awareness, feedback capture, the five-prompt evaluation set, and the quality dashboard are completed baseline capabilities. The stories below are only the AI-first community-knowledge quality delta.

### Story 5.1: Evaluate AI-First Community Knowledge Safety

As a product owner,
I want evaluation runs to measure state-aware community knowledge behavior,
So that answer quality metrics catch unsafe publication or wording regressions.

**Acceptance Criteria:**

**Given** the existing public-MVP evaluation prompt set and rubric
**When** AI-first evaluation cases are added
**Then** they cover community observation, independent pattern, conditional high-risk claim, conflict, source withdrawal, and low-confidence web-search fallback
**And** every result retains the card/evidence state and use-policy snapshots used for its answer.

**Given** an evaluated answer uses community or external information
**When** counter-metrics are calculated
**Then** the system flags unsupported community wording, missing caveats, unsafe conflicted use, stale/withdrawn source exposure, and raw/evidence leakage
**And** existing context, specificity, source-grounding, uncertainty, family-awareness, Vietnamese clarity, and generic-answer measures remain available.

**Given** no relevant active knowledge is eligible
**When** an evaluation exercises search failure or low confidence
**Then** the expected answer behavior is explicit verification guidance rather than unsupported replacement facts
**And** the result records whether that fallback contract was met.

### Story 5.2: Surface AI-First Policy Quality Signals

As an operator,
I want quality views to expose evidence and policy failure patterns,
So that I can prioritize suppression, verification, or stricter sampling before travelers are affected.

**Acceptance Criteria:**

**Given** sampling recommendations, evaluation results, and card state transitions exist
**When** an operator views quality signals
**Then** they can inspect active-card sampling pass/fail, policy cohort, evidence-grounding failure, caveat violation, verification-required state, and suppression/escalation signals
**And** usefulness and generic-answer comparison remain linked to stored retrieval decisions/provenance.

**Given** a high-severity sampled or evaluated policy failure is recorded
**When** the affected cohort is shown
**Then** the view identifies the prompt/model/category/cohort and recommended safe action
**And** it does not expose raw source material, provider payloads, or traveler-private content.

**Given** no data is sufficient to calculate a quality signal
**When** the dashboard renders
**Then** it reports the missing signal rather than claiming readiness
**And** it preserves role-gated operator access.

### Story 5.3: Close the Active Evidence-Grounded Card Readiness Gate

As a product owner,
I want public evaluation to require active, evidence-grounded knowledge rather than historical approvals,
So that the 100-card readiness target represents traveler-usable coverage.

**Acceptance Criteria:**

**Given** the Hanoi-to-HCMC corpus is evaluated for readiness
**When** the active-card target is calculated
**Then** it requires at least 100 cards that are active, have code-valid current evidence, and satisfy complete retrieval metadata
**And** suppressed, archived, superseded, evidence-invalid, or incomplete records do not count.

**Given** quality sampling and evaluation results exist for the corpus
**When** readiness is reported
**Then** every sampled active card must have validated evidence and no high-severity publication-policy failure
**And** unresolved verification, cohort, taxonomy, route, or quality gaps are explicitly listed.

**Given** the target or safety evidence is incomplete
**When** public-MVP evaluation is requested
**Then** the report blocks a readiness claim and identifies the remaining active-card/sample/coverage gap
**And** it does not substitute approved-card counts for AI-first eligibility.

## Epic 6: Public MVP Knowledge Readiness

The product team can validate that the Hanoi-to-HCMC knowledge corpus and traveler answer experience are ready for public MVP evaluation, with active evidence-grounded cards, operational safeguards, and measurable answer-quality outcomes.

### Launch Readiness Prerequisites

The following are tracked prerequisites, not Story 6.2 acceptance criteria. Each requires a named evidence record, owner, and explicit disposition of `complete`, `accepted_risk`, or `blocked` before the final review:

1. Confirm manual Google OAuth, operator/admin access, and referral-attribution smoke tests, or explicitly mark each obsolete.
2. Replace placeholder AI Gateway pricing with verified provider pricing before usage-cost reporting is relied upon.
3. Validate Tavily quality, cost, rate limits, and failure monitoring for public-scale web fallback.
4. Decide whether assistant-message/provenance persistence remains coupled to AI-usage event insertion.
5. Decide and, if required, implement assistant-turn idempotency for ambiguous commit failures.
6. Resolve or explicitly defer same-conversation concurrency hardening.
7. Document DB-backed test sequencing for migration and integration-test execution.
8. Confirm provider privacy settings and public privacy notice wording for Gateway-backed processing.

### Story 6.1: Validate Knowledge Pipeline Operations Before Public Evaluation

As a product owner,
I want an operational validation of the AI-first knowledge pipeline,
So that public evaluation does not rely on untested workers, retention, removal, or recovery behavior.

**Acceptance Criteria:**

**Given** ingestion and indexing workers are deployed to their separately supervised runtime
**When** operational validation runs
**Then** it verifies worker health/restart supervision, stage retry/recovery, index rebuild/disable behavior, role-gated operator access, audit integrity, environment separation, and PostgreSQL backup/restore evidence
**And** it records safe failures without raw source, provider payload, credential, or traveler-private leakage.

**Given** Facebook capture, retention, and removal capabilities are enabled
**When** the operational checklist is run
**Then** it verifies operator-controlled capture boundaries, 180-day retention eligibility, retryable source withdrawal/removal, and dependent card/projection re-evaluation
**And** it proves raw captured material is never available through traveler retrieval or trust UI.

**Given** an operation is incomplete or fails its safety check
**When** the validation report is produced
**Then** it identifies the owner, exact blocker, and safe remediation
**And** it does not mark the pipeline operationally ready.

### Story 6.2: Run Public MVP AI-First Readiness Review

As a product owner,
I want one evidence-based go/no-go review for the public MVP,
So that launch readiness is explicit about completed proof, accepted risk, and blocking gaps.

**Acceptance Criteria:**

**Given** active-corpus, quality, retrieval-safety, operational, provider-readiness, and all launch-prerequisite evidence is available
**When** the readiness review runs
**Then** it combines the 100-card active evidence-grounded target, sampling/evaluation outcomes, fail-closed retrieval suite, source/provenance checks, provider privacy settings, and web-search monitoring evidence
**And** every criterion is classified as complete, accepted risk, or blocked with linked evidence.

**Given** a launch readiness prerequisite is incomplete or accepted as a risk
**When** the review reports launch status
**Then** it links that prerequisite's owner, evidence, disposition, and impact on the chosen public-evaluation scope
**And** it does not hide an unresolved prerequisite inside the review narrative.

**Given** a mandatory proof is missing or a safety criterion fails
**When** the final status is calculated
**Then** the report returns no-go or conditional go with explicit accepted-risk authority
**And** it never claims public readiness merely because legacy approved-card, historical extraction, or UI-completion counts are high.
