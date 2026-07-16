# Epic 7 Context: Traveler Workspace UX Convergence

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Deliver a calm, trustworthy, responsive traveler workspace around existing AI Ask behavior: a focused public entry, a centered authenticated empty state, and an active white/stone planning workspace with owned history/projects, compact composition, readable answers, and contextual detail inspection. This brownfield convergence must make existing authentication, ownership, URL selection, streaming, provenance, and deletion behavior understandable across desktop and mobile without introducing new backend aggregates, alternate data loaders, map integration, or free-text entity inference.

## Stories

- Story 7.1: Establish the Traveler UI Foundation
- Story 7.2: Deliver the Focused Public Entry
- Story 7.3: Deliver the Authenticated Desktop Shell
- Story 7.4: Keep Workspace Selection Canonical Across Devices
- Story 7.5: Refine the AI Ask Composer and Streaming Feedback
- Story 7.6: Present Scannable Answer Content
- Story 7.7: Inspect Persisted Answer Details Responsively

## Requirements & Constraints

- Present three canonical states: public `/` with a Vietnamese-first, sign-in-gated entry and no authenticated data; authenticated empty `/ai-ask` with sidebar, centered greeting/composer, four icon-led starters, and no inspector; active AI Ask with a conditional inspector only after supported detail selection.
- Preserve protected behavior: public prompting must enter the existing sign-in flow before any conversation, retrieval, usage event, persistence, or provider call. Referral attribution remains silent, with no rewards, credits, ranking, payout, or points UI. Admin entry appears only when server-authorized.
- Keep chat/trip ownership, selection, storage, and deletion semantics unchanged. Show a non-blocking first-use storage notice with the approved Vietnamese copy and privacy link. Destructive confirmations must name the affected chat/project and explain removal from normal UI and retrieval; a project deletion includes linked chats and stored context.
- Keep the composer compact when idle: prompt input plus icon-only attachment when supported and send controls. Show file preview, validation, and recovery guidance only when contextual. Invalid images retain the text draft and make no provider call.
- Make answers scannable through hierarchy for plan/options, rationale, tips, warnings, sources, uncertainty, and next steps. Section chips only navigate within the answer and must not alter stored conversation data. Feedback remains lightweight and optional.
- Streaming is visibly pending only after context/source preparation begins, guards duplicate submission, announces completion politely, reconciles to persisted final content, and gives recoverable failure guidance without portraying partial output as saved.
- Meet WCAG 2.2 AA expectations: keyboard reachability, visible focus, logical reading order, `aria-current` for active workspace rows, labeled status in addition to color, polite live announcements, 44px mobile targets, reduced motion, focus restoration, and no sheet/dialog stack deeper than one level. Vietnamese diacritics must remain legible at 200% zoom and common mobile widths.
- Detail/source UI must expose only traveler-safe stored fields: label/title, type, URL and date when available, confidence, and freshness warnings. Never expose raw source material, operator-only fields, provider payloads, or unsupported controls; label web-derived content as external/unverified unless reviewed.

## Technical Decisions

- Keep `/` as the public entry and `/ai-ask` as the authenticated planning shell in the Next.js App Router. The AI Ask route remains server-authenticated and loads user-scoped shell data through Chat/Trips-owned server read functions.
- Conversation and trip-project selection are URL-owned. Terminal create, select, delete, project-switch, and stream states reconcile to the canonical URL/server shell. Clear stale, deleted, or unauthorized selections without exposing whether a private resource exists.
- Reuse one server-loaded shell model at every breakpoint. Client state is limited to draft input, attachment preview, request/streaming state, mobile sheet visibility, and selected detail descriptor; optimistic messages/list summaries are temporary only.
- Root UI foundations belong in `src/app/layout.tsx` and `src/app/globals.css`: Inter, Vietnamese document language, semantic white/stone/green/amber/teal/source tokens, base surfaces, focus treatment, and reduced-motion behavior. Reusable presentational primitives are data-free under `src/components/ui`; use one local typed SVG icon boundary and no competing feature-local icon systems.
- Preserve feature ownership. Chat/Trips owns conversation/project reads and mutations; Retrieval, Knowledge, Search, and AI Orchestration own source-backed/provenance detail. UI actions call their owning server command modules and do not mutate another aggregate directly.
- Source/confidence rendering uses stored assistant-response provenance and safe source snapshots, never parsed answer text. The assistant message and provenance remain the persisted source of truth.
- Render selectable details only from persisted descriptors of `source`, `warning`, `trip_fact`, `action`, `place`, `hotel_area`, `route_segment`, or `cost`. Do not infer entities from Vietnamese prose. Descriptors must be validated against the final persisted message and same-user/message/conversation provenance before source-backed details or actions resolve.
- Entity quick facts are bounded traveler-safe projections, not arbitrary snapshots: at most six `{ label, value }` pairs, each capped at 160 characters. Actions require a registered owning-feature command and a current-user, descriptor-bound server capability; reject unknown commands, label-only actions, client-derived routing, arbitrary target IDs, and cross-owner provenance.
- The inspector is a transient read model, not a new mutable aggregate. It is text/card based and must not create a Google Maps dependency.

## UX & Interaction Patterns

- Use a quiet white workspace with a flat pale-stone sidebar, borders rather than heavy shadows, restrained green/amber/teal semantics, and progressively disclosed provenance. Avoid a floating rounded app card, global graph-paper/map surface, decorative travel gradients, or color as a truth guarantee.
- Desktop active chat is edge-to-edge and viewport-height: 276px sidebar, central answer column capped near 760px, and conditional inspector around 380px. The empty desktop state has the sidebar and centered composer without inspector. Tablet may reduce the sidebar to a 74px rail and move detail below or into a sheet.
- Mobile uses a top bar, focus-managed navigation sheet, single-column chat, bottom-safe composer, and detail/source sheets. Selecting a conversation/project closes navigation and moves focus to the chat heading or composer. Desktop and mobile detail presentations share one selected-detail state; exactly one is interactive, while inactive duplicates are inert and hidden from assistive technology.
- The sidebar contains brand, `Trò chuyện mới`, grouped user-owned conversations, grouped user-owned trip projects, account/privacy access, and role-gated admin entry. Rows have visible active state and accessible actions that do not rely on hover. A selected project is visibly identified in the header or composer context indicator.
- The inspector opens from click, tap, or keyboard focus on a persisted descriptor and provides a semantic icon, Vietnamese title/summary, safe quick facts, related details, provenance chips, and only supported actions. It is absent with no selection, handles unavailable detail with a compact recovery state, closes with close control or `Esc`, and restores focus to its opener.

## Cross-Story Dependencies

- Implement in sequence: shared UI foundation (7.1), public entry (7.2), desktop shell (7.3), canonical responsive selection (7.4), composer and streaming feedback (7.5), answer hierarchy (7.6), then persisted responsive detail inspection (7.7).
- This epic depends on existing behavior from Epics 1-5: authentication and roles, user-owned conversations/projects and deletion, AI Ask/image/streaming behavior, structured answers, persisted provenance, and answer annotations. It consumes these contracts rather than redesigning their persistence or command ownership.
- Story 7.7 depends on the persisted annotation validator and safe server prompt/response schema. Extend and test that contract rather than adding client parsing or an independent entity model.
