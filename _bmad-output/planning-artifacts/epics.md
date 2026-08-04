---
stepsCompleted:
  - step-01-requirements-extraction
  - step-02-epic-design
  - step-03-story-generation
  - step-04-final-validation
  - step-01-trip-planning-requirements-extraction
  - step-02-trip-planning-epic-design
  - step-03-trip-planning-story-generation
  - step-04-trip-planning-final-validation
  - step-01-ad-31-requirements-extraction
  - step-02-ad-31-epic-design
  - step-03-ad-31-story-generation
  - step-04-ad-31-final-validation
  - step-01-architecture-delta-2026-07-28-requirements-extraction
  - step-02-architecture-delta-2026-07-28-epic-design
  - step-03-architecture-delta-2026-07-28-story-generation
  - step-04-architecture-delta-2026-07-28-final-validation
  - step-01-knowledge-lifecycle-normalization-2026-08-04-requirements-extraction
  - step-02-knowledge-lifecycle-normalization-2026-08-04-epic-design
  - step-03-knowledge-lifecycle-normalization-2026-08-04-story-generation
  - step-04-knowledge-lifecycle-normalization-2026-08-04-final-validation
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md
  - _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/addendum.md
  - _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/community-knowledge-solution-design.md
  - _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md
  - _bmad-output/project-context.md
  - _bmad-output/planning-artifacts/proposal-eliminate-fake-system-users-with-audit-actors.md
  - docs/proposals/knowledge-lifecycle-normalization.md
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
FR-16A: Let an owner request structured Trip Project anchor changes through the primary conversation; accepted changes require explicit Trip Change Proposal confirmation.
FR-16B: Let an owner request dated trip legs and activities through the primary conversation; accepted changes require explicit Trip Change Proposal confirmation.
FR-16C: Give each structured trip item an explicit `idea`, `planned`, `confirmed`, or `backup` state; an open or `idea` item is not erroneous solely because it is unconfirmed.
FR-16D: Let an owner request travel-relevant constraint changes through the primary conversation; accepted changes require explicit Trip Change Proposal confirmation.
FR-16E: Establish one primary conversation for each Trip Project while preserving owner access to currently linked historic conversations during migration.
FR-16F: Show an owned Trip Project a basic Trip Home that prioritizes an unresolved planning decision, otherwise the next planned leg or preparation focus, and presents the primary conversation as the central action.
FR-16G: Let AI create a typed Trip Change Proposal containing rationale, affected trip items, alternatives when available, and expiry when its supporting information is time-sensitive.
FR-16H: Require the Trip Project owner to explicitly apply a Trip Change Proposal before it changes persistent trip state; AI, provider output, and ordinary answer generation cannot directly mutate itinerary, constraints, or item state.
FR-16I: Preserve an owner-visible history for applied, dismissed, and expired Trip Change Proposals with actor and timestamp.
FR-17: Support operator-created knowledge cards.
FR-18: Store title, type, location/route, summary, source, collected date, confidence, tags, and freshness-sensitive status on cards.
FR-18A: Preserve short validated evidence quote/span, source link, capture/observed date, and conditions before an AI-extracted community claim is active.
FR-18B: Never retain or expose PII/sensitive content in traveler-visible facts or evidence quotes.
FR-19: Support the defined knowledge-card taxonomy.
FR-20: Let operators create, edit, approve, and archive cards.
FR-21: Retrieve cards in active publication state; qualifying AI-extracted community claims do not require operator approval.
FR-22: Preserve inspectable source provenance.
FR-22A: Give each knowledge card exactly one workflow lifecycle state: draft, pending_operator, active, suppressed, archived, or rejected.
FR-22B: Track domain classification separately as community_observation, community_pattern, conditional, or conflicted; do not use workflow concepts as classifications.
FR-22C: Track verification requirement separately as none, operator_required, or failed; derive corroboration from eligible independent evidence and record human decisions in work resolution/audit history.
FR-22D: Exclude every card other than an evidence-eligible active card from normal retrieval; pending_operator is never traveler retrievable.
FR-23: Accept operator source submissions as URL, raw text, copied post, or image/screenshot.
FR-23A: Queue unreadable Facebook URLs for later operator-run capture.
FR-23B: Capture only confirmed, operator-only visible Facebook material without browser credentials, cookies, tokens, local storage, full HTML, or hidden data.
FR-24: AI-triage source material, extract structured claims, and validate each against a source-text evidence span.
FR-24A: Classify triaged sources as rejected, context-only, candidate, or verify-first and retain decision reasons.
FR-24B: Use an independent AI judge, separate from extraction, for publication/suppression/review decisions.
FR-24C: Discover and process every independently useful atomic claim from a submitted immutable source version without an accepted-fact quota.
FR-24D: Give each discovered candidate an independent, immutable completed AI disposition/reason or a failed outcome with no business disposition; complete source ingestion only after discovery is terminal and every candidate is completed or failed, while retaining idempotent observability counters only.
FR-24E: Prevent work for an earlier superseded capture version from mutating active knowledge while preserving intelligible historical ingestion behavior.
FR-25: Make claims searchable without human approval only when evidence, specificity, actionability, privacy, commercial-risk, and conflict policy pass.
FR-25A: Create risk-prioritized review recommendations, not mandatory approval gates, for risky, weak, conflicting, duplicate, or context-missing claims.
FR-25B: Quality-sample 15% of auto-active claims for the first four weeks; create one immutable, non-actionable sampling obligation for every needs_operator candidate; record exact cohorts before high-severity containment and either open fenced risk work for remediable cards or suppress/de-index unsafe cards.
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
FR-45A: Show operators safe aggregate and candidate-level ingestion outcomes without raw provider output, raw captured text, unapproved quotes, or execution secrets.
FR-46: Capture a simple usefulness rating for answers.
FR-47: Record authenticated AI usage with user/context, purpose, model/provider, timestamp, and available usage/cost metadata.
FR-48: Capture valid sign-in referral attribution without rewards, rankings, payouts, or credits.
FR-49: Manage AI Gateway model records with name, purpose, capabilities, active status, and input/output/cache pricing.
FR-50: Estimate usage cost from configured pricing and available provider token metadata without billing behavior.
FR-51: Expose versioned domain API contracts for traveler web, operator app, and future mobile clients without client dependence on Next.js internals or Auth.js session serialization.
FR-52: Let traveler and operator browser clients call documented versioned NestJS APIs directly using only NestJS-managed secure session cookies; never give them database credentials or internal service credentials.
FR-53: Provide a separately deployed operator/admin application with its own origin and release lifecycle that uses the protected API without database credentials or direct domain imports.
FR-54: Authorize every protected API read and command with a domain-neutral request principal resolved by NestJS from a live opaque server-side session and current authorization state.
FR-55: Provide a stable API error contract with machine-readable code, safe message, request/correlation ID, and applicable safe field violations without sensitive internals.
FR-56: Document versioned health/version and protected-capability API contracts, including validation, authorization, ownership, pagination/stable ordering, and streaming semantics where applicable.
FR-57: Run continuous background work in a dedicated worker runtime and bounded sweeps as scheduled one-shot commands using existing PostgreSQL job, claim, lease, fencing, and idempotency protocols.
FR-58: Preserve one writer per aggregate command during migration; route each request to exactly one transport owner and never dual-write product state.
FR-59: Move AI Ask streaming to the versioned API while preserving `preparing`, `delta`, `done`, and `error` NDJSON events, abort behavior, and atomic terminal persistence.
FR-60: Retire Auth.js, BFF transport, legacy Next.js domain route handlers, server-action writers, and the legacy `/admin` operational surface before public launch.

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
NFR-10: Trip Project reads and mutations, including primary-conversation access, structured plan data, proposals, and history, remain owner-scoped until a separately approved collaboration model exists.
NFR-11: Applying a Trip Change Proposal validates the proposal belongs to the selected Trip Project, is still applicable, and is authorized for the owner before writing an auditable change.
NFR-12: API, worker, traveler web, operator app, and migration workloads deploy independently to staging with least-privilege configuration and health contracts; migrations run before dependent traffic.
NFR-13: Liveness verifies process operation; readiness verifies assigned configuration, database, and critical dependencies. Worker shutdown stops claims and safely completes or releases leased work.
NFR-14: Correlation IDs and safe structured telemetry cover browser session admission, API, worker, and provider operations, including capability, principal class, result, latency, and safe operational identifiers.
NFR-15: Browser-to-API and database traffic remain private and origin-controlled; staging and production use isolated credentials, databases, OAuth configuration, and observability projects.
NFR-16: The current lifecycle normalization uses a clean-break migration, reset, and reseed only while all targets are disposable; if durable shared or customer data exists before shipping, stop and use an approved expand-migrate-contract plan.
NFR-17: Before retiring a legacy worker loop, its replacement dashboard and runbook demonstrate stable lag, retry, lease recovery, duplicate-poller, and restart behavior.
NFR-18: Before public launch, approve Railway ownership, domains/DNS/CSP/OAuth callbacks, secrets, backup/restore, monitoring, alerting, and on-call; pass connection-pool, AI-stream concurrency, and backup-restore tests.

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

### Knowledge Lifecycle Normalization Requirements (2026-08-04)

