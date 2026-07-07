# Epic 3 Context: Chat Sessions And Trip Projects

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 3 lets travelers organize planning across separate chat sessions and durable trip projects, reuse relevant context within each scope, correct trip details through normal chat, see a clear storage notice, and delete chats or trip projects they own. It makes personalization understandable and gives users explicit data control, mirroring familiar chat-product session and project models while preventing global memory bloat and overcollection of sensitive data.

## Stories

- Story 3.1: Manage Chat Sessions
- Story 3.2: Create Trip Projects
- Story 3.3: Extract Chat And Trip Context
- Story 3.4: Use Chat Or Trip Context In Answers
- Story 3.5: Correct Trip Details Through Chat
- Story 3.6: Delete Chat Sessions
- Story 3.7: Delete Trip Projects

## Requirements & Constraints

- Chat sessions and trip projects are owned by the authenticated user. Server-side checks deny access to non-owners and expose no data.
- Traveler and trip details are extracted automatically from chat: adults, children, children's ages when known, dates, duration, destination, preferences, prior trips, avoided/repeated places, budget range, hotel style, driving tolerance, vehicle/EV needs, food/activity preferences, and itinerary constraints.
- Allowed chat/trip context fields are fixed; the Chat/Trips module validates allowed travel-planning fields before persistence and rejects clearly disallowed sensitive data. Child data is limited to travel-relevant facts (age range, comfort needs, preferences); no full names. No sensitive personal data beyond trip personalization is stored.
- Chat-session context and trip-project context are distinct. With no project selected, extracted details stay chat-scoped and do not auto-promote to project context. With a project selected, durable trip-planning details may update project context while temporary chat details can remain chat-scoped.
- When a trip project is selected, project context has priority over chat-session context; on conflict, prefer project context or ask a concise clarification.
- Users can correct trip details via normal chat messages. Ambiguous corrections trigger a concise clarification rather than overwriting context with uncertain facts. Chat-only corrections must not change a trip project unless the user is working inside it or clearly asks to update it.
- Users must see a clear notice that chat and trip details may be stored to support the current session or trip project, shown before or at first meaningful AI Ask.
- Users can delete chat sessions and trip projects they own. Deletion removes or disables the session/project, its messages, extracted context, and derived embeddings from normal UI and retrieval use. Minimal non-content audit metadata may be retained for operational integrity but must not reappear in user-facing or retrieval paths.
- Chat sessions and trip projects must be preserved securely and only for authenticated users.

## Technical Decisions

- Chat/Trips is the owning command module for conversations, messages, trip projects, chat context, chat/trip context embeddings, and user-owned chat/trip deletion. One owning command module per mutable aggregate; no generic cross-module upserts/deletes for another module's aggregate.
- Persisted entities for this epic: `trip_projects`, `conversations`, `messages`, `chat_context`, `context_embeddings`. `assistant_response_provenance` rows may reference chat/trip context as a source category.
- AI extraction proposes context updates; the Chat/Trips module validates allowed fields before persistence and rejects disallowed sensitive data. Extraction is a proposal layer, not a direct write.
- Deletion is a user-owned operation. New tables that store chat/project-derived retrievable content must define what happens when the owning chat or trip project is deleted before migration approval.
- Multimodal AI Ask images are owned by the conversation/chat session or selected trip project context that accepted them; their deletion follows the owning chat/trip deletion contract.
- Answer context priority order (top two tiers owned here, later tiers owned by retrieval epic): selected trip project context, current chat session context, approved knowledge, web search fallback, general reasoning.
- All protected mutations run server-side and record audit context (actor, target, operation, timestamp, before/after summary where appropriate).
- pgvector stores context embeddings linked to first-class product rows; external vector stores must not become hidden source-of-truth. Retrieval joins embeddings back to current owner rows, filters current owner status, and disables/stales old embeddings when retrievable text or owner status changes.

## UX & Interaction Patterns

- Vietnamese-first, responsive web (not native). Chat sessions surface in an AI Ask sidebar/sheet; trip projects surface via app nav and a chat context selector. A trip project detail view shows trip context, linked chats, and correction/delete affordances.
- A trip context selector shows whether the user is in ordinary chat or a selected trip project; switching project visibly changes context priority.
- Context corrections produce a small confirmation-style note when useful (e.g., `Mình đã cập nhật: con 8 tuổi.`).
- Deletion is a sober, explicit destructive flow with confirmation; no swipe-to-delete on web MVP. Confirmation copy names what will be removed/disabled from normal UI and retrieval; on server failure the item remains visible with a retry path and no false "deleted" claim.
- Sensitive-data exclusions are not a UX afterthought: when extraction appears to capture disallowed sensitive data, do not display it as remembered trip context.
- Responsive behavior: desktop shows persistent nav/session list and an optional right panel for trip context; mobile uses sheets for navigation, sessions, and trip context; composer stays reachable.
- Open question affecting Story 3.7: linked project chat delete-vs-detach behavior and the user-facing deletion copy must be decided during story validation.

## Cross-Story Dependencies

- Depends on Epic 1: authenticated Google user, server-side session resolution, role checks, shared audited-mutation helper, and environment separation.
- Depends on Epic 2: conversation and message persistence model, AI Ask chat shell, and the streaming answer flow.
- Story 3.4's context priority contract is consumed by the retrieval orchestrator in the grounding epic; chat/trip context are the top two priority tiers of the answer pipeline.
- Stories 3.6/3.7 deletion contracts must be honored by any later table that stores chat/project-derived retrievable content (deletion behavior defined before migration approval).
- Story 3.7 linked-chat delete-vs-detach behavior is an open question affecting UX copy and implementation; resolve before implementation.
