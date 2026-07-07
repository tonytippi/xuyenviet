# Epic 2 Context: AI Ask Conversation Experience

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 2 delivers the first usable AI Ask conversation loop for authenticated travelers: a Vietnamese-first chat surface where users can ask broad Vietnam road-trip planning questions, receive useful initial guidance without completing a form, refine the answer across messages, and recover from loading or provider failures. This epic makes the product's public MVP value visible while establishing the conversation, message persistence, AI generation, answer-structure, usage-placeholder, and testing foundations that later chat/trip context, retrieval, provenance, and feedback work will build on.

## Stories

- Story 2.0: Introduce Test Framework And Retroactive Coverage For Epic 1 Protected Paths
- Story 2.1: Authenticated AI Ask Chat Shell
- Story 2.2: Create Conversation And Send First Message
- Story 2.3: Generate Vietnamese Initial AI Answer
- Story 2.4: Structured Road-Trip Answer Format
- Story 2.5: Continue Conversation With Context
- Story 2.6: Basic Chat Responsiveness And Failure States

## Requirements & Constraints

- AI Ask is only available to authenticated Google users. Unauthenticated access must redirect or block before loading chat data, creating conversations/messages, or calling an AI provider.
- The chat interface and assistant output are Vietnamese-first. User questions may be broad or underspecified, and the assistant should provide useful initial road-trip guidance before asking for more details.
- When important planning details are missing, answers should ask only a few concise follow-up questions and still include an initial plan or direction.
- Answers must support iterative refinement across a conversation by loading prior messages for the owner and considering recent conversation context.
- Conversation and message data belongs to the authenticated user. Server-side checks must deny access to another user's conversation and avoid exposing message history.
- Empty or invalid messages must be rejected with clear validation and must not create conversations, messages, or AI calls.
- AI provider failures must produce a safe recoverable UI state, preserve or allow retry of the user's draft/request, and must not create misleading assistant messages.
- AI answers should include practical sections when relevant: suggested plan/options, rationale, practical tips, warnings, source/confidence placeholder support, uncertainty notes, and next steps. Source/provenance details are not fully implemented in this epic, so answers must not invent fake citations or source labels.
- Authenticated AI answer attempts in this epic must record at least a minimal durable usage event or placeholder with user, conversation/message context when available, purpose, provider/model when known, timestamp, and success/failure status so later usage instrumentation can be standardized without missing historical AI calls.
- User-facing chat should feel responsive enough for interactive planning. The architecture seed target is first visible answer within 5 seconds without web search and within 10 seconds with web search, but Epic 2 should not introduce web search as an MVP dependency.
- Story 2.0 must establish a test framework and cover Epic 1 protected paths before AI generation work depends on those gates.

## Technical Decisions

- The app remains a root-level Next.js App Router modular monolith in TypeScript. Use server-side feature entrypoints, route handlers, and server actions for protected mutations instead of client-side writes.
- PostgreSQL is the owned data plane for users, sessions, conversations, messages, usage events, provenance, and later retrieval state. Drizzle owns schema definitions, migrations, and typed data access.
- Feature ownership stays explicit. Chat/Trips owns conversations and messages; AI Orchestration owns model-call flow and assistant response handling; Usage owns append-only AI usage events; Audit owns audit events where protected mutations require them.
- Direct OpenAI calls are prohibited. Chat generation must go through the OpenAI-compatible AI Gateway adapter configured by environment, with every model call declaring purpose, model, prompt version, input source bundle, and output expectations where applicable.
- AI provider adapter calls should return or emit usage metadata when available, including model, token counts, provider request ID when available, latency, and failure status. Usage persistence must not become the source of truth for chat content or answer provenance.
- Assistant message persistence must be the durable source of truth for what the UI displays. Client-only answer state must not replace saved assistant messages.
- The fixed context-priority pipeline for later epics is selected trip project context, current chat session context, approved knowledge, web search fallback, then general reasoning. Epic 2 can use current conversation history/general reasoning, but should leave seams for the full orchestrator and source-bundle model.
- Streaming is allowed only after context/provenance inputs are assembled. For Epic 2, avoid streaming designs that would later prevent source/confidence and usage/provenance records from being stored consistently with assistant messages.
- Test setup must use a test database separate from dev and production, run Drizzle migrations against it, and avoid real OAuth or provider credentials.

## UX & Interaction Patterns

- AI Ask should have a clear empty state inviting a Vietnam road-trip question and example prompts. The visual language should feel like a practical Vietnamese road companion: calm, trustworthy, readable, and not a generic global chatbot.
- Desktop uses visible app navigation with the chat centered; mobile uses a top bar and sheet navigation with the chat composer pinned near the bottom. Chat content must remain readable on desktop and mobile.
- The composer accepts Vietnamese free text. Empty or invalid submissions are blocked client-side and server-side. Submit is disabled or safely guarded while sending, except for explicit retry flows.
- Pending and long-running states should communicate progress without implying completion, using calm Vietnamese copy such as checking context and suitable sources.
- Assistant answers should render as scannable blocks with spacing between major sections. Warnings and next steps should be easier to find than raw metadata. Maximum reading width for chat answer content is 760px.
- Follow-up questions appear as 1-3 concise questions in the answer footer. Tappable suggestions may prefill the composer, but the user can edit before sending.
- Source/confidence UI should be progressively disclosed via compact chips or placeholder sections where relevant, but Epic 2 must avoid fake provenance. Long URLs and detailed provenance should not be embedded after every paragraph.
- Storage notice behavior belongs primarily to later chat/trip context work, but the AI Ask surface should be compatible with a low-friction inline notice near first meaningful use.
- Accessibility floor: keyboard reachable controls, readable Vietnamese diacritics at 200% zoom and mobile widths, at least 44px mobile touch targets, polite `aria-live` announcements for pending/completed/error chat states, and color never being the only source/confidence indicator.

## Cross-Story Dependencies

- Story 2.0 must complete before Story 2.2 because conversation creation and authenticated submission paths depend on verified auth gates, admin role behavior, audited mutation wrapper behavior, and environment guard tests.
- Story 2.1 depends on Epic 1 authenticated route gating and provides the UI shell that Stories 2.2 through 2.6 extend.
- Story 2.2 creates the owned conversation/message persistence path required by Stories 2.3, 2.5, and 2.6.
- Story 2.3 depends on Story 2.2 for persisted user messages and introduces AI generation plus minimal usage recording.
- Story 2.4 depends on generated assistant content from Story 2.3 and establishes the answer-format contract that later Epic 5 provenance/source display will fill in.
- Story 2.5 depends on persisted conversation history from Story 2.2 and assistant messages from Story 2.3.
- Story 2.6 depends on the send/generate/persist loop from Stories 2.2 and 2.3 and must ensure the UI displays persisted assistant messages rather than transient client-only output.