- KLN-1: Replace legacy overlapping knowledge state fields with one card `lifecycle_state`, separate domain classification and verification requirement, target-shaped job/candidate/recommendation records, and `knowledge_sampling_obligations`.
- KLN-2: Enforce row-local lifecycle and candidate-outcome rules with checks, candidate completed-outcome immutability with a database trigger, and per-card-version open-work cardinality with partial unique indexes.
- KLN-3: Implement `transitionKnowledgeCard` as the only production writer of knowledge lifecycle, verification requirement, actionable recommendation state, candidate-card association, lifecycle audit, and lifecycle-caused search invalidation; it returns typed `resolved`, `stale`, or `invalid` outcomes under version fences and locks.
- KLN-4: Keep Worker ownership of continuous ingestion, conflict, index, and sampling-selection loops; allow the authenticated API to execute authorized operator decisions synchronously; keep `apps/admin` presentation-only and prohibit API job claims/ingestion loops.
- KLN-5: Require eligible active supporting evidence with validated span, source/capture eligibility, and retrieval metadata for active cards; atomically disable projection and re-evaluate/suppress a card when it loses final eligible support.
- KLN-6: Model jobs as technical execution only, with terminal discovery plus terminal candidate processing before completion and transactional idempotent counters that never determine lifecycle or retrieval.
- KLN-7: Preserve completed candidate AI disposition/reason as immutable, prevent failed candidates from holding business dispositions, and retain candidate decisions when later operator work resolves.
- KLN-8: Separate actionable recommendations from immutable sampling obligations; implement version-fenced primary/sampling work, exact high-severity cohort persistence, and containment with risk requeue or suppression without successor work.
- KLN-9: Update retrieval, search indexing, source removal, API contracts, safe admin read models, seeds, fixtures, and tests to use only the target representation after reset/reseed; remove legacy runtime paths without a backfill, dual-write, or compatibility layer.
- KLN-10: Cover every transition-matrix trigger and forbidden transition, constraints, stale/concurrent work, mixed jobs, source withdrawal, sampling containment, atomic audit/index effects, API authorization, and direct-admin contracts with appropriately scoped unit/integration tests.

### Architecture Decision Requirements

AD-31-1: `users` contains authenticated people and deliberate person fixtures only; system actors cannot authenticate, receive roles, own records, receive referrals, or gain authorization privileges.

AD-31-2: Audit-taking APIs accept the `AuditActor` union. User actors contain a real user ID and nonblank email snapshot; system actors contain one cataloged system ID and no user ID or email.

AD-31-3: `audit_events` and `trip_plan_change_history` persist exactly one user-or-system actor shape, enforced by application validation and database checks.

AD-31-4: The system actor catalog is immutable and contains `system-ai-orchestration`, `system-knowledge-pipeline`, `system-trip-planning`, `system-facebook-capture`, and `system-youtube-capture` with server-owned labels.

AD-31-5: Real-user ownership, requester, submitter, reviewer, approver, referral, session, and conversation fields remain real-user foreign keys. Automated execution fields persist cataloged system executors separately.

AD-31-6: Automated knowledge artifacts, source/capture artifacts, automated recommendation resolution/supersession, and AI usage persist required `executor_system` values with indexed system execution attribution.

AD-31-7: `ai_usage_events` uses nullable `initiated_by_user_id` plus required `executor_system`; user-facing metrics aggregate initiators only, while worker work appears in operations reporting under the cataloged executor.

AD-31-8: Audit owns actor catalog/session conversion/validation and typed audit, history, and usage writers; feature modules cannot directly insert `audit_events`, `trip_plan_change_history`, or `ai_usage_events`.

AD-31-9: The disposable development database uses a clean-break migration: remove fake-system-user migrations, seeds, helpers, and APIs; reset/reseed instead of backfilling. Stop and redesign as expand-migrate-contract if durable data exists before shipping.

AD-31-10: Verify valid/rejected actor persistence shapes, worker executor attribution with requester preservation, clean migration/seed output, no remaining fake-user creation path, and inability of system actors to authenticate or receive roles.

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

### Architecture Delta Requirements (2026-07-28)

- ADR-33: NestJS owns Google OAuth, opaque PostgreSQL sessions, session cookie lifecycle, CSRF validation, allowed browser origins, and `RequestPrincipal` normalization. Browser applications contain no BFF credential, Auth.js session authority, or domain writer.
- ADR-32-2: `user_roles` is authoritative. A one-shot audited `INITIAL_ADMIN_EMAIL` bootstrap may create the first admin only when none exists; subsequent role changes are Admin domain commands that audit, increment authorization version, and cannot revoke the last active admin.
- ADR-33-1: Browser requests call NestJS directly using a secure HttpOnly opaque session cookie. NestJS validates expiry, revocation, user state, current roles, authorization version, CSRF for mutations, and an explicit credentialed-origin policy before dispatching a principal.
- ADR-32-4: AI Ask owns a 24-hour, scope-unique command ledger keyed by owner, conversation or Trip Project scope, and an `Idempotency-Key` of 16-128 URL-safe ASCII characters. Reused keys with a changed normalized-payload digest fail safely; identical pending and terminal commands return their persisted state without another provider call.
- ADR-32-5: AI Ask command creation captures conversation lifecycle and Trip Project aggregate fences under owner locks. Final message, provenance, usage, source-bundle, annotation, and proposal effects persist atomically only while the captured fence holds; a failed fence produces a safe `discarded`/`refresh_required` terminal result and no visible partial state.
- ADR-32-6: Durable follow-up work uses a PostgreSQL transactional `domain_outbox` with versioned bounded payloads, deterministic dedupe, `FOR UPDATE SKIP LOCKED` leasing/fencing, compare-and-swap acknowledgement, bounded retry, safe terminal failures, and owner-fence validation before every write.
- ADR-32-7: AI Ask queues context extraction after user-turn persistence, annotation enrichment after terminal assistant/provenance persistence, and proposal drafting after terminal assistant persistence. Consumer delay or failure never changes a completed AI Ask command into a failed command.
- ADR-32-8: Chat/Trips exclusively publishes `TripAnswerContext v1` at a Trip Project aggregate version. Structured anchors, plan items, and constraints are canonical; legacy project fields cannot override them, and lower-priority chat conflicts become typed entries. Source bundles retain ordered inclusion/exclusion, conflicts, deterministic serialization, and the final prompt-section SHA-256 digest.
- ADR-32-9: Source withdrawal marks linked assistant provenance unavailable, redacts traveler-safe snapshots, invalidates dependent annotations, and is idempotent. Traveler read models show only a localized unavailable marker for withdrawn provenance; source removal fails closed until historical provenance can be backfilled and safely redacted.
- ADR-32-10: Persisted answer descriptors use validated UTF-16 ranges and provenance ownership. Source-backed descriptor types require same-message, same-conversation, same-user provenance; answer-local warnings/trip facts may omit provenance only when non-navigable and source-free; owner-context actions derive targets server-side.

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
FR-16A: Epic 7 - Chat-requested structured Trip Project anchors.
FR-16B: Epic 7 - Chat-requested dated legs and activities.
FR-16C: Epic 7 - Explicit plan-item states and scoped backups.
FR-16D: Epic 7 - Chat-requested trip constraints.
FR-16E: Epic 7 - Primary conversation migration and historic conversation preservation.
FR-16F: Epic 7 - Deterministic Trip Home and primary conversation access.
FR-16G: Epic 7 - Typed, expiring AI Trip Change Proposals.
FR-16H: Epic 7 - Owner-confirmed transactional proposal application.
FR-16I: Epic 7 - Owner-visible proposal change history.
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
FR-24C: Epic 3 - Complete immutable-source candidate discovery and processing.
FR-24D: Epic 3 - Candidate-level terminal outcomes and source completion.
FR-24E: Epic 3 - Supersession-safe source-version claiming, processing, and recovery.
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
FR-45A: Epic 3 - Safe operator ingestion outcome diagnostics.
FR-46: Epic 5 - Answer usefulness feedback.
FR-47: Epic 4 - Authenticated AI usage events.
FR-48: Epic 1 - Silent referral attribution.
FR-49: Epic 4 - Managed AI Gateway model records.
FR-50: Epic 4 - Internal cost estimation.

### Architecture Delta Coverage Map (2026-07-28)

ADR-33: Epic 14 - Direct browser authentication/session authority and principal validation.
ADR-32-2: Epic 9 - Authoritative roles, initial-admin bootstrap, and safe role changes.
ADR-33-1: Epic 14 - Direct browser API security boundary.
ADR-32-4: Epic 10 - Idempotent AI Ask command handling.
ADR-32-5: Epic 10 - Fenced terminal AI Ask persistence.
ADR-32-6: Epic 10 - Durable asynchronous AI Ask follow-up work.
ADR-32-7: Epic 10 - Ordered, non-retroactive AI Ask consumers.
ADR-32-8: Epic 11 - Canonical TripAnswerContext and auditable source bundles.
ADR-32-9: Epic 11 - Withdrawn provenance safety for historic traveler answers.
ADR-32-10: Epic 11 - Validated, provenance-safe answer annotations.

### Knowledge Lifecycle Normalization Coverage Map (2026-08-04)

