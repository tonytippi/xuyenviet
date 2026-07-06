# Epic 2 Context: AI Ask Conversation Experience

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 2 delivers the core traveler conversation loop: an authenticated Vietnamese AI Ask chat shell where a traveler can ask broad road-trip planning questions, get useful structured Vietnamese answers with concise follow-ups when details are missing, and refine the plan across a multi-message conversation. It also inserts Story 2.0, a test-framework lead-in that retroactively covers Epic 1 protected paths (auth gate, roles, audit, env guards) so Epic 2 features rest on verified foundations and closes the env-guard test debt carried from Epic 1. Epic 2 ships answers using chat-session context plus general reasoning only; retrieval, web search fallback, trip-project context priority, and full source/provenance display arrive in later epics.

## Stories

- Story 2.0: Introduce Test Framework And Retroactive Coverage For Epic 1 Protected Paths
- Story 2.1: Authenticated AI Ask Chat Shell
- Story 2.2: Create Conversation And Send First Message
- Story 2.3: Generate Vietnamese Initial AI Answer
- Story 2.4: Structured Road-Trip Answer Format
- Story 2.5: Continue Conversation With Context
- Story 2.6: Basic Chat Responsiveness And Failure States

## Requirements & Constraints

AI Ask is Vietnamese-first and available only to authenticated Google users; unauthenticated attempts to open AI Ask or submit a question must not create a conversation, message, chat/trip context, retrieval work, or AI provider call. The chat shell must present a clear empty state inviting a Vietnam road-trip question.

Users must be able to ask broad, underspecified planning questions and receive useful initial guidance without first completing a long form. When important planning details are missing, the answer includes a small number of concise follow-up questions while still providing an initial plan. Responses are Vietnamese by default.

Assistant answers must be structured into practical sections that appear only when relevant: suggested plan/options, rationale, practical tips, warnings, sources, uncertainty notes, and next steps. The format must reserve a source/confidence section contract for later integration without inventing fake citations or source labels. Outside the Hanoi-to-HCMC focus, the assistant may give general guidance but must not overclaim curated coverage.

Conversations and messages are owned by the authenticated user; cross-user access is denied server-side with no messages exposed. Empty or invalid submission is rejected with a clear validation message and creates no conversation or AI call. AI provider failure must show a safe error state, keep the user's draft for retry, and must not create a misleading assistant message. The displayed answer must match the persisted assistant message; no client-only answer state becomes the source of truth.

Chat must feel responsive: first visible answer within 5 seconds without web search and within 10 seconds with web search, and streaming must not start before the orchestrator knows which source categories were used. The first AI answer generation in this epic must record at least a minimal AI usage event (or durable placeholder) with user ID, conversation/message context when available, purpose, provider/model when known, timestamp, and success/failure status, so later usage instrumentation can enrich metadata without retrofitting historical calls.

Story 2.0 requires a server-side test framework (Vitest or equivalent) with a test database separate from dev/production, Drizzle migrations run against the test database, and `pnpm test` runnable without real OAuth credentials or external providers. Retroactive coverage must verify Epic 1 auth-gate, role-protected admin, audited mutation commit semantics, and env-guard fail-closed behavior on placeholder/localhost/missing secrets. Shipping Story 2.0 closes the deferred-work env-guard test debt entry.

## Technical Decisions

The MVP is a root-level Next.js App Router TypeScript modular monolith. PostgreSQL plus pgvector is the owned data plane; Drizzle owns schema and migrations. Feature ownership is explicit: Chat/Trips owns conversations, messages, chat/trip context, chat/trip embeddings, and user-owned deletion; AI Orchestration owns assistant response provenance; Usage owns append-only AI usage events. Non-owning modules must not perform generic cross-module upserts or deletes for aggregates they do not own.

AI Ask routes and actions require an authenticated session inherited from Epic 1. Conversations and messages are persisted with owner, timestamp, and conversation ID; cross-user reads are rejected server-side.

All model calls go through the OpenAI-compatible AI Gateway adapter (`AI_GATEWAY_BASE_URL`, `AI_GATEWAY_API_KEY` per environment); direct OpenAI API calls are forbidden. Every call declares purpose, model, prompt version, and output schema expectation, and the adapter returns usage metadata (model, token counts, latency, failure status).