KLN-1: Epic 15 - Target schema, contracts, migration, reset, seeds, and fixtures.
KLN-2: Epic 15 - Database lifecycle invariants and completed-candidate immutability.
KLN-3: Epic 15 - Version-fenced transactional lifecycle command.
KLN-4: Epic 15 - Worker/API/admin ownership enforcement.
KLN-5: Epic 15 - Evidence-safe activation, retrieval, and source removal.
KLN-6: Epic 15 - Technical job completion and idempotent candidate counters.
KLN-7: Epic 15 - Immutable candidate AI outcomes.
KLN-8: Epic 15 - Actionable work, sampling obligations, and containment.
KLN-9: Epic 15 - Target-only retrieval, contracts, admin views, and fixtures.
KLN-10: Epic 15 - Lifecycle transition-matrix verification.
FR-22A: Epic 15 - One card workflow lifecycle.
FR-22B: Epic 15 - Domain classification separated from workflow.
FR-22C: Epic 15 - Independent verification requirement and derived corroboration.
FR-22D: Epic 15 - Evidence-eligible active-only retrieval.
FR-24D: Epic 15 - Immutable terminal candidate outcomes and technical job completion.
FR-25A: Epic 15 - Fenced actionable operator work and stale-work safety.
FR-25B: Epic 15 - Sampling obligations and cohort-scoped containment.
FR-29: Epic 15 - Active-evidence retrieval guard.
NFR-9: Epic 15 - Auditable lifecycle, outcome, evidence, and work history.
NFR-9A: Epic 15 - Idempotent source processing and mixed-outcome job semantics.
NFR-9B: Epic 15 - Atomic source withdrawal and fail-closed retrieval.
NFR-16: Epic 15 - Disposable-target clean-break migration/reset/reseed.

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

**FRs covered:** FR-17, FR-18, FR-18A, FR-18B, FR-19, FR-20, FR-21, FR-22, FR-22A, FR-22B, FR-22C, FR-23, FR-23A, FR-23B, FR-24, FR-24A, FR-24B, FR-24C, FR-24D, FR-24E, FR-25, FR-25A, FR-25B, FR-26, FR-27, FR-28, FR-37, FR-37B, FR-45A

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

### Epic 7: Controlled Trip Project Planning

Travelers can convert AI guidance into a structured, owner-controlled road-trip plan: request anchor, constraint, leg, activity, and alternative changes through the primary conversation; review AI proposals; and understand the next planning action without confusing suggestions with confirmed state.

**FRs covered:** FR-16A, FR-16B, FR-16C, FR-16D, FR-16E, FR-16F, FR-16G, FR-16H, FR-16I.

**Implementation notes:** Build on the completed authenticated Chat/Trips baseline. The single-owner aggregate, ordering, parent, backup, and version checks remain Chat/Trips-owned. No maps, live route/ETA, weather, booking, availability, expense tracking, checklist, collaboration, or location-sharing behavior is introduced.

### Epic 8: Trustworthy Automation And Audit Attribution

Operators and travelers can trust that automated work is attributed to a first-class system executor while human ownership, requests, and audit history remain accurate and protected.

**Architecture requirements covered:** AD-31-1, AD-31-2, AD-31-3, AD-31-4, AD-31-5, AD-31-6, AD-31-7, AD-31-8, AD-31-9, AD-31-10.

**Implementation notes:** This is a cross-cutting clean-break development migration. Audit owns actor construction, validation, catalog metadata, and typed writes. All worker and automated paths preserve real-user requester/submitter provenance separately from their cataloged system executor. Do not add a compatibility/backfill path unless durable data exists before implementation, in which case stop and replace this epic with an expand-migrate-contract design.

### Epic 9: Trusted Private API Foundation

Travelers and operators use BFFs that call documented, protected `/v1` APIs with validated principals and safe responses, without exposing browser credentials or relying on Next.js sessions as API authorization.

**FRs covered:** FR-51, FR-52, FR-54, FR-55, FR-56. **NFRs covered:** NFR-14, NFR-15.

**Implementation notes:** Implement in order: 9.1 establishes the web credential/principal, session-token resolver, issuer isolation, and shared safe-error contract; 9.2 governs bootstrap and role changes; 9.3 consumes verified 9.1 primitives for BFF transport/CSRF; 9.4 consumes verified 9.1-9.3 primitives for one protected read. Do not begin a dependent story before its prerequisite story has passed its integration coverage. The separate admin BFF remains later deployment work; this epic configures its future issuer/verifier isolation without sharing root-web cookies.

### Epic 10: Reliable AI Ask API Cutover

Travelers use AI Ask through the BFF and versioned API without duplicate provider work or stale final answers, while durable follow-up work never changes a completed result.

**FRs covered:** FR-58, FR-59; supports FR-51, FR-54, FR-55, FR-56. **NFRs covered:** NFR-13, NFR-14.

**Implementation notes:** This epic owns the 24-hour command ledger, normalized request digest, owner fences, terminal atomicity, outbox protocol, ordered consumers, Nest `POST /v1/ai-ask/stream`, BFF forwarding, byte-stable NDJSON tests, and retirement of the matching legacy AI Ask writer.

### Epic 11: Explainable, Withdrawable Planning Context

Travelers receive answers whose structured Trip Project context and selectable details are traceable and safe over time: the assistant uses the canonical plan state, exposes only validated detail annotations, and removes withdrawn source details from historic answers without revealing stale content.

**FRs covered:** FR-51, FR-54, FR-55, FR-56, FR-58. **NFRs covered:** NFR-2, NFR-3, NFR-4, NFR-10, NFR-11, NFR-14.

**Implementation notes:** Chat/Trips owns `TripAnswerContext v1` and its precedence/conflict contract. AI orchestration stores immutable source-bundle snapshots. Knowledge source removal backfills and withdraws affected provenance before hiding source material. Each migrated read capability uses the API/BFF path and retires its matching legacy owner.

### Epic 15: Trustworthy Knowledge Lifecycle Cutover

Operators can safely manage evidence-grounded community knowledge through one unambiguous lifecycle, while travelers retrieve only active cards that retain eligible support and the Worker/API each retain their correct responsibilities.

**Requirements covered:** KLN-1 through KLN-10; FR-22A, FR-22B, FR-22C, FR-22D, FR-24D, FR-25A, FR-25B, FR-29, NFR-9, NFR-9A, NFR-9B, and NFR-16.

**Implementation notes:** This is a disposable-target clean break: one forward-only target migration followed by reset/reseed, with no backfill, dual write, compatibility runtime path, release matrix, or legacy fixture. It depends on the direct NestJS API boundary from Epic 14 but preserves its session, CSRF, origin, and safe-error behavior. The Worker remains the sole continuous execution owner; API commands synchronously resolve authorized operator decisions only, and `apps/admin` remains presentation-only. Epic 3 stories are historical baseline and must not be reinterpreted as this target lifecycle contract.

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

**Scope decision (2026-07-22):** Story 3.5 also owns the deterministic validation gates, independent judge, bounded evidence creation, canonical card mutation, relation matching, condition preservation, conflict policy, and complete candidate traversal required by FR-24C/FR-24D. This makes the first canonical source-version pipeline vertically safe: it must process every independently useful candidate from an immutable source version, give each candidate an auditable terminal outcome, and only complete the source after candidate work terminalizes. It must not publish a card without exact evidence, validation, independent judgment, and scoped relation handling. The automated actor is `system-knowledge-pipeline`; source and job submitter provenance remains immutable. Story 3.6 remains recovery-only and owns the stale/superseded-work safety required by FR-24E; Story 3.9 remains recommendation/sampling-only.

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

**Given** a newer immutable capture version supersedes an earlier version
**When** earlier work resumes, retries, or delivers a duplicate result
**Then** its fencing and expected-version checks prevent it from creating, attaching, conflicting with, or otherwise mutating active knowledge
**And** its historical job/candidate outcome remains interpretable without fabricating new candidate history.

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

**Given** an operator opens a source ingestion outcome
**When** candidate work is complete or in progress
**Then** the admin read model shows bounded aggregate and candidate-level stage/outcome, state, reason, and safe evidence metadata sufficient for diagnosis
**And** it never exposes raw provider output, raw captured text, unapproved quotes, execution-fencing data, or other execution secrets.

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

## Epic 7: Controlled Trip Project Planning

Travelers can convert AI guidance into a structured, owner-controlled road-trip plan: maintain anchors, constraints, dated legs, activities, and alternatives; use one primary Trip Project conversation; review AI proposals; and understand the next planning action without confusing suggestions with confirmed state.

### Story 7.1: Establish the Versioned Structured Trip Project Aggregate

As a traveler,
I want my Trip Project to own a structured plan and travel constraints,
So that confirmed trip state is durable, explicit, and separate from chat transcript context.

**Acceptance Criteria:**

**Given** an authenticated owner has a Trip Project
**When** the Trip Planning migration is applied
**Then** the project can own versioned structured plan items and one versioned constraints record without changing the ownership or deletion behavior of existing chat/project records
**And** all new tables, indexes, and constraints are introduced through Drizzle migrations.

**Given** a structured plan item is created or updated through the owning Chat/Trips command
**When** its kind is validated
**Then** it is exactly one of `anchor`, `leg`, or `activity`; anchors have one valid `origin`, `destination`, `region`, `required_stop`, or `accommodation` role; legs and activities have one valid `transport`, `visit`, `food`, `rest`, or `accommodation` type
**And** each item has exactly one `idea`, `planned`, `confirmed`, or `backup` state.

**Given** an owner records trip constraints
**When** the record is persisted
**Then** it accepts only travel-relevant travelers/children, vehicle or EV needs, driving tolerance, budget range, preferences, and avoid-list data
**And** disallowed sensitive personal data is rejected and never added to structured plan state.

**Given** a Trip Project is deleted
**When** deletion completes
**Then** its structured plan, constraints, and any future plan-derived retrievable state are removed or disabled from normal use with the rest of the owner-scoped project data
**And** only permitted minimal non-content audit metadata remains.

### Story 7.2: Establish the Primary Project Conversation Without Losing History

As a Trip Project owner,
I want one primary conversation for my trip while retaining historic linked chats,
So that I have a clear planning command surface without losing prior discussion.

**Acceptance Criteria:**

**Given** an existing owner-scoped Trip Project has zero, one, or multiple linked conversations
**When** the idempotent primary-conversation migration runs
**Then** it selects or creates exactly one owner-linked conversation as the primary conversation
**And** it preserves every existing owner-linked historic conversation and its access path.

**Given** a command sets or replaces the primary conversation
**When** it commits
**Then** the selected conversation belongs to the same owner and Trip Project and is neither deleted nor unlinked
**And** the command locks or fences the Trip Project so concurrent requests cannot leave multiple or invalid primary pointers.

**Given** a traveler opens the Trip Project workspace
**When** they continue planning in the central composer
**Then** new messages are written to the one primary conversation with the project context visibly active
**And** historic chats remain available from an explicit history entry rather than competing as parallel project composers.

### Story 7.3: Present Trip Home and the Owner's Plan Workspace

As a Trip Project owner,
I want a focused Trip Home and readable plan timeline,
So that I know the most useful next planning action and can inspect my saved plan state.

**Acceptance Criteria:**

**Given** a selected owned Trip Project has current plan and proposal state
**When** its Trip Home read model is calculated
**Then** it selects exactly one focus in this order: pending unexpired proposal with expiry, other pending unexpired proposal, confirmed-item gap, next future planned/confirmed leg, then preparation
**And** ties use earliest expiry, earliest planned time, then stable item creation time or ID.

**Given** a confirmed transport item lacks date/time or origin/destination context, or a confirmed accommodation item lacks date/time or place/area
**When** Trip Home is calculated
**Then** it identifies that item as a confirmed-item gap
**And** an `idea` or incomplete `planned` item is never treated as a gap by itself.

**Given** the owner opens a Trip Project on desktop, tablet, or mobile
**When** the workspace renders
**Then** it shows the project context, Trip Home focus, structured timeline, and central primary conversation using the existing server-loaded and URL-owned shell model
**And** mobile uses accessible sheets/drawers without creating a separate data loader or state owner.

**Given** a plan item is displayed in the timeline
**When** its state is shown
**Then** it includes a semantic icon and visible Vietnamese label for `Ý tưởng`, `Dự kiến`, `Đã chốt`, or `Phương án B`
**And** `Đã chốt` is not represented as booking, availability, provider, weather, or live-route confirmation.

### Story 7.4: Generate Reviewable AI Trip Change Proposals

As a Trip Project owner,
I want AI recommendations to appear as bounded change proposals,
So that I can understand the intended plan impact before any persistent state changes.

**Acceptance Criteria:**

**Given** an authenticated owner asks for a persistent plan adjustment in the primary conversation
**When** AI orchestration creates a proposal draft
**Then** it uses a schema-validated typed operation set with bounded rationale, identified affected items, expected project/item versions, ordering/parent preconditions, alternatives when available, and optional expiry
**And** the orchestration path cannot directly write plan items, constraints, or item states.

**Given** the owner asks to create, edit, remove, reorder, or change the state of anchors, legs, activities, alternatives, or constraints
**When** the proposal draft is validated
**Then** it permits only the defined plan-item kinds, roles, types, states, same-project parent/backup relationships, travel-relevant constraints, and available data boundaries
**And** the saved-plan timeline remains read-oriented with no separate plan-item, state, reorder, or constraint editor.

**Given** provider output proposes an unknown operation, cross-project item, invalid type/state, or unbounded content
**When** the draft is validated
**Then** it is rejected or safely omitted before persistence
**And** no structured plan state changes.

**Given** a pending valid proposal exists
**When** the owner sees it in an answer, Trip Home, timeline, or responsive detail surface
**Then** the UI distinguishes it from saved plan items and shows a bounded before/after impact, rationale, expiry when applicable, and only supported actions
**And** no apply action is offered for an expired proposal.

### Story 7.5: Apply, Dismiss, and Expire Proposals Safely

As a Trip Project owner,
I want explicit, safe controls for a proposed plan change,
So that AI cannot overwrite my confirmed plan or newer confirmed changes.

**Acceptance Criteria:**

**Given** the owner explicitly applies a pending proposal
**When** `applyApprovedTripChange(...)` runs
**Then** it authenticates the owner, locks the Trip Project, verifies ownership, status, expiry, expected aggregate/item versions, and ordering/parent preconditions
**And** it applies every typed operation or none in one transaction.

**Given** a proposal is stale, expired, unauthorized, references a missing item, or conflicts with a newer confirmed proposal
**When** application is attempted
**Then** no plan state is changed and the response safely requests refresh
**And** the proposal summary remains available without overwriting current owner data.

**Given** an owner dismisses a pending proposal or its expiry elapses
**When** the corresponding command is invoked by a read, application attempt, or scheduled worker
**Then** it marks the proposal terminal idempotently without mutating plan state
**And** it records exactly one safe history row with actor and timestamp.

**Given** a proposal is applied, dismissed, or expired
**When** the owner views plan history
**Then** it shows the status, safe operation summary, actor, timestamp, proposal ID, and affected item references
**And** it never exposes raw model prompts or responses.

### Story 7.6: Verify Owner-Scoped Trip Planning Safety

As a product owner,
I want automated verification of Trip Project ownership, conflicts, and state transitions,
So that structured planning remains safe as chat-driven proposals and confirmed changes interact.

**Acceptance Criteria:**

**Given** migration, command, and read-model tests run
**When** they exercise multiple owners, deleted or unlinked conversations, invalid item relationships, stale versions, backup references, ordering conflicts, proposal expiry, and concurrent applies
**Then** unauthorized or invalid operations fail without data leakage or partial writes
**And** valid owner operations preserve aggregate versions, ordering, history, and existing project-deletion behavior.

**Given** Trip Home test fixtures cover expiring proposals, pending proposals, confirmed-item gaps, future legs, empty plans, and ties
**When** its read model is evaluated
**Then** it deterministically chooses the architecture-defined focus
**And** it never implies unavailable dynamic data was checked.

**Given** the Trip Project workspace is verified across desktop and mobile presentations
**When** keyboard, touch, focus, live-region, and reduced-motion behaviors are assessed
**Then** plan and proposal actions remain reachable with explicit labels and recovery paths
**And** proposal application remains an unmistakable owner-confirmed action.

## Epic 8: Trustworthy Automation And Audit Attribution

Operators and travelers can trust that automated work is attributed to a first-class system executor while human ownership, requests, and audit history remain accurate and protected.

### Story 8.1: Establish the Audit Actor Boundary and System Catalog

As a product operator,
I want one validated actor boundary for human and automated actions,
So that all protected writes identify the correct kind of actor without treating a system as a user.

**Acceptance Criteria:**

**Given** an authenticated request or a worker entrypoint needs to record an actor
**When** it constructs an `AuditActor`
**Then** an authenticated request converts only to a user actor with a real `users.id` and immutable nonblank email snapshot, while a worker constructs a system actor directly
**And** no worker requires an authenticated session, fake login, OAuth account, or user role.

**Given** a system actor is requested
**When** its ID is validated or rendered for an audit read model
**Then** it is exactly one server-owned catalog entry from `system-ai-orchestration`, `system-knowledge-pipeline`, `system-trip-planning`, `system-facebook-capture`, or `system-youtube-capture`
**And** labels come from catalog metadata rather than user input, while `system-youtube-capture` is not created by seed data.

**Given** an actor payload has a missing or blank email, an arbitrary system ID, or mixed user and system fields
**When** an Audit-owned API validates it
**Then** validation rejects the payload before any database write
**And** feature modules consume the exported typed boundary rather than defining incompatible actor shapes.

### Story 8.2: Persist Valid Audit, History, and Usage Attribution

As a product operator,
I want audit, history, and usage records to persist unambiguous actor and executor attribution,
So that human activity, autonomous work, and reporting cannot be conflated.

**Acceptance Criteria:**

**Given** a user or system actor writes an audit event or trip-plan change-history record
**When** the migration and typed writer persist it
**Then** a user row has `actor_class = 'user'`, a non-null user FK, and its required email snapshot with no system ID, while a system row has `actor_class = 'system'`, a nonblank cataloged system ID, and null user/email fields
**And** database checks and application validation enforce exactly one valid shape.

**Given** an AI usage event is recorded
**When** the Audit/Usage writer persists it
**Then** it accepts `{ initiatedByUserId?, executorSystem, ... }`, stores nullable `initiated_by_user_id` and required `executor_system`, and preserves nullable conversation/message references for worker-only work
**And** user-facing roster or billing views aggregate initiators only, while operations reporting groups autonomous work by cataloged executor.

**Implementation inventory:** This story changes only `audit_events`, `trip_plan_change_history`, and `ai_usage_events`, their Audit/Usage writers, their direct-write callers, related admin usage aggregation, and their migrations/tests. Executor columns on knowledge and capture artifacts are intentionally owned by Story 8.3.

### Story 8.3: Attribute Knowledge, Capture, and AI Work to System Executors

As an operator,
I want automated knowledge and AI workflows to preserve their human provenance while naming the actual executor,
So that a worker never impersonates the person who submitted or requested work.

**Acceptance Criteria:**

**Given** an operator submits a source and a knowledge worker later triages, extracts, judges, relates, indexes, or recovers it
**When** the worker records side effects, transitions, recommendations, cards, or usage
**Then** those automated records use `system-knowledge-pipeline` as executor while source/job submitter and human requester fields retain the real person
**And** retries and worker-only work never write new side effects as the submitting operator.

**Given** a knowledge card, knowledge source suggestion, automated knowledge recommendation resolution/supersession, source/capture artifact, or indexing record needs execution attribution
**When** Story 8.3 migrates its persistence and writer
**Then** it stores required nonblank cataloged `executor_system` with an index beginning on that column
**And** `created_by_user_id`, `resolved_by_user_id`, `submitted_by_user_id`, and other semantically human fields remain real-user provenance and are nullable only where an automated historical record requires it.