Answer provenance is persisted row-per-source-item in `assistant_response_provenance` and rendered from stored provenance, not by re-parsing answer text. The orchestrator persists the assistant message and provenance in the same transaction. In Epic 2 this contract is reserved; the source bundle is general reasoning plus current chat history, and Epic 5 later fills knowledge/web/chat-trip provenance categories.

The fixed context priority pipeline is selected trip project context, current chat session context, approved knowledge, web search fallback, then general reasoning. Epic 2 only uses current chat-session context plus general reasoning; trip-project context priority, approved-knowledge retrieval, and web search fallback are deferred to Epics 3 and 5. AI usage events are operational/accounting telemetry, not a credit ledger, storing user ID, context refs, purpose, provider/model, timestamp, latency, and success/failure status.

The test framework uses a dedicated test database isolated from dev and production. Integration tests must exercise real Drizzle migrations and server-side auth/role/audit/env behavior without hitting external OAuth or AI providers.

## UX & Interaction Patterns

AI Ask is the primary app nav after auth and is Vietnamese-first. The chat composer accepts Vietnamese free text; empty or invalid submission is blocked client-side and server-side. Submit is disabled while sending unless retrying a failed draft. `Enter` submits, `Shift+Enter` inserts a newline, `/` focuses the composer on desktop, `Esc` closes the topmost sheet/drawer/dialog.

The first AI Ask empty state invites a road-trip question with example prompts such as `Bạn đang muốn đi đâu? Ví dụ: Hà Nội đi Đà Nẵng 7 ngày cùng gia đình.` A low-friction storage notice appears near first AI Ask use explaining chat/trip details may be stored; it must not block asking.

Assistant answers render as scannable blocks: suggested plan/options, rationale, practical tips, warnings, sources, uncertainty, next steps. Sections appear only when relevant; warnings and next steps are easier to find than raw source metadata. Follow-up questions sit in the answer footer as 1-3 concise items; tappable suggestions may prefill the composer and the user can edit before sending. Source chips and the source detail drawer are reserved contracts for Epic 5; Epic 2 must not populate fake citations.

States: pending state while the answer is prepared, composer guarded against duplicate submit, progress copy after delay (`Mình đang kiểm tra ngữ cảnh và nguồn phù hợp...`) without implying completion, and on AI provider failure the user draft remains visible as a retryable draft with no assistant message created. Generated answer text is not editable by the traveler; corrections are made by sending another message.

Visual contract: Route Green for primary actions, Guide Amber for suggested next question and recommended follow-up (never warnings), Warning Red reserved for failure states. Chat answer max reading width 760px with 20px section gap. Accessibility floor: WCAG 2.2 AA, keyboard-reachable controls, 44px mobile touch targets, legible Vietnamese diacritics at 200% zoom, polite `aria-live` regions for state changes, reduced motion for non-essential transitions.

## Cross-Story Dependencies

Story 2.0 (test framework plus retroactive Epic 1 coverage) must complete before Story 2.2 and may run in parallel with Story 2.1. Shipping it closes the deferred-work env-guard test debt entry carried from Epic 1.

Story 2.1 depends on Epic 1's AI Ask auth gate (Story 1.2) and Google session resolution (Story 1.3) to render the authenticated chat shell. Story 2.2 depends on Story 2.0 (test framework) and Story 2.1 (chat shell) to persist the first conversation and message.

Story 2.3 depends on Story 2.2 for conversation/message persistence and on the AI Gateway adapter to generate the initial Vietnamese answer; its minimal usage event enables Story 5.9 to enrich usage metadata later without retrofitting historical AI calls. Story 2.4 depends on Story 2.3 and reserves the source/confidence section contract for Epic 5 integration.

Story 2.5 depends on Story 2.2 and Story 2.3 to reload prior messages and continue the thread. Full chat/trip context reuse, trip-project context priority, and chat-based trip-detail correction arrive in Epic 3; Epic 2 only reuses conversation message history. Story 2.6 depends on Story 2.3 and Story 2.5 to define pending, progress, and failure states consistently.