**Given** synchronous authenticated model orchestration records usage or an automated artifact
**When** it writes through the typed boundary
**Then** it records `system-ai-orchestration` as executor and the authenticated person as `initiated_by_user_id` where applicable
**And** no user metric counts autonomous retries or worker-only execution as human activity.

**Given** Facebook or approved YouTube capture creates discovered source material
**When** capture provenance is stored
**Then** the capture uses its corresponding cataloged system executor and preserves the originating real person's `sources.submitted_by_user_id` with source lineage
**And** capture does not create a system user, retain a session-shaped identity, or gain authorization privileges.

### Story 8.4: Attribute Trip Proposal Expiry Through the Audit Boundary

As a Trip Project owner,
I want automatically expired proposals to show their actual system actor,
So that history distinguishes autonomous expiry from actions performed by people.

**Acceptance Criteria:**

**Given** a pending Trip Change Proposal passes its expiry time
**When** a Trip Home/proposal read, application attempt, or scheduled worker invokes `expireTripChangeProposal(...)`
**Then** the idempotent fenced transaction writes exactly one safe terminal history row through the Audit-owned helper with `system-trip-planning` as the actor
**And** expiry never mutates plan state or impersonates the project owner, requester, or authenticated session.

**Given** an owner applies or dismisses a proposal
**When** Chat/Trips records change history
**Then** it uses the same typed AuditActor persistence boundary with the real owner actor
**And** a direct insert into `trip_plan_change_history` from Chat/Trips is unavailable or rejected by enforcement.

### Story 8.5: Remove Fake System Users in the Clean-Break Migration

As a development operator,
I want the disposable database reset and seed to contain only real people,
So that fake system identities cannot reappear through migrations, fixtures, or startup paths.

**Acceptance Criteria:**

**Given** the clean-break migration is prepared while development data remains disposable
**When** reserved-user migrations, seed fixtures, test helpers, and runtime actor APIs are updated or removed
**Then** no code path creates `system-knowledge-pipeline`, `system-trip-planning`, `system-facebook-capture`, or `system-youtube-capture` as a `users` row
**And** deliberate person fixtures remain valid without system-only emails, accounts, sessions, roles, referrals, or ownership records.

**Given** the current development environment is evaluated before migration execution
**When** the clean-break precondition is checked
**Then** the local-only reset guard and daily-reset development-data policy confirm that the target database is disposable
**And** the migration is blocked from non-local or protected databases before any reset occurs.

**Given** a clean development database is reset, migrated, and seeded
**When** seed validation completes
**Then** it contains no non-human `users` row and no `users.id` beginning with `system-`
**And** the resulting schema and seed data support valid user and system audit/executor attribution without backfilling fake-user history.

**Given** durable production or customer data exists before this work ships
**When** implementation readiness is reassessed
**Then** this clean-break migration is stopped before deployment
**And** the team creates an explicit expand-migrate-contract rollout rather than applying the development reset strategy.

### Story 8.6: Verify Actor Isolation and Attribution End to End

As a product owner,
I want automated verification of the new actor model and its migrations,
So that attribution stays correct as Audit, workers, and user-facing reporting evolve.

**Acceptance Criteria:**

**Given** AuditActor validation and persistence tests run
**When** they exercise every allowed and rejected user/system shape
**Then** valid rows satisfy database constraints and invalid/mixed/missing/catalog-invalid shapes fail before or at persistence
**And** the tests prove a system actor cannot authenticate, obtain a user role, own a user-scoped resource, receive a referral, or become a session principal.

**Given** automated knowledge, indexing, capture, recommendation resolution, AI usage, and Trip Proposal expiry flows are tested
**When** they perform a write
**Then** each records its required cataloged executor while preserving a real requester/submitting user only in its semantically human field
**And** no direct feature insert into `audit_events`, `trip_plan_change_history`, or `ai_usage_events` remains permitted.

**Given** a clean database migration and `db:seed` run in verification
**When** repository and data checks inspect reserved IDs, invalid-domain system emails, and seed output
**Then** no fake-user creation/reference path remains outside the documented system catalog and architecture/proposal documentation
**And** verification records the clean database result without relying on legacy backfill behavior.

## Epic 9: Trusted Private API Foundation

Travelers and operators use BFFs that call documented, protected `/v1` APIs with validated principals and safe responses, without exposing browser credentials or relying on Next.js sessions as API authorization.

### Story 9.1: Establish BFF Credentials and API Request Principals

As a traveler or operator,
I want my BFF-authenticated request to become a validated private API principal,
So that API authorization does not trust browser cookies or expose an internal credential to the browser.

**Acceptance Criteria:**

**Given** a web or admin BFF has validated its own host-only Auth.js session
**When** it calls the private API
**Then** it mints an ES256 JWT with its issuer (`xuyenviet-web-bff` or `xuyenviet-admin-bff`), audience `api.railway.internal`, stable user subject, session ID, sorted roles, authorization version, `jti`, `kid`, and a maximum five-minute lifetime
**And** it includes no email, cookie, provider token, or unrestricted claims and never returns the credential to the browser.

**Given** Nest receives a protected request
**When** its resource-server guard creates a `RequestPrincipal`
**Then** it verifies the issuer-specific ES256 key, known `kid`, exact issuer/audience, clock bounds, unique token ID, active unexpired session matching subject/session ID, and current authorization version
**And** invalid signature, claim, session, or authorization-version requests fail through the safe API error envelope without entering a domain use case.

**Given** an active BFF signing key rotates
**When** the API validates credentials during the bounded overlap
**Then** it accepts only the active key and one previous verification-only key for the matching issuer
**And** unknown, expired-overlap, or cross-issuer keys are rejected.

### Story 9.2: Govern Initial Administration and Role Changes

As a deployment operator and administrator,
I want administration to be explicitly bootstrapped and role changes to be auditable,
So that environment configuration, callbacks, and direct data edits cannot silently grant privileges.

**Acceptance Criteria:**

**Given** no active administrator exists and `INITIAL_ADMIN_EMAIL` names an existing authenticated real user
**When** the one-shot deployment bootstrap runs
**Then** it normalizes the email, grants only the `admin` role through the Auth/Admin command, increments that user's authorization version, and writes an audit event
**And** it fails without mutation when an admin already exists, the user is absent, or the command runs again.

**Given** an authenticated administrator changes a user's `operator` or `admin` role
**When** the Auth/Admin domain command commits
**Then** it locks the affected role rows, authorizes the caller, writes an actor-correct audit event, and increments the target user's authorization version in the same transaction
**And** it rejects removal of the last active administrator.

**Given** sign-in callbacks, environment-email matching, or direct database mutation attempt to grant a role
**When** repository and integration checks run
**Then** no such alternative grant path is available
**And** `user_roles` remains the sole authorization authority.

### Story 9.3: Enforce the Private BFF Transport Boundary

As a traveler or operator,
I want protected actions to stay behind the appropriate BFF,
So that browser-originated requests cannot bypass CSRF and API authorization controls.

**Acceptance Criteria:**

**Given** a capability-specific BFF mutation adapter receives a cookie-authenticated web or admin request
**When** it accepts the request
**Then** it applies its CSRF validation, validates and projects input, mints or forwards only a valid BFF credential, and maps the API safe error envelope to the presentation response
**And** it forwards correlation ID, timeout/abort behavior, and `Idempotency-Key` where applicable.

**Given** any browser-originated request reaches the private API directly
**When** it lacks a valid BFF bearer credential
**Then** the API rejects it without interpreting Auth.js cookies or browser session serialization
**And** it emits no CORS allow-origin response.

**Given** protected capability, health/version, and authorization failures are documented
**When** API contract checks run
**Then** protected controllers accept only a normalized `RequestPrincipal` and return the stable `code`, safe `message`, `requestId`, and applicable safe field violations
**And** no controller exposes stack traces, SQL errors, cookies, or token contents.

### Story 9.4: Publish Versioned API Contracts and Migrate a Protected Read

As a traveler or operator,
I want one protected capability to work end to end through a documented API and BFF,
So that the API-first boundary is proven by behavior rather than only by credentials.

**Acceptance Criteria:**

**Given** the API service is deployed
**When** a caller requests `/health/live`, `/health/ready`, `/v1/version`, or the selected protected read capability
**Then** OpenAPI documents the versioned endpoint, validation, authorization, ownership scope, safe errors, and stable list ordering or cursor pagination when applicable
**And** contract tests verify the documented responses and error envelope.

**Given** a traveler or operator opens the selected capability through its BFF
**When** the BFF validates its host-only session and calls the private API
**Then** the browser receives only the presentation response and never an internal credential
**And** a direct browser request is denied without CORS authorization or session interpretation.

**Given** the selected capability is cut over
**When** its migration flag routes a request
**Then** exactly one transport owner accepts the read or command
**And** local contract and routing tests prove no legacy/API dual write or divergent ownership path exists
**And** Epic 14 Story 14.6 owns deployed selected-owner, migration-ordering, rollback, and legacy-retirement evidence.

## Epic 10: Reliable AI Ask API Cutover

Travelers can safely send or retry an AI Ask request without duplicate provider work, duplicate messages, or a stale answer being saved after they alter or delete the selected conversation or Trip Project. Follow-up enrichment continues durably without changing the result of an already completed answer.

### Story 10.1: Make AI Ask Commands Idempotent

As a traveler,
I want retries of the same AI Ask request to be safe,
So that network uncertainty cannot create duplicate turns, provider calls, or assistant answers.

**Acceptance Criteria:**

**Given** an authenticated AI Ask request has a 16-128 character URL-safe ASCII `Idempotency-Key`
**When** AI Orchestration accepts a new command for a conversation or selected Trip Project scope
**Then** it creates `ai_ask_commands` uniquely by user, scope kind, scope ID, and key with the normalized question, attachment metadata, selected scope SHA-256 digest, command status, message references, terminal result, and 24-hour expiry
**And** an unscoped new conversation receives a command-generated scope ID only after command creation.

**Given** the owner retries the same scope/key with an identical normalized digest
**When** the original command is pending
**Then** the API returns persisted conversation/message identifiers and `in_progress` without another provider call
**And** when terminal it returns the persisted terminal result without another user turn, assistant message, provenance, or provider call.

**Given** the same scope/key has a different normalized digest or the key format is invalid
**When** the request is validated
**Then** it returns safe `idempotency_key_reused` or validation failure before persisting a turn or calling a provider
**And** command expiry allows a later request only through a new command/key according to the retention policy.

### Story 10.2: Fence Terminal AI Ask Persistence

As a traveler,
I want an answer to be saved only while its selected planning state is still valid,
So that a deletion or changed Trip Project cannot leave a stale assistant result visible.

**Acceptance Criteria:**

**Given** AI Orchestration creates an AI Ask command
**When** it locks the owner-scoped conversation and selected Trip Project
**Then** it captures the conversation `lifecycle_version` and applicable Trip Project `aggregate_version` on the command before persisting the user turn
**And** conversation deletion, project deletion, project link/primary-conversation changes, and TripAnswerContext-changing aggregate commands increment their relevant fence.

**Given** provider streaming completes
**When** final assistant content, retrieval decision, provenance, usage, and source-bundle snapshot are persisted
**Then** one transaction verifies the captured owner fences and writes all final state only if they still match
**And** partial stream tokens remain transient client state and never imply a completed persisted message.

**Given** a final fence no longer matches
**When** terminalization occurs
**Then** the command becomes `discarded`, emits one safe `error` terminal event with `refresh_required`, and creates no visible assistant message, provenance, successful usage event, annotation, or proposal
**And** the NDJSON sequence remains `preparing`, zero or more `delta`, then exactly one `done` or `error` with request and persisted identifiers where present.

### Story 10.3: Dispatch AI Ask Follow-Up Work Through a Transactional Outbox

As a traveler,
I want post-answer planning work to complete reliably after my answer is saved,
So that temporary worker interruption cannot silently lose context extraction, annotations, or proposal drafting.

**Acceptance Criteria:**

**Given** an originating command commits durable follow-up work
**When** it writes `domain_outbox`
**Then** the same transaction stores versioned event type, aggregate/resource ID, expected owner fence, deterministic dedupe key, safe bounded payload, status, attempts, availability time, lease/fencing state, and safe terminal failure code
**And** duplicate dispatch for the originating command is harmless by the unique dedupe key.

**Given** a worker claims pending outbox work
**When** it processes an event
**Then** it uses `FOR UPDATE SKIP LOCKED`, lease expiry, fencing token, expected version, and compare-and-swap acknowledgement
**And** it validates the expected owner fence before every write, retries with bounded exponential backoff, and records an alertable safe terminal failure after exhaustion.

**Given** an AI Ask user turn, terminal answer, or terminal answer for a Trip Project persists
**When** durable work is enqueued
**Then** context extraction is enqueued only after user-turn persistence, annotation enrichment only after terminal assistant/provenance persistence, and proposal drafting only after terminal assistant persistence
**And** no `after()` callback, fire-and-forget promise, or dead-letter replay bypasses the owning domain command.

### Story 10.4: Preserve Completed AI Ask Results While Consumers Run

As a traveler,
I want a completed answer to remain trustworthy even if its optional follow-up work is delayed or fails,
So that background processing does not rewrite the result I already received.

**Acceptance Criteria:**

**Given** a terminal AI Ask command has completed successfully
**When** context extraction, annotation enrichment, or proposal drafting is delayed, retried, fenced out, or terminally fails
**Then** the command and terminal assistant/provenance/usage result remain completed and unchanged
**And** the owning read model exposes only the relevant pending or safe failed consumer status.

**Given** a follow-up consumer attempts a write
**When** its owner fence, dedupe key, or lease fencing token is stale
**Then** it makes no mutation and records a safe operational outcome
**And** duplicate worker delivery cannot attach duplicate annotations, context updates, or proposals.

**Given** a browser reconnects after an ambiguous stream disconnect
**When** the BFF checks the AI Ask command using the original key
**Then** it reads the persisted command/conversation state rather than creating a new command with a different key
**And** it reconciles the URL-owned server shell with the resulting terminal or in-progress state.

### Story 10.5: Cut AI Ask Streaming to the Versioned API

As a traveler,
I want AI Ask streaming to use the protected API through my BFF,
So that I retain the same responsive chat experience while the domain transport has one reliable owner.

**Acceptance Criteria:**

**Given** an authenticated BFF request has a valid idempotency key
**When** it calls `POST /v1/ai-ask/stream`
**Then** Nest owns the stream and the BFF forwards request correlation ID, timeout, abort, and NDJSON without exposing its credential to the browser
**And** the event sequence is byte-for-byte compatible with `preparing`, zero or more `delta`, then exactly one `done` or `error`.

**Given** the browser aborts, the provider fails, or context-extraction dispatch fails
**When** the command terminalizes
**Then** provider work is stopped when possible and terminal assistant content, provenance, and usage are either persisted atomically or absent
**And** the BFF projects only safe retry or `refresh_required` recovery behavior.

**Given** the API stream passes protocol and integration tests
**When** the AI Ask transport cutover is enabled for a capability scope
**Then** the matching legacy Next.js route/server-action writer no longer accepts that scope
**And** cutover verification proves exactly one transport owner.

## Epic 11: Explainable, Withdrawable Planning Context

Travelers receive answers whose structured Trip Project context and selectable details are traceable and safe over time: the assistant uses the canonical plan state, exposes only validated detail annotations, and removes withdrawn source details from historic answers without revealing stale content.

### Story 11.1: Publish Canonical TripAnswerContext Snapshots

As a traveler,
I want AI Ask to use my confirmed structured trip state ahead of stale chat details,
So that planning answers and proposals are based on the Trip Project I actually control.

**Acceptance Criteria:**

**Given** AI Ask reads an owned selected Trip Project
**When** Chat/Trips produces `TripAnswerContext v1`
**Then** it captures the Trip Project aggregate version, stable anchors, ordered plan items, structured constraints, primary-conversation ID, and bounded current-conversation facts
**And** it includes no raw transcript, provider data, hidden proposal, dynamic/deferred domain data, or another module's mutable aggregate.

**Given** structured state, legacy project fields, project-scoped chat context, and conversation-scoped chat context disagree
**When** the context is assembled
**Then** structured anchors, plan items, and `trip_project_constraints` are canonical, legacy fields are migration-only aliases that cannot override them, and project chat supplements only absent structured fields
**And** a material lower-priority conflict is a typed context entry that allows the answer to ask a concise clarification while proposal drafting uses canonical structured state only.

**Given** a source bundle includes Trip Project context
**When** it is persisted for generation
**Then** it records the context version, aggregate version, ordered included field/item identifiers and versions, typed conflicts, deterministic bounded serialization, selected-but-compacted exclusions with reasons, and final prompt-section SHA-256 digest
**And** provenance, usage, and evaluation reference that immutable source-bundle snapshot.

### Story 11.2: Withdraw Historical Provenance Safely

As a traveler,
I want removed or withdrawn sources to disappear from past answer details,
So that old links, quotes, and derived facts are not presented as still usable.

**Acceptance Criteria:**

**Given** Knowledge removes or withdraws a source or evidence record
**When** its retryable source-removal command commits
**Then** it identifies linked assistant provenance by source, evidence, and card references; marks each row `withdrawn` with timestamp and safe reason; redacts traveler URL, quote, and quick-fact snapshot fields; and invalidates dependent annotations
**And** the transaction is idempotent and audit records only safe identifiers/counts.

**Given** a traveler opens provenance or a detail view for a withdrawn row
**When** the read model renders it
**Then** it returns only a localized unavailable marker with no source URL, quote, derived fact, or executable action
**And** an annotation whose final required provenance row is withdrawn is omitted while an independently valid answer-local annotation remains available.

**Given** historic answers predate the withdrawal contract
**When** source-removal cutover is prepared
**Then** a backfill safely identifies and redacts their provenance before source hiding/deletion is enabled
**And** a source-removal command fails closed rather than deleting evidence if any affected answer cannot be safely identified and redacted.

### Story 11.3: Validate Persisted Answer Annotations

As a traveler,
I want selectable answer details to correspond to real, safe sources or my current planning context,
So that the interface never invents links, source claims, or cross-user details from answer prose.

**Acceptance Criteria:**

**Given** post-answer enrichment creates a descriptor for final persisted assistant text
**When** annotation validation runs
**Then** each range has integer zero-based UTF-16 `{ start, end, text }` values with `0 <= start < end <= content.length`, exclusive `end`, exact `content.slice(start, end)` equality, and no overlap
**And** invalid, stale, duplicate, or text-mismatched descriptors are rejected before persistence and rendering.

**Given** a `source`, `place`, `hotel_area`, `route_segment`, or `cost` descriptor
**When** it is persisted
**Then** it has one or more unique provenance rows owned by the same assistant message, conversation, and user
**And** unknown, cross-message, cross-conversation, cross-user, raw/operator-only, or inferred-source references are rejected.

**Given** a `warning` or `trip_fact` has no provenance reference
**When** validation accepts it
**Then** it represents only answer-local guidance or owner context, contains no source-derived quick fact/action, and is non-navigable
**And** the client renders persisted descriptors only and never parses or re-matches Vietnamese answer prose.

### Story 11.4: Bind Annotation Details and Actions to Current Ownership

As a traveler,
I want source details and planning actions to stay safe after the answer was generated,
So that an old annotation cannot expose withdrawn data or mutate a resource I no longer own.

**Acceptance Criteria:**

**Given** a persisted descriptor exposes detail fields
**When** its safe detail projection is built
**Then** it uses only title, type, location name, route segment, confidence, freshness flag, source type, verification status, checked date, and safe HTTP URL
**And** it supplies at most six trimmed `{ label, value }` quick facts of at most 160 characters each, never arbitrary `source_snapshot` JSON, raw source material, provider payload, or operator-only metadata.

**Given** a descriptor offers an action
**When** its owning read model resolves it for the current user
**Then** the persisted action has a registered command, answer-anchored/safe label, and descriptive arguments only while the server derives the current descriptor-bound executable target and capability set
**And** the command validates typed input, authorization, ownership, and that binding before mutation.

**Given** an action is source-backed or owner-context-only
**When** descriptor validation runs
**Then** source-backed actions require valid provenance and owner-context actions may omit provenance only when their server command derives the target from selected owner-scoped route state
**And** unknown commands, client-derived routes, label-only behavior, arbitrary persisted target IDs, and action resolution after provenance withdrawal are rejected.

### Story 11.5: Serve Planning Context and Details Through the API Cutover

As a traveler,
I want my selected trip context, answer details, and withdrawn-source behavior to remain correct through the API,
So that moving read paths does not expose stale, cross-user, or legacy-derived information.

**Acceptance Criteria:**

**Given** a BFF requests a selected Trip Project context, answer detail, or provenance read model
**When** the API resolves the request principal and ownership scope
**Then** it returns only the owning user's canonical TripAnswerContext, safe detail projection, or localized unavailable marker
**And** its OpenAPI contract documents authorization, ownership, stable errors, and pagination/order where applicable.

**Given** a source is withdrawn or a descriptor is invalidated
**When** a migrated API read is requested
**Then** it applies current availability at read time and never returns withdrawn URL, quote, quick fact, action, raw material, or cross-user data
**And** tests cover historic backfill, ownership denial, and stale descriptor rejection.

**Given** each planning-context read is cut over
**When** its route is enabled in staging
**Then** only the API/BFF path owns that read behavior
**And** the matching legacy transport owner is retired after safe verification.

## Epic 12: Operable Worker and Migration Runtime

Background work runs in a separately deployable, observable, schema-compatible worker runtime so travelers and operators receive reliable outcomes without request-serving processes claiming jobs.

### Story 12.1: Bootstrap the Dedicated Worker and Bounded Sweep Runtime

As a product operator,
I want continuous jobs and scheduled sweeps to run in the correct runtime,
So that background work remains independently supervised and does not rely on request-serving processes.

**Acceptance Criteria:**

**Given** a continuous worker loop or bounded maintenance sweep is configured
**When** it is deployed
**Then** continuous work runs only in the dedicated worker service and scheduled work runs only as an explicit bounded `--once` command
**And** neither path uses in-memory coordination or bypasses PostgreSQL claim, lease, fencing, and idempotency protocols.

**Given** the worker receives startup or shutdown
**When** health endpoints are queried or shutdown begins
**Then** `/health/live` reports process liveness and `/health/ready` verifies assigned configuration, database, and loop readiness
**And** shutdown stops new claims and safely completes or releases in-progress work according to persisted leases.

### Story 12.2: Verify Worker Operations, Telemetry, and Schema Compatibility

As a deployment operator,
I want worker cutovers to have observable and compatible operational behavior,
So that a replacement loop cannot silently lose work or run against an incompatible schema.

**Acceptance Criteria:**

**Given** a worker, API, web, or admin workload starts in staging
**When** it checks the deployed schema version
**Then** it becomes ready only within its declared compatibility range
**And** a non-compatible worker claims no jobs and a non-compatible request workload receives no traffic.

**Given** retries, duplicate pollers, restarts, lease expiry, and graceful shutdown are exercised
**When** operational tests and dashboards run
**Then** telemetry includes correlation ID, capability, principal class, safe result code, latency, job lag, retry, and lease recovery
**And** the replacement loop has a runbook and evidence for stable lag, retry, duplicate-poller, restart, and recovery behavior before its legacy loop is retired.

### Story 12.3: Gate Schema Changes for Overlapping Runtimes

As a release operator,
I want schema changes to be compatible with deployed workload versions,
So that rollout or rollback never destroys durable product data.

**Acceptance Criteria:**

**Given** data is disposable and no runtime overlap exists
**When** a clean-break migration is proposed
**Then** its disposable-target precondition is verified before execution
**And** a durable or protected target fails closed.

**Given** staging/public data is durable or runtimes overlap
**When** a schema change is released
**Then** an approved expand-migrate-contract compatibility matrix and migration-job gate exist before dependent workloads receive traffic
**And** rollback changes traffic or compatible code without destructive schema rollback.

## Epic 13: Separate Operator Application Cutover

Operators use a separately deployed admin application with its own origin and release lifecycle, protected by the same API boundary and without direct database access.

### Story 13.1: Establish the Separately Deployed Admin BFF Application

As an operator,
I want a dedicated admin application that securely reaches protected capabilities,
So that operator releases and access controls are separate from traveler presentation.

**Acceptance Criteria:**

**Given** the admin application is deployed to staging
**When** an operator signs in through its host-only session
**Then** it uses the admin BFF issuer and private API connectivity with no browser credential or database credential
**And** its independent build, release, health, OAuth callback, and least-privilege configuration are documented.

**Given** a normal traveler accesses the admin application or API capability
**When** authorization is evaluated
**Then** the request is denied server-side without disclosing protected data or navigation
**And** the same API authorization matrix governs the admin BFF and controllers.

### Story 13.2: Migrate Operator Capabilities and Retire Legacy Admin Ownership

As an operator,
I want knowledge and operational workflows to remain available through the separate admin application,
So that legacy `/admin` no longer owns domain transport or mutations.

**Acceptance Criteria:**

**Given** an operator capability is selected for migration
**When** its API contract, authorization, BFF adaptation, and safe error handling are verified
**Then** the separate admin application provides the capability without importing domain mutation code or using direct database access
**And** staging tests prove ownership scope, role enforcement, private networking, and safe responses.

**Given** a migrated operator capability is enabled
**When** requests are routed
**Then** exactly one transport owner accepts its command or read
**And** the matching legacy `/admin` route/server-action owner is retired rather than dual-written.

## Epic 14: Direct API Consolidation and Legacy Retirement

Traveler web and the separate admin application become presentation-only clients of a direct NestJS API. NestJS owns Google OAuth, opaque browser sessions, CSRF, request-principal construction, and every migrated domain transport; Auth.js, BFF transport, root direct database owners, and legacy admin routes are removed only after their replacement is live.

**FRs covered:** FR-51, FR-52, FR-53, FR-54, FR-55, FR-56, FR-58, FR-59, FR-60. **NFRs covered:** NFR-12, NFR-13, NFR-14, NFR-15, NFR-16, NFR-17, NFR-18. **Architecture requirements covered:** ADR-33, ADR-33-1.

**Historical boundary:** Completed Epics 9-13 prove internal API, Worker, and separate-admin foundations. Their BFF/Auth.js transport decisions are superseded by the approved 2026-08-03 direct API course correction and are not direct-browser implementation evidence.

### Story 14.1: Establish NestJS Google OAuth, Opaque Browser Sessions, and Direct API Admission

As a traveler or operator,
I want NestJS to manage my Google sign-in and long-lived secure browser session,
So that web and PWA clients can call protected APIs directly without Auth.js or a BFF.

**Acceptance Criteria:**

**Given** an unauthenticated traveler or authorized operator starts Google sign-in through NestJS
**When** Google returns a valid callback bound to a non-expired, one-time OAuth transaction
**Then** NestJS resolves or creates the real user/account, creates one opaque PostgreSQL session, sets only a secure HttpOnly session cookie, and redirects to an allowlisted application URL
**And** the response exposes no provider token, cookie value, session ID, BFF credential, signing material, or internal error detail.

**Given** a direct browser request reaches a protected `/v1` capability
**When** its session cookie identifies a live non-revoked session whose user authorization version and roles are current
**Then** NestJS creates the existing domain-neutral `RequestPrincipal` before the controller/use case runs
**And** expired, revoked, missing, stale, malformed, cross-origin, or unauthorized requests fail through the safe API envelope without entering domain logic.

**Given** a valid active browser session has less than seven days before expiry
**When** it reaches an admitted protected API request
**Then** NestJS renews its opaque session to a 30-day expiry and refreshes only its secure HttpOnly cookie
**And** a logout revokes the server-side session and clears the cookie, while role change or account invalidation makes prior authorization state unusable.

**Given** a browser invokes a state-changing `/v1` request
**When** its Origin and CSRF admission are evaluated
**Then** NestJS accepts only explicit configured browser origins with a valid session-bound CSRF proof
**And** credentialed CORS never uses a wildcard or exposes session/auth internals.

**Given** the direct-auth cutover is released
**When** a user has only a legacy Auth.js session
**Then** the session is not adopted and the user safely authenticates once through NestJS
**And** no new Auth.js session is created after the NestJS flow is enabled.

### Story 14.2: Cut AI Ask and Traveler Shell Reads to Direct API

As a traveler,
I want the planning shell and AI Ask stream to call NestJS directly,
So that their browser transport has one owner without BFF forwarding or legacy fallback.

### Story 14.3: Move Traveler Commands and Remove Root Domain Writers

As a traveler,
I want trip, conversation, proposal, feedback, and referral commands served by one API owner,
So that no Next.js server action or direct database path can duplicate product state.

### Story 14.4: Complete Admin Direct API Ownership

As an operator,
I want all operational workflows in the separate admin application through direct protected APIs,
So that root `/admin` no longer owns a domain read or mutation.

### Story 14.5: Retire Auth.js, BFF Runtime, and Legacy Transport

As a release operator,
I want an inventory-backed removal of obsolete Auth.js/BFF and root backend code,
So that no unsupported ownership path survives the consolidation.

### Story 14.6: Produce the Direct API Launch Evidence Gate

As a product owner,
I want direct API deployment, one-writer, OAuth/session, rollback, Worker, and operations evidence to be explicit,
So that public readiness is based on proof rather than completed-story counts.

## Epic 15: Trustworthy Knowledge Lifecycle Cutover

Operators can safely manage evidence-grounded community knowledge through one unambiguous lifecycle, while travelers retrieve only active cards that retain eligible support and the Worker/API each retain their correct responsibilities.

### Story 15.1: Establish the Target Lifecycle Schema

As a knowledge operator,
I want all persisted Knowledge records to use one target lifecycle contract,
So that contradictory legacy state combinations cannot exist.

**Acceptance Criteria:**

**Given** the current development target is disposable
**When** the lifecycle migration is applied and the database is reset/reseeded
**Then** legacy lifecycle fields are replaced with target-only card lifecycle, classification, verification, job, candidate, recommendation, and sampling-obligation fields
**And** no backfill, dual-write, compatibility runtime path, or legacy fixture remains.

**Given** target schema writes occur
**When** card, candidate, and recommendation data is persisted
**Then** database checks enforce lifecycle/retrieval rules and candidate disposition/reason nullability
**And** partial unique indexes permit at most one open primary item and one open sampling item for a card content/evidence fence.

**Given** a candidate has completed
**When** any write attempts to alter its AI disposition or reason
**Then** a database trigger rejects the write
**And** failed candidates cannot persist a business disposition or reason.

**Given** API/domain contracts, seeds, and fixtures are loaded
**When** they represent Knowledge data
**Then** they use the target shape only
**And** Drizzle schema validation and migration checks pass.

### Story 15.2: Complete Candidate Processing and Technical Job Accounting

As an operator,
I want ingestion jobs to report technical progress and candidate outcomes accurately,
So that mixed candidate outcomes do not misrepresent a source's processing state.

**Acceptance Criteria:**

**Given** a Worker discovers candidates from an immutable capture
**When** candidate processing reaches a terminal outcome
**Then** completed candidates persist an immutable non-null `apply`, `needs_operator`, or `discard` disposition and reason
**And** failed candidates persist no business disposition or reason.

**Given** discovery has not terminalized or any persisted candidate remains queued/processing
**When** the job attempts to become `completed`
**Then** the transition is rejected
**And** its technical status remains non-terminal.

**Given** discovery is terminal and every candidate is completed or failed
**When** the Worker completes the job under its existing lease/fence protocol
**Then** it records only `completed` technical status
**And** `candidateCount`, `completedCandidateCount`, `failedCandidateCount`, and `needsOperatorCandidateCount` match transactional idempotent projections.

**Given** retry, duplicate delivery, or a newer capture occurs
**When** stale work attempts a candidate/job mutation
**Then** existing lease, fencing, and version checks reject it
**And** no active card or candidate outcome is changed by obsolete work.

### Story 15.3: Centralize Version-Fenced Lifecycle Transitions

As an operator,
I want valid lifecycle decisions to apply atomically through one command,
So that card state, actionable work, audits, and search eligibility never diverge.

**Acceptance Criteria:**

**Given** a Worker, API operator command, source-removal command, or sampling containment needs a lifecycle mutation
**When** it invokes `transitionKnowledgeCard` with trigger, actor, expected fences, and transaction
**Then** the command locks the required rows and returns typed `resolved`, `stale`, or `invalid` results
**And** no production code directly writes card lifecycle, verification requirement, or recommendation lifecycle state outside this boundary.

**Given** a low-risk candidate completes with eligible supporting evidence
**When** the command resolves the transition
**Then** the card becomes `active` with verification requirement `none`
**And** it writes required audit/index-dirty effects atomically.

**Given** a verify-first candidate, conflict, or new evidence for a suppressed card requires operator action
**When** the command resolves the transition
**Then** the card becomes `pending_operator`
**And** exactly one same-fence primary recommendation is open with the appropriate type.

**Given** an operator publishes, suppresses, edits/requeues, archives, or restores a card
**When** the command performs the transition
**Then** it follows the approved transition matrix, supersedes/resolves work correctly, and applies required version fences
**And** a stale or superseded item cannot mutate a card, evidence, audit event, dirty marker, or search projection.

### Story 15.4: Enforce Evidence-Safe Retrieval and Source Removal

As a traveler,
I want only supported current knowledge used in answers,
So that withdrawn or unsupported facts cannot remain available through stale projections.

**Acceptance Criteria:**

**Given** a card is considered for activation or retrieval
**When** its active supporting evidence lacks validated span, source/capture eligibility, or required retrieval metadata
**Then** the card cannot become or remain traveler-retrievable
**And** retrieval fails closed even if an old search document exists.

**Given** a card loses its final eligible active supporting evidence
**When** evidence is removed, invalidated, or its source becomes ineligible
**Then** the lifecycle command atomically disables its projection and transitions it according to the matrix
**And** pending follow-up work exists only where the selected target state permits it.

**Given** a source is withdrawn, inaccessible, or subject to removal
**When** the retryable source-removal command runs
**Then** it locks dependent evidence/cards, removes traveler eligibility immediately, and re-evaluates every affected card
**And** it completes only after no removed evidence remains traveler eligible.

**Given** the indexing Worker processes dirty records
**When** it rebuilds or disables a projection
**Then** it remains idempotent by card/version
**And** indexing delay cannot re-enable prohibited content.

### Story 15.5: Separate Actionable Work from Quality Sampling

As a knowledge operator,
I want review work and quality-control obligations modeled separately,
So that sampling measures quality without becoming an accidental publication gate.

**Acceptance Criteria:**

**Given** a completed candidate has `needs_operator` disposition
**When** its lifecycle transition is committed
**Then** exactly one immutable sampling-obligation record is created
**And** that obligation is not an actionable recommendation and does not block later publication.

**Given** an active card version is selected for quality review
**When** sampling work opens
**Then** it is one fenced `sampling` recommendation for that active version
**And** it cannot coexist with prohibited primary work or alter the candidate's original AI disposition.

**Given** a high-severity sampling failure is identified
**When** containment begins
**Then** the exact policy cohort definition and affected card/version membership are persisted before any lifecycle mutation
**And** each remediable card moves to `pending_operator` with one fenced `risk` item, while unsafe cards are suppressed/de-indexed without successor work.

**Given** sampling containment affects a cohort
**When** it completes
**Then** unrelated cohorts and card versions remain unchanged
**And** all resolutions, supersessions, audits, and projections are atomic and version-fenced.

### Story 15.6: Deliver Target-Shaped Operator Knowledge Views

As an operator,
I want clear Knowledge API responses and admin screens,
So that I can diagnose ingestion and resolve work without conflating technical processing with fact workflow.

**Acceptance Criteria:**

**Given** an authorized operator reads `/v1/admin/knowledge/*`
**When** the API serializes jobs, candidates, cards, and work
**Then** it exposes technical job status/counters, candidate processing/disposition/reason, card lifecycle/classification/verification, and work type/status/resolution as separate fields
**And** it does not expose raw capture text, raw provider output, unapproved quotes, checkpoints, fence values, credentials, or other execution secrets.

**Given** a browser operator uses `apps/admin`
**When** it renders review, ingestion, or sampling information and submits a resolution
**Then** it calls documented direct NestJS APIs with existing credential/CSRF/safe-error behavior
**And** it does not import database code, domain lifecycle commands, or add a BFF/server proxy.

**Given** an ingestion job has mixed candidate results
**When** the operator views it
**Then** the UI presents its technical status and safe aggregate/candidate outcomes without a rolled-up publication label
**And** candidate outcomes remain intelligible independently of later operator decisions.

### Story 15.7: Prove the Lifecycle Transition Matrix

As a product owner,
I want executable evidence that the lifecycle contract rejects invalid states and races,
So that the clean-break migration remains safe as the pipeline evolves.

**Acceptance Criteria:**

**Given** the target schema and command boundary exist
**When** unit and serial integration suites run
**Then** they cover every allowed and forbidden transition in the lifecycle matrix
**And** they prove card/work cardinality, candidate immutability, technical job completion, active-evidence eligibility, and target-only fixture validity.

**Given** stale, concurrent, duplicate, superseded, source-withdrawal, and sampling-containment scenarios
**When** tests exercise them
**Then** only valid same-fence transitions persist
**And** card, evidence, audit, recommendation, and index effects are atomic or absent together.

**Given** protected API and direct-admin integration paths
**When** authorization and contract tests run
**Then** only authorized principals can resolve operator work
**And** Worker-only ingestion/job claim behavior cannot execute in an API request.

**Given** the epic is complete
**When** verification runs
**Then** focused tests, `pnpm test:unit`, `pnpm test:integration`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm exec drizzle-kit check` are run
**And** any environmental blocker is recorded exactly in the implementation artifact.
